import { z } from 'zod';
import { companyUpdateSchema, formatCents, formatRange, OPPORTUNITY_STATUSES } from '@autopix/shared';
import { conflict } from '../errors.js';
import { auditSourceFor } from '../finance/FinancialAuditService.js';

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

  // ------------------------------------------------------- AutoPix Pay
  const src = (ctx) => auditSourceFor(ctx.channel, ctx.actor);
  const txRef = z.object({ id });
  const txResult = async (ctx, txId) => (await s().transactions.get(txId, { companyId: ctx.company.id, isPlatformAdmin: ctx.user.isPlatformAdmin })).transaction;

  engine.register({
    name: 'CREATE_TRANSACTION',
    description: 'Cria um negócio no AutoPix Pay (valor calculado no servidor, comissão aplicada).',
    schema: z.object({
      type: z.enum(['SALES', 'FREIGHT', 'WORKFORCE', 'SERVICE']).optional(),
      referenceType: z.enum(['opportunity', 'freightMatch', 'workforceMatch']).optional().nullable(),
      referenceId: id.optional().nullable(),
      grossCents: money.optional(),
      description: z.string().trim().max(140).optional().nullable(),
      buyerEmail: z.string().trim().email().max(254).optional().nullable(),
      buyerName: z.string().trim().max(120).optional().nullable(),
    }),
    requiresActiveSubscription: true,
    summarize: (i) => (i.grossCents ? `Criar negócio de ${formatCents(i.grossCents)}` : 'Criar negócio'),
    handler: async (ctx, i) => ({ transaction: await s().transactions.create({ user: ctx.user, company: ctx.company, ...i }) }),
  });

  engine.register({
    name: 'CREATE_TRANSACTION_PIX',
    description: 'Gera (ou reutiliza) o Pix da transação. O valor vem da transação, nunca do cliente.',
    schema: txRef,
    requiresActiveSubscription: true,
    handler: async (ctx, { id: txId }) => ({ payment: await s().transactions.createPix({ user: ctx.user, company: ctx.company, id: txId }) }),
  });

  engine.register({
    name: 'CREATE_PIX',
    description: 'Cria uma cobrança AutoPix Pay (serviço) e gera o Pix.',
    schema: z.object({
      amountCents: money,
      description: z.string().trim().max(140).optional().nullable(),
      payerName: z.string().trim().max(120).optional().nullable(),
      payerEmail: z.string().trim().email().max(254).optional().nullable(),
    }),
    requiresActiveSubscription: true,
    summarize: (i) => `Gerar Pix de ${formatCents(i.amountCents)}`,
    inputDoc: { amountCents: 'integer, cents', description: 'optional', payerName: 'optional', payerEmail: 'optional' },
    handler: async (ctx, i) => {
      const transaction = await s().transactions.create({
        user: ctx.user,
        company: ctx.company,
        type: 'SERVICE',
        grossCents: i.amountCents,
        description: i.description,
        buyerName: i.payerName,
        buyerEmail: i.payerEmail,
      });
      const payment = await s().transactions.createPix({ user: ctx.user, company: ctx.company, id: transaction.id });
      return { transaction, payment };
    },
  });

  engine.register({
    name: 'START_SERVICE',
    description: 'Informa o início do serviço (após pagamento confirmado).',
    schema: txRef,
    handler: async (ctx, { id: txId }) => ({ transaction: await s().transactions.startService({ user: ctx.user, company: ctx.company, id: txId }) }),
  });

  engine.register({
    name: 'REPORT_COMPLETION',
    description: 'Prestador informa a conclusão do serviço.',
    schema: txRef,
    handler: async (ctx, { id: txId }) => ({ transaction: await s().transactions.reportCompletion({ user: ctx.user, company: ctx.company, id: txId }) }),
  });

  engine.register({
    name: 'REQUEST_RELEASE',
    description: 'Prestador pede ao cliente a confirmação para liberar o pagamento protegido.',
    schema: txRef,
    handler: async (ctx, { id: txId }) => ({ transaction: await s().transactions.requestRelease({ user: ctx.user, company: ctx.company, id: txId }) }),
  });

  engine.register({
    name: 'CONFIRM_COMPLETION',
    description: 'Cliente confirma a conclusão (não libera dinheiro por si só).',
    schema: txRef,
    channels: ['WEB', 'API'],
    handler: async (ctx, { id: txId }) => ({
      transaction: await s().protectedPayments.confirmCompletion({ user: ctx.user, company: ctx.company, id: txId, source: src(ctx), ip: ctx.meta?.ip }),
    }),
  });

  // Never from WhatsApp, never by an LLM: sensitive + step-up + web/app session only.
  engine.register({
    name: 'RELEASE_PAYMENT',
    description: 'Libera o pagamento protegido ao prestador pelo fluxo autorizado do parceiro financeiro.',
    schema: txRef,
    roles: ['OWNER'],
    channels: ['WEB', 'API'],
    sensitive: true,
    summarize: () => 'Liberar pagamento protegido ao prestador',
    handler: async (ctx, { id: txId }) => ({
      transaction: await s().protectedPayments.release({ user: ctx.user, company: ctx.company, id: txId, source: src(ctx), ip: ctx.meta?.ip }),
    }),
  });

  engine.register({
    name: 'REFUND_PAYMENT',
    description: 'Reembolsa (total ou parcial) um pagamento confirmado. Concluído só após confirmação do parceiro financeiro.',
    schema: z.object({ id, amountCents: money.optional(), reason: z.string().trim().max(300).optional() }),
    roles: ['OWNER'],
    channels: ['WEB', 'API'],
    sensitive: true,
    summarize: (i) => (i.amountCents ? `Reembolsar ${formatCents(i.amountCents)}` : 'Reembolsar o valor integral'),
    handler: async (ctx, i) => ({
      refund: await s().refunds.request({ user: ctx.user, company: ctx.company, transactionId: i.id, amountCents: i.amountCents, reason: i.reason, source: src(ctx), ip: ctx.meta?.ip }),
    }),
  });

  engine.register({
    name: 'OPEN_DISPUTE',
    description: 'Abre disputa e congela a liberação.',
    schema: z.object({ id, reason: z.string().trim().min(5).max(500), description: z.string().trim().max(2000).optional() }),
    channels: ['WEB', 'API'],
    handler: async (ctx, i) => ({
      dispute: await s().disputes.open({ user: ctx.user, company: ctx.company, id: i.id, reason: i.reason, description: i.description, source: src(ctx), ip: ctx.meta?.ip }),
    }),
  });

  engine.register({
    name: 'RESPOND_DISPUTE',
    description: 'Registra a manifestação de uma das partes na disputa.',
    schema: z.object({ id, message: z.string().trim().min(2).max(2000) }),
    channels: ['WEB', 'API'],
    handler: async (ctx, i) => ({ dispute: await s().disputes.respond({ user: ctx.user, company: ctx.company, disputeId: i.id, message: i.message, source: src(ctx) }) }),
  });

  // Human decision only (platform admin, step-up). AI may summarize, never decide.
  engine.register({
    name: 'RESOLVE_DISPUTE',
    description: 'Resolve uma disputa (administração da plataforma).',
    schema: z.object({ id, outcome: z.enum(['BUYER', 'SELLER', 'CANCEL']), note: z.string().trim().min(10).max(2000), refundAmountCents: money.optional() }),
    platformAdmin: true,
    channels: ['WEB', 'API'],
    sensitive: true,
    summarize: (i) => `Resolver disputa: ${{ BUYER: 'a favor do cliente (reembolso)', SELLER: 'a favor do prestador', CANCEL: 'encerrar sem decisão' }[i.outcome]}`,
    handler: async (ctx, i) => s().disputes.resolve({ admin: ctx.user, disputeId: i.id, outcome: i.outcome, note: i.note, refundAmountCents: i.refundAmountCents, ip: ctx.meta?.ip }),
  });

  engine.register({
    name: 'CANCEL_TRANSACTION',
    description: 'Cancela o negócio antes do pagamento.',
    schema: txRef,
    handler: async (ctx, { id: txId }) => ({ transaction: await s().transactions.cancel({ user: ctx.user, company: ctx.company, id: txId }) }),
  });

  // ------------------------------------------------------- freight trips
  const tripRef = z.object({ matchId: id });
  engine.register({
    name: 'CONSENT_TRIP_TRACKING',
    description: 'Autoriza o compartilhamento de localização apenas para esta viagem.',
    schema: tripRef,
    channels: ['WEB', 'API'],
    handler: async (ctx, { matchId }) => ({ match: await s().trips.consent({ user: ctx.user, company: ctx.company, matchId }) }),
  });
  engine.register({
    name: 'REVOKE_TRIP_TRACKING',
    description: 'Interrompe o compartilhamento de localização.',
    schema: tripRef,
    handler: async (ctx, { matchId }) => ({ match: await s().trips.revokeConsent({ company: ctx.company, matchId }) }),
  });
  engine.register({
    name: 'START_TRIP',
    description: 'Motorista a caminho da coleta.',
    schema: tripRef,
    handler: async (ctx, { matchId }) => ({ match: await s().trips.start({ user: ctx.user, company: ctx.company, matchId, source: src(ctx) }) }),
  });
  engine.register({
    name: 'MARK_CARGO_LOADED',
    description: 'Registra a carga carregada e inicia a viagem.',
    schema: tripRef,
    handler: async (ctx, { matchId }) => ({ match: await s().trips.markLoaded({ user: ctx.user, company: ctx.company, matchId, source: src(ctx) }) }),
  });
  engine.register({
    name: 'RECORD_LOCATION',
    description: 'Registra a localização do motorista (requer consentimento). Nunca libera pagamento.',
    kind: 'command',
    schema: z.object({ matchId: id, latitude: z.coerce.number(), longitude: z.coerce.number(), accuracyM: z.coerce.number().min(0).max(100_000).optional().nullable() }),
    channels: ['WEB', 'API'],
    handler: async (ctx, i) => s().trips.recordLocation({ user: ctx.user, company: ctx.company, ...i, source: ctx.actor?.client === 'pwa' ? 'PWA' : 'WEB' }),
  });
  engine.register({
    name: 'CONFIRM_DELIVERY',
    description: 'Cliente confirma a entrega do frete (não libera dinheiro por si só).',
    schema: txRef,
    channels: ['WEB', 'API'],
    handler: async (ctx, { id: txId }) => ({
      transaction: await s().trips.confirmDelivery({ user: ctx.user, company: ctx.company, transactionId: txId, source: src(ctx), ip: ctx.meta?.ip }),
    }),
  });

  // ---------------------------------------------------- platform admin
  engine.register({
    name: 'UPDATE_COMMISSION_RULE',
    description: 'Cria ou altera uma regra de comissão (administração).',
    schema: z.object({
      id: id.optional(),
      name: z.string().trim().min(3).max(80),
      transactionType: z.enum(['SALES', 'FREIGHT', 'WORKFORCE', 'SERVICE', 'SUBSCRIPTION']).optional().nullable(),
      companyId: id.optional().nullable(),
      rateBps: z.coerce.number().int().min(0).max(10_000),
      fixedAmountCents: z.coerce.number().int().min(0).max(1_000_000).default(0),
      minimumCents: z.coerce.number().int().min(0).optional().nullable(),
      maximumCents: z.coerce.number().int().min(0).optional().nullable(),
      priority: z.coerce.number().int().min(0).max(100).default(0),
      active: z.boolean().default(true),
    }),
    platformAdmin: true,
    channels: ['WEB', 'API'],
    sensitive: true,
    summarize: (i) => `Regra de comissão “${i.name}”: ${(i.rateBps / 100).toLocaleString('pt-BR')}%`,
    handler: async (ctx, i) => ({ rule: await s().commissions.upsert(i, { user: ctx.user, audit: s().audit, ip: ctx.meta?.ip }) }),
  });

  engine.register({
    name: 'RESOLVE_RECONCILIATION_ISSUE',
    description: 'Reconhece ou encerra uma divergência (anotação; não move dinheiro).',
    schema: z.object({ id, status: z.enum(['ACKNOWLEDGED', 'RESOLVED']), note: z.string().trim().max(2000).optional() }),
    platformAdmin: true,
    channels: ['WEB', 'API'],
    handler: async (ctx, i) => ({ issue: await s().admin.updateIssue(ctx.user, { ...i, ip: ctx.meta?.ip }) }),
  });

  engine.register({
    name: 'GET_TRANSACTION',
    description: 'Detalhe de uma transação AutoPix Pay.',
    kind: 'query',
    schema: txRef,
    handler: async (ctx, { id: txId }) => ({ transaction: await txResult(ctx, txId) }),
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
      await s().audit.log({ action: 'BANK_DESTINATION_CHANGED', source: auditSourceFor(ctx.channel, ctx.actor), userId: ctx.user.id, companyId: ctx.company.id, ip: ctx.meta?.ip, metadata: { pixKeyType, last4: pixKey.slice(-4) } });
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
    case 'START_SERVICE':
      return '🛠 Início do serviço registrado.';
    case 'REPORT_COMPLETION':
      return '✅ Conclusão informada. O cliente confirma no app AutoPix.';
    case 'REQUEST_RELEASE':
      return '📨 Pedido de liberação enviado ao cliente. A liberação é confirmada no app AutoPix.';
    case 'START_TRIP':
      return '🚚 Viagem registrada: a caminho da coleta.';
    case 'MARK_CARGO_LOADED':
      return '📦 Carga carregada. Viagem iniciada.';
    case 'GET_OPEN_PIPELINE_VALUE':
      return `💼 ${result.count} negócio(s) em aberto · potencial ${formatRange(result.min, result.max)}.`;
    default:
      return '✅ Feito.';
  }
}

export { conflict };
