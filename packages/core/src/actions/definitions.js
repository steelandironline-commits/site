import { z } from 'zod';
import { companyUpdateSchema, formatCents, formatRange, OPPORTUNITY_STATUSES } from '@autopix/shared';
import { conflict } from '../errors.js';

const id = z.string().trim().min(1).max(64);
const byId = z.object({ id });
const money = z.coerce.number().int().min(100).max(100_000_000); // cents

/**
 * Register every business action. Each handler delegates to a domain
 * service — no business rule lives in a client.
 */
export function registerCoreActions(engine) {
  const s = () => engine.services;

  // ------------------------------------------------------- opportunities
  const oppStatus = (name, status, description) =>
    engine.register({
      name,
      description,
      schema: byId,
      requiresActiveSubscription: false,
      inputDoc: { id: 'opportunity id' },
      handler: async (ctx, { id: oppId }) => ({
        opportunity: await s().opportunities.update(ctx.company.id, oppId, { status }, { userId: ctx.user.id, channel: ctx.channel }),
      }),
    });
  oppStatus('ANALYZE_OPPORTUNITY', 'RESEARCHING', 'Marca a oportunidade como em análise.');
  oppStatus('ARCHIVE_OPPORTUNITY', 'ARCHIVED', 'Descarta (arquiva) a oportunidade.');
  oppStatus('MARK_OPPORTUNITY_INTERESTED', 'INTERESTED', 'Marca a oportunidade como interessada.');

  engine.register({
    name: 'CONTACT_OPPORTUNITY',
    description: 'Inicia a abordagem: gera a sugestão (se necessário) e marca como “Em contato”.',
    schema: byId,
    inputDoc: { id: 'opportunity id' },
    handler: async (ctx, { id: oppId }) => {
      const current = await s().opportunities.get(ctx.company.id, oppId);
      const opportunity = await s().opportunities.update(
        ctx.company.id,
        oppId,
        { status: 'CONTACTED', generateApproach: !current.suggestedApproach },
        { userId: ctx.user.id, channel: ctx.channel },
      );
      return { opportunity };
    },
  });

  engine.register({
    name: 'SET_OPPORTUNITY_STATUS',
    description: 'Move a oportunidade no funil.',
    schema: z.object({ id, status: z.enum(OPPORTUNITY_STATUSES) }),
    inputDoc: { id: 'opportunity id', status: OPPORTUNITY_STATUSES.join('|') },
    handler: async (ctx, { id: oppId, status }) => ({
      opportunity: await s().opportunities.update(ctx.company.id, oppId, { status }, { userId: ctx.user.id, channel: ctx.channel }),
    }),
  });

  engine.register({
    name: 'UPDATE_OPPORTUNITY_NOTES',
    description: 'Atualiza as notas da oportunidade.',
    schema: z.object({ id, notes: z.union([z.string().max(10_000), z.null()]) }),
    channels: ['WEB', 'API'],
    handler: async (ctx, { id: oppId, notes }) => ({
      opportunity: await s().opportunities.update(ctx.company.id, oppId, { notes }, { userId: ctx.user.id, channel: ctx.channel }),
    }),
  });

  engine.register({
    name: 'GENERATE_APPROACH',
    description: 'Gera uma nova sugestão de abordagem comercial.',
    schema: byId,
    handler: async (ctx, { id: oppId }) => ({
      opportunity: await s().opportunities.update(ctx.company.id, oppId, { generateApproach: true }, { userId: ctx.user.id, channel: ctx.channel }),
    }),
  });

  // ------------------------------------------------------------- queries
  engine.register({
    name: 'LIST_TODAY_OPPORTUNITIES',
    description: 'Oportunidades criadas nas últimas 24 horas.',
    kind: 'query',
    schema: z.object({ limit: z.coerce.number().int().min(1).max(20).default(5) }),
    handler: async (ctx, { limit }) => {
      const since = new Date(Date.now() - 86_400_000);
      const where = { companyId: ctx.company.id, createdAt: { gte: since }, status: { not: 'ARCHIVED' } };
      const [items, total] = await Promise.all([
        ctx.prisma.opportunity.findMany({
          where,
          orderBy: { score: 'desc' },
          take: limit,
          select: { id: true, targetCompanyName: true, score: true, signal: true, estimatedMinValue: true, estimatedMaxValue: true, isDemo: true },
        }),
        ctx.prisma.opportunity.count({ where }),
      ]);
      return { total, items };
    },
  });

  engine.register({
    name: 'GET_OPEN_PIPELINE_VALUE',
    description: 'Valor potencial dos negócios em aberto.',
    kind: 'query',
    schema: z.object({}).passthrough(),
    handler: async (ctx) => {
      const open = ['NEW', 'RESEARCHING', 'CONTACTED', 'INTERESTED', 'PROPOSAL'];
      const agg = await ctx.prisma.opportunity.aggregate({
        where: { companyId: ctx.company.id, status: { in: open } },
        _sum: { estimatedMinValue: true, estimatedMaxValue: true },
        _count: true,
      });
      return { count: agg._count, min: agg._sum.estimatedMinValue ?? 0, max: agg._sum.estimatedMaxValue ?? 0 };
    },
  });

  // -------------------------------------------------------------- freight
  engine.register({
    name: 'CREATE_FREIGHT_REQUEST',
    description: 'Procura cargas para uma rota.',
    schema: z.object({
      origin: z.string().trim().min(2).max(80),
      destination: z.string().trim().min(2).max(80),
      date: z.string().datetime().optional().nullable(),
      cargo: z.string().trim().max(120).optional().nullable(),
    }),
    requiresActiveSubscription: true,
    summarize: (i) => `Buscar carga ${i.origin} → ${i.destination}`,
    handler: async (ctx, input) => s().freight.createRequest({ company: ctx.company, user: ctx.user, ...input }),
  });

  const freightMove = (name, to, from, eventType, title, description) =>
    engine.register({
      name,
      description,
      schema: byId,
      requiresActiveSubscription: true,
      handler: async (ctx, { id: matchId }) => ({
        match: await s().freight.transition({ companyId: ctx.company.id, userId: ctx.user.id, id: matchId, to, from, eventType, title }),
      }),
    });
  freightMove('ACCEPT_FREIGHT_MATCH', 'ACCEPTED', ['NEW'], 'FREIGHT_MATCH_UPDATED', 'Carga aceita', 'Aceita a carga compatível.');
  freightMove('REJECT_FREIGHT_MATCH', 'REJECTED', ['NEW'], 'FREIGHT_MATCH_UPDATED', 'Carga recusada', 'Recusa a carga compatível.');
  freightMove('MARK_DRIVER_ARRIVED', 'DRIVER_ARRIVED', ['ACCEPTED'], 'DRIVER_ARRIVED', 'Motorista chegou', 'Registra a chegada do motorista.');
  freightMove('COMPLETE_FREIGHT', 'COMPLETED', ['ACCEPTED', 'DRIVER_ARRIVED'], 'SERVICE_COMPLETED', 'Frete concluído', 'Conclui o frete.');

  // ------------------------------------------------------------ workforce
  engine.register({
    name: 'CREATE_WORKFORCE_DEMAND',
    description: 'Cria uma demanda de profissionais.',
    schema: z.object({
      role: z.string().trim().min(2).max(80),
      quantity: z.coerce.number().int().min(1).max(200),
      startDate: z.string().datetime().optional().nullable(),
      location: z.string().trim().max(120).optional().nullable(),
      notes: z.string().trim().max(1000).optional().nullable(),
    }),
    requiresActiveSubscription: true,
    summarize: (i) => `${i.quantity} × ${i.role}`,
    handler: async (ctx, input) => s().workforce.createDemand({ company: ctx.company, user: ctx.user, ...input }),
  });

  const workforceMove = (name, to, from, title, description) =>
    engine.register({
      name,
      description,
      schema: byId,
      requiresActiveSubscription: true,
      handler: async (ctx, { id: matchId }) => ({
        match: await s().workforce.transition({ companyId: ctx.company.id, userId: ctx.user.id, id: matchId, to, from, title }),
      }),
    });
  workforceMove('INVITE_PROFESSIONAL', 'INVITED', ['SUGGESTED', 'DECLINED'], 'Profissional convidado', 'Convida o profissional.');
  workforceMove('REJECT_PROFESSIONAL', 'DECLINED', ['SUGGESTED', 'INVITED'], 'Profissional recusado', 'Recusa o profissional.');
  workforceMove('COMPLETE_WORKFORCE_SERVICE', 'COMPLETED', ['INVITED', 'ACCEPTED'], 'Serviço concluído', 'Conclui o serviço do profissional.');

  // ------------------------------------------------------------- payments
  engine.register({
    name: 'CREATE_SUBSCRIPTION_PIX',
    description: 'Gera (ou reutiliza) o Pix da assinatura AutoPix.',
    schema: z.object({}).passthrough(),
    channels: ['WEB', 'API'],
    allowOnboarding: true,
    handler: async (ctx) => ({ payment: await s().payments.createPixCharge({ user: ctx.user, company: ctx.company }) }),
  });

  engine.register({
    name: 'CREATE_PIX',
    description: 'Gera uma cobrança Pix protegida.',
    schema: z.object({
      amountCents: money,
      description: z.string().trim().max(140).optional().nullable(),
      payerName: z.string().trim().max(120).optional().nullable(),
      payerDocument: z.string().trim().max(20).optional().nullable(),
      payerEmail: z.string().trim().email().max(254).optional().nullable(),
      relatedType: z.enum(['opportunity', 'freightMatch', 'workforceMatch']).optional().nullable(),
      relatedId: id.optional().nullable(),
    }),
    requiresActiveSubscription: true,
    summarize: (i) => `Gerar Pix de ${formatCents(i.amountCents)}`,
    inputDoc: { amountCents: 'integer, cents', description: 'optional', payerName: 'optional', payerDocument: 'CPF/CNPJ, optional' },
    handler: async (ctx, i) => ({
      payment: await s().payments.createCharge({
        user: ctx.user,
        company: ctx.company,
        amountCents: i.amountCents,
        description: i.description,
        payer: { name: i.payerName, document: i.payerDocument ? i.payerDocument.replace(/\D/g, '') : null, email: i.payerEmail },
        relatedType: i.relatedType,
        relatedId: i.relatedId,
      }),
    }),
  });

  engine.register({
    name: 'REQUEST_PAYMENT_RELEASE',
    description: 'Solicita a liberação de um pagamento protegido (serviço concluído).',
    schema: z.object({ id, reason: z.string().trim().max(300).optional() }),
    requiresActiveSubscription: true,
    handler: async (ctx, { id: paymentId, reason }) => ({
      payment: await s().payments.requestRelease({ companyId: ctx.company.id, userId: ctx.user.id, paymentId, reason }),
    }),
  });

  engine.register({
    name: 'RELEASE_PAYMENT',
    description: 'Libera os fundos protegidos para a chave Pix da empresa.',
    schema: byId,
    roles: ['OWNER'],
    sensitive: true,
    requiresActiveSubscription: true,
    summarize: () => 'Liberar pagamento protegido para a sua chave Pix',
    handler: async (ctx, { id: paymentId }) => ({ payment: await s().payments.release({ company: ctx.company, userId: ctx.user.id, paymentId }) }),
  });

  engine.register({
    name: 'REFUND_PAYMENT',
    description: 'Estorna uma cobrança confirmada.',
    schema: byId,
    roles: ['OWNER'],
    sensitive: true,
    summarize: () => 'Estornar pagamento',
    handler: async (ctx, { id: paymentId }) => ({ payment: await s().payments.refund({ companyId: ctx.company.id, userId: ctx.user.id, paymentId }) }),
  });

  engine.register({
    name: 'OPEN_DISPUTE',
    description: 'Abre disputa e congela a liberação de um pagamento protegido.',
    schema: z.object({ id, reason: z.string().trim().min(5).max(500) }),
    handler: async (ctx, { id: paymentId, reason }) => ({
      payment: await s().payments.openDispute({ companyId: ctx.company.id, userId: ctx.user.id, paymentId, reason }),
    }),
  });

  engine.register({
    name: 'CHANGE_BANK_DETAILS',
    description: 'Altera a chave Pix de recebimento da empresa.',
    schema: z.object({
      pixKey: z.string().trim().min(5).max(140),
      pixKeyType: z.enum(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP']),
    }),
    roles: ['OWNER'],
    channels: ['WEB', 'API'],
    sensitive: true,
    summarize: (i) => `Alterar chave Pix de recebimento (${i.pixKeyType})`,
    handler: async (ctx, { pixKey, pixKeyType }) => {
      await ctx.prisma.company.update({ where: { id: ctx.company.id }, data: { payoutPixKey: pixKey, payoutPixKeyType: pixKeyType } });
      await ctx.events.activity.record({
        companyId: ctx.company.id,
        userId: ctx.user.id,
        type: 'SYSTEM',
        title: 'Chave Pix de recebimento alterada',
        description: `Tipo ${pixKeyType}, terminando em ${pixKey.slice(-4)}.`,
        source: 'security',
        severity: 'WARNING',
      });
      return { payoutPixKeyType: pixKeyType, payoutPixKeyLast4: pixKey.slice(-4) };
    },
  });

  // --------------------------------------------------------------- agents
  engine.register({
    name: 'START_AGENT',
    description: 'Ativa os agentes e solicita um novo ciclo de busca.',
    schema: z.object({}).passthrough(),
    requiresActiveSubscription: true,
    handler: async (ctx) => {
      const wasPaused = ctx.company.agentsPaused;
      if (wasPaused) await ctx.prisma.company.update({ where: { id: ctx.company.id }, data: { agentsPaused: false } });
      const { job, created } = await s().queue.enqueue(ctx.company.id, { trigger: 'MANUAL', isDemo: ctx.config.demoMode });
      await ctx.events.publish({
        type: 'AGENTS_STARTED',
        companyId: ctx.company.id,
        userId: ctx.user.id,
        aggregateType: 'company',
        aggregateId: ctx.company.id,
        activity: created
          ? { type: 'SYSTEM', title: wasPaused ? 'Agentes retomados' : 'Busca manual solicitada', description: 'Os agentes vão iniciar um novo ciclo em instantes.', source: 'user' }
          : null,
      });
      return { job: { id: job.id, status: job.status }, created, resumed: wasPaused };
    },
  });

  engine.register({
    name: 'PAUSE_AGENT',
    description: 'Pausa os agentes (nenhuma nova busca até retomar).',
    schema: z.object({}).passthrough(),
    roles: ['OWNER', 'ADMIN'],
    handler: async (ctx) => {
      if (ctx.company.agentsPaused) return { paused: true };
      await ctx.prisma.company.update({ where: { id: ctx.company.id }, data: { agentsPaused: true } });
      await ctx.prisma.searchJob.updateMany({ where: { companyId: ctx.company.id, status: 'QUEUED' }, data: { status: 'CANCELED' } });
      await ctx.events.publish({
        type: 'AGENTS_PAUSED',
        companyId: ctx.company.id,
        userId: ctx.user.id,
        aggregateType: 'company',
        aggregateId: ctx.company.id,
        activity: { type: 'SYSTEM', title: 'Agentes pausados', description: 'Retome quando quiser em Agentes.', source: 'user', severity: 'WARNING' },
      });
      return { paused: true };
    },
  });

  // --------------------------------------------------- company / account
  engine.register({
    name: 'UPDATE_COMPANY_PROFILE',
    description: 'Atualiza o perfil comercial (influencia as próximas buscas).',
    schema: companyUpdateSchema,
    roles: ['OWNER', 'ADMIN'],
    channels: ['WEB', 'API'],
    handler: async (ctx, data) => s().companies.update(ctx.company.id, data, { userId: ctx.user.id }),
  });

  engine.register({
    name: 'CANCEL_SUBSCRIPTION',
    description: 'Cancela a assinatura ao fim do período.',
    schema: z.object({}).passthrough(),
    roles: ['OWNER'],
    channels: ['WEB', 'API'],
    handler: async (ctx) => ({ subscription: await s().subscriptions.cancel(ctx.company.id, ctx.user.id) }),
  });

  engine.register({
    name: 'RESUME_SUBSCRIPTION',
    description: 'Desfaz o cancelamento agendado.',
    schema: z.object({}).passthrough(),
    roles: ['OWNER'],
    channels: ['WEB', 'API'],
    handler: async (ctx) => ({ subscription: await s().subscriptions.resume(ctx.company.id, ctx.user.id) }),
  });

  return engine;
}

/** Short human text for an action result (WhatsApp and other text clients). */
export function describeResult(action, result) {
  switch (action) {
    case 'ANALYZE_OPPORTUNITY':
      return `🔎 ${result.opportunity.targetCompanyName} marcada como em análise.`;
    case 'CONTACT_OPPORTUNITY':
      return `✅ ${result.opportunity.targetCompanyName} marcada como “Em contato”. A abordagem sugerida está no app.`;
    case 'ARCHIVE_OPPORTUNITY':
      return `🗂 ${result.opportunity.targetCompanyName} descartada.`;
    case 'MARK_OPPORTUNITY_INTERESTED':
      return `⭐ ${result.opportunity.targetCompanyName} marcada como interessada.`;
    case 'ACCEPT_FREIGHT_MATCH':
      return `✅ Carga aceita: ${result.match.origin} → ${result.match.destination}.`;
    case 'REJECT_FREIGHT_MATCH':
      return '❌ Carga recusada.';
    case 'INVITE_PROFESSIONAL':
      return `✅ Convite registrado para ${result.match.professionalName}.`;
    case 'REJECT_PROFESSIONAL':
      return '❌ Profissional recusado.';
    case 'CREATE_FREIGHT_REQUEST':
      return result.matches.length
        ? `🚚 Busca criada. ${result.matches.length} carga(s) compatível(is) encontrada(s).`
        : '🚚 Busca de carga criada. Avisaremos quando houver cargas compatíveis.';
    case 'CREATE_WORKFORCE_DEMAND':
      return result.matches.length
        ? `👷 Demanda criada. ${result.matches.length} profissional(is) compatível(is).`
        : '👷 Demanda criada. Avisaremos quando houver profissionais compatíveis.';
    case 'GET_OPEN_PIPELINE_VALUE':
      return `💼 ${result.count} negócio(s) em aberto · potencial ${formatRange(result.min, result.max)}.`;
    default:
      return '✅ Feito.';
  }
}

export { conflict };
