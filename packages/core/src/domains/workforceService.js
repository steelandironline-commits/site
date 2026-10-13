import { deepLinks, formatCents } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { badRequest, conflict, notFound, unavailable } from '../errors.js';

/** WorkforceSource contract: find(demand) → [{professionalName, role, city, experienceYears, rating}] */
export class DemoWorkforceSource {
  name = 'demo';
  async find(demand) {
    const names = ['Profissional Alfa (DEMO)', 'Profissional Beta (DEMO)', 'Profissional Gama (DEMO)', 'Profissional Delta (DEMO)'];
    return names.slice(0, Math.min(names.length, demand.quantity + 1)).map((n, i) => ({
      professionalName: n,
      role: demand.role,
      city: demand.location || null,
      experienceYears: 3 + i * 2,
      rating: Number((4.9 - i * 0.2).toFixed(1)),
    }));
  }
}

export class WorkforceService {
  constructor({ prisma = getPrisma(), config = getConfig(), events, sources, payments, refunds, email, audit } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.events = events;
    this.payments = payments;
    this.refunds = refunds;
    this.email = email;
    this.audit = audit;
    this.sources = sources ?? (config.demoMode ? [new DemoWorkforceSource()] : []);
  }

  async createDemand({ company, user, role, quantity, startDate, location, notes }) {
    const isDemo = this.config.demoMode;
    const demand = await this.prisma.workforceDemand.create({
      data: {
        companyId: company.id,
        role,
        quantity,
        startDate: startDate ? new Date(startDate) : null,
        location: location || [company.city, company.state].filter(Boolean).join(' - ') || null,
        notes: notes || null,
        isDemo,
      },
    });
    await this.events.publish({
      type: 'WORKFORCE_DEMAND_CREATED',
      companyId: company.id,
      userId: user.id,
      aggregateType: 'workforceDemand',
      aggregateId: demand.id,
      isDemo,
      payload: { role, quantity },
      activity: {
        type: 'SEARCH',
        title: `Demanda: ${quantity} × ${role}`,
        description: this.sources.length ? 'Procurando profissionais compatíveis.' : 'Nenhuma fonte de profissionais configurada ainda.',
        source: 'Workforce',
      },
    });
    const matches = [];
    for (const source of this.sources) {
      for (const p of await source.find(demand)) {
        const match = await this.prisma.workforceMatch.create({
          data: { ...p, companyId: company.id, demandId: demand.id, source: source.name, isDemo },
        });
        matches.push(match);
        await this.events.publish({
          type: 'WORKFORCE_MATCH_CREATED',
          companyId: company.id,
          aggregateType: 'workforceMatch',
          aggregateId: match.id,
          isDemo,
          payload: { role: match.role, link: deepLinks.workforceMatch(match.id) },
          activity: {
            type: 'OPPORTUNITY',
            title: 'Profissional compatível',
            description: `${match.professionalName} · ${match.role}`,
            source: source.name === 'demo' ? 'Fonte DEMO' : source.name,
          },
        });
      }
    }
    return { demand, matches };
  }

  async list(companyId) {
    return this.prisma.workforceDemand.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { matches: { orderBy: { rating: 'desc' } } },
    });
  }

  async getMatch(companyId, id) {
    const m = await this.prisma.workforceMatch.findFirst({ where: { id, companyId }, include: { demand: true } });
    if (!m) throw notFound('Profissional não encontrado.');
    const paymentSelect = { id: true, status: true, amountCents: true, expiresAt: true, paidAt: true };
    const [interviewPayment, hiringPayment] = await Promise.all([
      this.prisma.payment.findFirst({
        where: { companyId, kind: 'INTERVIEW_FEE', relatedId: id, relatedType: { startsWith: 'WORKFORCE_INTERVIEW' } },
        orderBy: { createdAt: 'desc' },
        select: paymentSelect,
      }),
      this.prisma.payment.findFirst({
        where: { companyId, kind: 'HIRING_FEE', relatedId: id, relatedType: { startsWith: 'WORKFORCE_HIRE' } },
        orderBy: { createdAt: 'desc' },
        select: paymentSelect,
      }),
    ]);
    return { ...m, interviewPayment, hiringPayment };
  }

  async transition({ companyId, userId, id, to, from, title }) {
    const m = await this.getMatch(companyId, id);
    if (!from.includes(m.status)) {
      if (m.status === to) return m;
      throw conflict('Este profissional não está disponível para esta ação.');
    }
    const updated = await this.prisma.workforceMatch.update({ where: { id }, data: { status: to } });
    await this.events.publish({
      type: to === 'COMPLETED' ? 'SERVICE_COMPLETED' : 'WORKFORCE_MATCH_UPDATED',
      companyId,
      userId,
      aggregateType: 'workforceMatch',
      aggregateId: id,
      isDemo: m.isDemo,
      payload: { status: to, link: deepLinks.workforceMatch(id) },
      activity: { type: 'OPPORTUNITY', title, description: `${m.professionalName} · ${m.role}`, source: 'Workforce' },
    });
    return updated;
  }

  async scheduleInterview({ company, user, id, interviewAt, candidateEmail }) {
    const match = await this.getMatch(company.id, id);
    if (match.isDemo) throw conflict('Cobranças não podem ser geradas para candidatos DEMO.');
    if (!['INVITED', 'ACCEPTED'].includes(match.status)) throw conflict('Convide o profissional antes de marcar a entrevista.');
    if (match.interviewCanceledAt) throw conflict('Esta entrevista foi cancelada.');
    if (!this.payments) throw unavailable('Cobranças Pix indisponíveis no momento.');
    const scheduledAt = new Date(interviewAt);
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt <= new Date()) throw badRequest('Escolha uma data futura para a entrevista.');
    const emailAddress = String(candidateEmail || '').trim().toLowerCase();
    const payment = await this.payments.createWorkforceFeeCharge({
      kind: 'INTERVIEW_FEE',
      user,
      company,
      matchId: match.id,
      amountCents: 100,
      payer: { name: company.name, email: user.email, cnpj: company.cnpj },
      description: `Taxa de agendamento de entrevista · ${match.role}`,
    });
    const updated = await this.prisma.workforceMatch.update({
      where: { id: match.id },
      data: {
        interviewScheduledAt: scheduledAt,
        interviewCandidateEmail: emailAddress,
        ...(payment.status === 'CONFIRMED' && !match.interviewFeePaidAt ? { interviewFeePaidAt: payment.paidAt || new Date() } : {}),
      },
    });
    const emailSent = Boolean(await this.email?.workforceInterviewEmail({
      to: emailAddress,
      name: match.professionalName,
      role: match.role,
      interviewAt: scheduledAt,
    }).catch(() => false));
    await this.events.publish({
      type: 'WORKFORCE_INTERVIEW_SCHEDULED',
      companyId: company.id,
      userId: user.id,
      aggregateType: 'workforceMatch',
      aggregateId: match.id,
      isDemo: false,
      payload: { interviewAt: scheduledAt, paymentId: payment.id },
      activity: {
        type: 'OPPORTUNITY',
        title: 'Entrevista marcada',
        description: `${match.professionalName} · ${match.role} · taxa de agendamento de R$ 1,00 paga pela empresa.`,
        source: 'Workforce',
      },
    });
    await this.audit?.log({ action: 'WORKFORCE_INTERVIEW_SCHEDULED', source: 'WEB', userId: user.id, companyId: company.id, paymentId: payment.id, metadata: { matchId: match.id, interviewAt: scheduledAt, candidateEmail: emailAddress, emailSent } });
    return { match: updated, payment, candidateEmailSent: emailSent };
  }

  async agreeHire({ company, user, id, agreedSalaryCents }) {
    const match = await this.getMatch(company.id, id);
    if (match.isDemo) throw conflict('Cobranças não podem ser geradas para candidatos DEMO.');
    if (!['INVITED', 'ACCEPTED'].includes(match.status)) throw conflict('Convide o profissional antes de registrar a contratação.');
    if (match.interviewCanceledAt) throw conflict('Não é possível contratar após cancelar a entrevista.');
    if (match.agreedSalaryCents !== null && match.agreedSalaryCents !== agreedSalaryCents) {
      throw conflict('O salário acordado já foi registrado e não pode ser alterado após a cobrança.');
    }
    if (!this.payments) throw unavailable('Cobranças Pix indisponíveis no momento.');
    const feeCents = Math.max(1, Math.round((agreedSalaryCents * 300) / 10_000));
    const payment = await this.payments.createWorkforceFeeCharge({
      kind: 'HIRING_FEE',
      user,
      company,
      matchId: match.id,
      amountCents: feeCents,
      payer: { name: user.name, email: user.email, cnpj: company.cnpj },
      description: `Taxa TemPix de contratação · ${match.role} · salário acordado ${formatCents(agreedSalaryCents)}`,
    });
    const updated = await this.prisma.workforceMatch.update({
      where: { id: match.id },
      data: {
        agreedSalaryCents,
        ...(payment.status === 'CONFIRMED' && !match.hiringFeePaidAt ? { hiringFeePaidAt: payment.paidAt || new Date() } : {}),
      },
    });
    await this.events.publish({
      type: 'WORKFORCE_HIRE_AGREED',
      companyId: company.id,
      userId: user.id,
      aggregateType: 'workforceMatch',
      aggregateId: match.id,
      isDemo: false,
      payload: { salaryCents: agreedSalaryCents, feeCents, paymentId: payment.id },
      activity: {
        type: 'PAYMENT',
        title: 'Contratação registrada',
        description: `${match.professionalName} · ${formatCents(agreedSalaryCents)} · taxa de 3%: ${formatCents(feeCents)}.`,
        source: 'Workforce',
      },
    });
    await this.audit?.log({ action: 'WORKFORCE_HIRE_AGREED', source: 'WEB', userId: user.id, companyId: company.id, paymentId: payment.id, metadata: { matchId: match.id, salaryCents: agreedSalaryCents, feeCents } });
    return { match: updated, payment, salaryCents: agreedSalaryCents, feeCents };
  }

  async cancelInterview({ company, user, id }) {
    const match = await this.getMatch(company.id, id);
    if (match.isDemo) throw conflict('Candidatos DEMO não podem ter cobranças ou reembolsos.');
    if (!match.interviewScheduledAt || match.interviewCanceledAt) throw conflict('Não há entrevista ativa para cancelar.');
    const payment = await this.prisma.payment.findFirst({
      where: { companyId: company.id, kind: 'INTERVIEW_FEE', relatedId: match.id, relatedType: { startsWith: 'WORKFORCE_INTERVIEW' } },
      orderBy: { createdAt: 'desc' },
    });
    let refund = null;
    if (payment?.status === 'CONFIRMED' && payment.refundedCents < payment.amountCents) {
      if (!this.refunds) throw unavailable('Reembolso Pix indisponível no momento.');
      refund = await this.refunds.request({ user, company, paymentId: payment.id, reason: 'Empresa cancelou a entrevista.', source: 'WEB' });
    } else if (payment?.status === 'PENDING') {
      if (!payment.providerPaymentId) throw conflict('O Pix está sendo gerado. Aguarde um instante e tente cancelar novamente.');
      const provider = this.payments?.provider(payment.provider);
      if (typeof provider?.cancelPixCharge !== 'function') {
        throw conflict('Este Pix ainda está aberto. Aguarde o vencimento para cancelar a entrevista com segurança.');
      }
      await provider.cancelPixCharge(payment.providerPaymentId);
      await this.prisma.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'CANCELED' } });
    }
    const updated = await this.prisma.workforceMatch.update({ where: { id: match.id }, data: { interviewCanceledAt: new Date() } });
    await this.events.publish({
      type: 'WORKFORCE_INTERVIEW_CANCELED',
      companyId: company.id,
      userId: user.id,
      aggregateType: 'workforceMatch',
      aggregateId: match.id,
      isDemo: false,
      payload: { paymentId: payment?.id ?? null, refundId: refund?.id ?? null },
      activity: { type: 'OPPORTUNITY', title: 'Entrevista cancelada', description: `${match.professionalName} · ${match.role}.`, source: 'Workforce', severity: 'WARNING' },
    });
    await this.audit?.log({ action: 'WORKFORCE_INTERVIEW_CANCELED', source: 'WEB', userId: user.id, companyId: company.id, paymentId: payment?.id ?? null, metadata: { matchId: match.id, refundId: refund?.id ?? null } });
    return { match: updated, refund };
  }
}
