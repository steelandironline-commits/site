import { formatCents } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { getPaymentProvider } from '../payments/index.js';

export const TX_TITLES = {
  CREATED: 'Negócio criado',
  COMMISSION: 'Comissão calculada',
  PIX_CREATED: 'Pix gerado',
  PIX_EXPIRED: 'Pix expirado',
  PAYMENT_RECEIVED: 'Pagamento recebido',
  PROTECTED: 'Pagamento protegido',
  SERVICE_STARTED: 'Serviço iniciado',
  SELLER_COMPLETED: 'Prestador informou conclusão',
  AWAITING_BUYER: 'Aguardando confirmação do cliente',
  BUYER_CONFIRMED: 'Cliente confirmou a conclusão',
  RELEASE_REQUESTED: 'Liberação solicitada',
  READY_TO_RELEASE: 'Pronto para liberação',
  RELEASED: 'Pagamento liberado',
  SETTLEMENT_PENDING: 'Repasse aguardando capacidade do parceiro financeiro',
  REFUND_REQUESTED: 'Reembolso solicitado',
  REFUNDED: 'Reembolso concluído',
  DISPUTED: 'Disputa aberta',
  DISPUTE_RESOLVED: 'Disputa resolvida',
  CANCELLED: 'Negócio cancelado',
  TRIP: 'Atualização do transporte',
  FINISHED: 'Finalizado',
};

const LIST_SELECT = {
  id: true,
  type: true,
  status: true,
  description: true,
  sellerCompanyId: true,
  buyerCompanyId: true,
  buyerName: true,
  referenceType: true,
  referenceId: true,
  grossAmount: true,
  commissionAmount: true,
  sellerNetAmount: true,
  protectedFlow: true,
  settlementStatus: true,
  isSandbox: true,
  isDemo: true,
  createdAt: true,
  updatedAt: true,
  payment: { select: { id: true, status: true, provider: true, expiresAt: true } },
};

/**
 * MarketplaceTransactionService — AutoPix Pay's provider-independent core.
 * Amounts are always computed server-side (reference price or the seller's
 * agreed deal value), never taken from a client at payment time.
 */
export class MarketplaceTransactionService {
  constructor({ prisma = getPrisma(), config = getConfig(), events, commissions, audit, payments, providerFactory = getPaymentProvider } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.events = events;
    this.commissions = commissions;
    this.audit = audit;
    this.payments = payments;
    this.providerFactory = providerFactory;
  }

  provider() {
    return this.providerFactory(this.config.payment.provider, this.config);
  }

  capabilities() {
    const p = this.provider();
    const { capabilities, reasons } = p.getCapabilities();
    return { provider: p.name, label: p.label, sandbox: Boolean(p.isSandbox), capabilities, reasons };
  }

  roleOf(t, companyId) {
    if (t.sellerCompanyId === companyId) return 'SELLER';
    if (t.buyerCompanyId && t.buyerCompanyId === companyId) return 'BUYER';
    return null;
  }

  async load(id, companyId, { tx = this.prisma } = {}) {
    const t = await tx.marketplaceTransaction.findUnique({ where: { id }, include: { payment: true } });
    if (!t || !this.roleOf(t, companyId)) throw notFound('Transação não encontrada.');
    return t;
  }

  async timeline(transactionId, entry, tx = this.prisma) {
    return tx.transactionEvent.create({
      data: { transactionId, type: entry.type, title: entry.title || TX_TITLES[entry.type] || entry.type, actorUserId: entry.actorUserId || null, metadata: entry.metadata ?? undefined },
    });
  }

  /** Publish an event to the seller and (when on the platform) the buyer. */
  async publishBoth(t, event, tx = this.prisma, { buyerActivity, sellerActivity } = {}) {
    await this.events.publish(
      { ...event, companyId: t.sellerCompanyId, aggregateType: 'transaction', aggregateId: t.id, isDemo: t.isDemo, payload: { ...(event.payload || {}), audience: 'SELLER' }, activity: sellerActivity ?? event.activity },
      tx,
    );
    if (t.buyerCompanyId) {
      await this.events.publish(
        { ...event, companyId: t.buyerCompanyId, userId: null, aggregateType: 'transaction', aggregateId: t.id, isDemo: t.isDemo, payload: { ...(event.payload || {}), audience: 'BUYER' }, activity: buyerActivity ?? event.activity },
        tx,
      );
    }
  }

  // ---------------------------------------------------------------- create

  async #resolveAmount({ company, referenceType, referenceId, grossCents }) {
    if (referenceType === 'freightMatch') {
      const m = await this.prisma.freightMatch.findFirst({ where: { id: referenceId, companyId: company.id } });
      if (!m) throw notFound('Carga não encontrada.');
      if (!['ACCEPTED', 'DRIVER_ARRIVED'].includes(m.status)) throw conflict('Aceite a carga antes de cobrar o frete.');
      if (!m.price) throw badRequest('Esta carga não tem valor de frete definido.');
      return { grossCents: m.price * 100, type: 'FREIGHT', isDemo: m.isDemo, label: `Frete ${m.origin} → ${m.destination}` };
    }
    if (referenceType === 'workforceMatch') {
      const m = await this.prisma.workforceMatch.findFirst({ where: { id: referenceId, companyId: company.id } });
      if (!m) throw notFound('Profissional não encontrado.');
      if (!grossCents) throw badRequest('Informe o valor acordado do serviço.');
      return { grossCents, type: 'WORKFORCE', isDemo: m.isDemo, label: `${m.role} — ${m.professionalName}` };
    }
    if (referenceType === 'opportunity') {
      const o = await this.prisma.opportunity.findFirst({ where: { id: referenceId, companyId: company.id } });
      if (!o) throw notFound('Oportunidade não encontrada.');
      if (!grossCents) throw badRequest('Informe o valor fechado do negócio.');
      return { grossCents, type: 'SALES', isDemo: o.isDemo, label: `Venda — ${o.targetCompanyName}` };
    }
    if (!grossCents) throw badRequest('Informe o valor.');
    return { grossCents, type: 'SERVICE', isDemo: false, label: null };
  }

  async create({ user, company, type, referenceType = null, referenceId = null, grossCents, description, buyerEmail, buyerName }) {
    const resolved = await this.#resolveAmount({ company, referenceType, referenceId, grossCents });
    const txType = type || resolved.type;
    let buyerUser = null;
    if (buyerEmail) {
      buyerUser = await this.prisma.user.findUnique({ where: { email: buyerEmail.toLowerCase() } });
      if (buyerUser?.companyId === company.id) throw badRequest('O comprador não pode ser a sua própria empresa.');
      if (buyerUser && buyerUser.status !== 'ACTIVE') buyerUser = null;
    }
    const quote = await this.commissions.quote({ transactionType: txType, companyId: company.id, grossCents: resolved.grossCents });
    const caps = this.capabilities();
    // Protection requires provider support AND a buyer on the platform who can confirm.
    const protectedFlow = Boolean(caps.capabilities.protectedFlow && buyerUser);

    return this.prisma.$transaction(async (tx) => {
      const t = await tx.marketplaceTransaction.create({
        data: {
          type: txType,
          status: 'DRAFT',
          description: description || resolved.label || 'Serviço',
          sellerCompanyId: company.id,
          sellerUserId: user.id,
          buyerCompanyId: buyerUser?.companyId ?? null,
          buyerUserId: buyerUser?.id ?? null,
          buyerName: buyerName || buyerUser?.name || null,
          buyerEmail: buyerEmail ? buyerEmail.toLowerCase() : null,
          referenceType,
          referenceId,
          grossAmount: quote.grossCents,
          commissionAmount: quote.commissionCents,
          sellerNetAmount: quote.sellerNetCents,
          commissionRuleId: quote.ruleId,
          commissionRateBps: quote.rateBps,
          protectedFlow,
          isSandbox: caps.sandbox,
          isDemo: resolved.isDemo || this.config.demoMode,
        },
      });
      await this.timeline(t.id, { type: 'CREATED', actorUserId: user.id, metadata: { gross: t.grossAmount } }, tx);
      await this.timeline(
        t.id,
        { type: 'COMMISSION', title: `Comissão AutoPix: ${formatCents(t.commissionAmount)} (${(t.commissionRateBps / 100).toLocaleString('pt-BR')}%)`, metadata: { ruleId: quote.ruleId } },
        tx,
      );
      await this.publishBoth(t, {
        type: 'TRANSACTION_CREATED',
        userId: user.id,
        payload: { gross: t.grossAmount, commission: t.commissionAmount, net: t.sellerNetAmount, link: `/app/pay/transactions/${t.id}` },
        activity: { type: 'PAYMENT', title: `Negócio criado · ${formatCents(t.grossAmount)}`, description: `${t.description} · comissão ${formatCents(t.commissionAmount)}`, source: 'AutoPix Pay' },
      }, tx);
      await this.audit.log({ action: 'TRANSACTION_CREATED', source: 'SYSTEM', userId: user.id, companyId: company.id, transactionId: t.id, metadata: { gross: t.grossAmount, commission: t.commissionAmount, rateBps: t.commissionRateBps, protectedFlow } }, tx);
      return t;
    });
  }

  // ------------------------------------------------------------------ Pix

  async createPix({ user, company, id }) {
    const t = await this.load(id, company.id);
    if (this.roleOf(t, company.id) !== 'SELLER') throw forbidden('Apenas o vendedor gera a cobrança.');
    if (!['DRAFT', 'AWAITING_PAYMENT'].includes(t.status)) throw conflict('Esta transação não aceita nova cobrança.');
    // Reuse a live pending charge; detach an expired/failed one.
    if (t.payment) {
      if (t.payment.status === 'PENDING' && (!t.payment.expiresAt || t.payment.expiresAt > new Date())) {
        return this.payments.getPayment(t.payment.id, company.id);
      }
      if (t.payment.status === 'CONFIRMED') throw conflict('Esta transação já foi paga.');
      await this.prisma.payment.update({ where: { id: t.payment.id }, data: { transactionId: null, metadata: { ...(t.payment.metadata || {}), detachedFromTransaction: t.id } } });
    }
    const payment = await this.payments.createCharge({
      user,
      company,
      amountCents: t.grossAmount, // server-side amount
      description: t.description,
      payer: { name: t.buyerName, email: t.buyerEmail },
      transactionId: t.id,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.marketplaceTransaction.update({ where: { id: t.id }, data: { status: 'AWAITING_PAYMENT' } });
      await this.timeline(t.id, { type: 'PIX_CREATED', actorUserId: user.id, metadata: { paymentId: payment.id } }, tx);
    });
    return payment;
  }

  // --------------------------------------------------- lifecycle (seller)

  async startService({ user, company, id }) {
    const t = await this.load(id, company.id);
    if (this.roleOf(t, company.id) !== 'SELLER') throw forbidden();
    if (!['PAID', 'PROTECTED'].includes(t.status)) throw conflict('O serviço só começa após o pagamento confirmado.');
    if (t.serviceStartedAt) return t;
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.marketplaceTransaction.update({ where: { id: t.id }, data: { serviceStartedAt: new Date() } });
      await this.timeline(t.id, { type: 'SERVICE_STARTED', actorUserId: user.id }, tx);
      await this.publishBoth(u, { type: 'SERVICE_STARTED', userId: user.id, activity: { type: 'PAYMENT', title: 'Serviço iniciado', description: t.description, source: 'AutoPix Pay' } }, tx);
      return u;
    });
  }

  async reportCompletion({ user, company, id }) {
    const t = await this.load(id, company.id);
    if (this.roleOf(t, company.id) !== 'SELLER') throw forbidden();
    if (!['PAID', 'PROTECTED'].includes(t.status)) throw conflict('Estado inválido para informar conclusão.');
    if (t.sellerCompletedAt) return t;
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.marketplaceTransaction.update({ where: { id: t.id }, data: { sellerCompletedAt: new Date(), serviceStartedAt: t.serviceStartedAt || new Date() } });
      await this.timeline(t.id, { type: 'SELLER_COMPLETED', actorUserId: user.id }, tx);
      if (t.buyerCompanyId) await this.timeline(t.id, { type: 'AWAITING_BUYER' }, tx);
      await this.publishBoth(
        u,
        { type: 'SERVICE_COMPLETED', userId: user.id, payload: { link: `/app/pay/transactions/${t.id}` } },
        tx,
        {
          sellerActivity: { type: 'PAYMENT', title: 'Conclusão informada', description: t.description, source: 'AutoPix Pay' },
          buyerActivity: { type: 'PAYMENT', title: 'Prestador informou conclusão — confirme no AutoPix', description: t.description, source: 'AutoPix Pay', severity: 'WARNING' },
        },
      );
      return u;
    });
  }

  async requestRelease({ user, company, id }) {
    const t = await this.load(id, company.id);
    if (this.roleOf(t, company.id) !== 'SELLER') throw forbidden();
    if (!t.protectedFlow) throw conflict('Esta transação não usa pagamento protegido.');
    if (t.status !== 'PROTECTED' || !t.sellerCompletedAt) throw conflict('Informe a conclusão antes de solicitar a liberação.');
    await this.prisma.$transaction(async (tx) => {
      await this.timeline(t.id, { type: 'RELEASE_REQUESTED', actorUserId: user.id }, tx);
      await this.publishBoth(t, { type: 'PROTECTED_PAYMENT_RELEASE_REQUESTED', userId: user.id, payload: { link: `/app/pay/transactions/${t.id}` } }, tx, {
        sellerActivity: { type: 'PAYMENT', title: 'Liberação solicitada ao cliente', description: t.description, source: 'AutoPix Pay' },
        buyerActivity: { type: 'PAYMENT', title: 'Pagamento pronto para liberação — confirme no AutoPix', description: t.description, source: 'AutoPix Pay', severity: 'WARNING' },
      });
    });
    return this.load(id, company.id);
  }

  async cancel({ user, company, id }) {
    const t = await this.load(id, company.id);
    if (this.roleOf(t, company.id) !== 'SELLER') throw forbidden();
    if (!['DRAFT', 'AWAITING_PAYMENT'].includes(t.status)) throw conflict('Só é possível cancelar antes do pagamento.');
    if (t.payment?.status === 'PENDING' && t.payment.providerPaymentId) {
      // Cancel at the provider first; if it was paid meanwhile, the provider tells us.
      const provider = this.providerFactory(t.payment.provider, this.config);
      const st = await provider.getPaymentStatus(t.payment.providerPaymentId).catch(() => null);
      if (st?.status === 'CONFIRMED') throw conflict('O pagamento acabou de ser recebido; não é possível cancelar.');
      await provider.cancelPixCharge(t.payment.providerPaymentId).catch(() => null);
    }
    return this.prisma.$transaction(async (tx) => {
      if (t.payment?.status === 'PENDING') await tx.payment.update({ where: { id: t.payment.id }, data: { status: 'CANCELED' } });
      const u = await tx.marketplaceTransaction.update({ where: { id: t.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      await this.timeline(t.id, { type: 'CANCELLED', actorUserId: user.id }, tx);
      await this.publishBoth(u, { type: 'PAYMENT_CANCELLED', userId: user.id, activity: { type: 'PAYMENT', title: 'Negócio cancelado', description: t.description, source: 'AutoPix Pay' } }, tx);
      await this.audit.log({ action: 'TRANSACTION_CANCELLED', userId: user.id, companyId: company.id, transactionId: t.id, paymentId: t.payment?.id }, tx);
      return u;
    });
  }

  // ----------------------------------------------- payment state hand-offs

  /** Called inside PaymentService.applyEvent's DB transaction. */
  async onPaymentConfirmed(tx, payment) {
    const t = await tx.marketplaceTransaction.findUnique({ where: { id: payment.transactionId } });
    if (!t || !['AWAITING_PAYMENT', 'DRAFT'].includes(t.status)) return null;
    const caps = this.capabilities().capabilities;
    const status = t.protectedFlow ? 'PROTECTED' : 'PAID';
    const settlementStatus = t.protectedFlow ? 'HELD_BY_PROVIDER' : caps.split ? 'SPLIT_PENDING' : caps.payout ? 'PAYOUT_PENDING' : 'PENDING_PROVIDER_CAPABILITY';
    const u = await tx.marketplaceTransaction.update({ where: { id: t.id }, data: { status, settlementStatus } });
    await this.timeline(t.id, { type: 'PAYMENT_RECEIVED', metadata: { paymentId: payment.id } }, tx);
    if (t.protectedFlow) {
      await this.timeline(t.id, { type: 'PROTECTED' }, tx);
      await this.publishBoth(u, { type: 'PROTECTED_PAYMENT_CREATED', payload: { amountCents: t.grossAmount, link: `/app/pay/transactions/${t.id}` } }, tx, {
        sellerActivity: { type: 'PAYMENT', title: 'Pagamento protegido · aguardando conclusão', description: t.description, source: 'AutoPix Pay', severity: 'SUCCESS' },
        buyerActivity: { type: 'PAYMENT', title: 'Pagamento recebido e aguardando conclusão', description: t.description, source: 'AutoPix Pay' },
      });
    } else if (settlementStatus === 'PENDING_PROVIDER_CAPABILITY') {
      await this.timeline(t.id, { type: 'SETTLEMENT_PENDING' }, tx);
    }
    await this.audit.log({ action: 'TRANSACTION_PAID', source: 'SYSTEM', companyId: t.sellerCompanyId, transactionId: t.id, paymentId: payment.id, metadata: { status, settlementStatus } }, tx);
    return u;
  }

  async onPaymentLapsed(tx, payment, status) {
    const t = await tx.marketplaceTransaction.findUnique({ where: { id: payment.transactionId } });
    if (!t || t.status !== 'AWAITING_PAYMENT') return;
    // The deal survives; the seller can issue a new Pix.
    await tx.marketplaceTransaction.update({ where: { id: t.id }, data: { status: 'DRAFT' } });
    await this.timeline(t.id, { type: 'PIX_EXPIRED', title: status === 'EXPIRED' ? TX_TITLES.PIX_EXPIRED : 'Cobrança Pix encerrada pelo parceiro financeiro' }, tx);
  }

  // ------------------------------------------------------------------ read

  allowedActions(t, role, caps, { isPlatformAdmin = false, openDispute = false } = {}) {
    const a = [];
    const paid = ['PAID', 'PROTECTED', 'READY_TO_RELEASE'].includes(t.status);
    if (role === 'SELLER') {
      if (t.status === 'DRAFT') a.push('CREATE_TRANSACTION_PIX', 'CANCEL_TRANSACTION');
      if (t.status === 'AWAITING_PAYMENT') a.push('CREATE_TRANSACTION_PIX', 'CANCEL_TRANSACTION');
      if (['PAID', 'PROTECTED'].includes(t.status) && !t.serviceStartedAt) a.push('START_SERVICE');
      if (['PAID', 'PROTECTED'].includes(t.status) && !t.sellerCompletedAt) a.push('REPORT_COMPLETION');
      if (t.status === 'PROTECTED' && t.sellerCompletedAt && !t.buyerConfirmedAt) a.push('REQUEST_RELEASE');
      if (paid && caps.refund && t.status !== 'RELEASED') a.push('REFUND_PAYMENT');
    }
    if (role === 'BUYER') {
      if (['PAID', 'PROTECTED'].includes(t.status) && t.sellerCompletedAt && !t.buyerConfirmedAt) a.push('CONFIRM_COMPLETION');
      if (t.status === 'READY_TO_RELEASE' && caps.protectedFlow && (caps.payout || caps.split)) a.push('RELEASE_PAYMENT');
    }
    if (role && paid && t.buyerCompanyId && !openDispute) a.push('OPEN_DISPUTE');
    if (isPlatformAdmin && t.status === 'DISPUTED') a.push('RESOLVE_DISPUTE');
    return a;
  }

  async get(id, { companyId, isPlatformAdmin = false }) {
    const t = await this.prisma.marketplaceTransaction.findUnique({
      where: { id },
      include: {
        payment: { select: { id: true, status: true, provider: true, amountCents: true, refundedCents: true, pixCopyPaste: true, pixQrCodeBase64: true, expiresAt: true, paidAt: true, isSandbox: true, txid: true } },
        timeline: { orderBy: { createdAt: 'asc' } },
        disputes: { orderBy: { createdAt: 'desc' } },
        payouts: { orderBy: { createdAt: 'desc' } },
      },
    });
    const role = t ? this.roleOf(t, companyId) : null;
    if (!t || (!role && !isPlatformAdmin)) throw notFound('Transação não encontrada.');
    const caps = this.capabilities();
    const openDispute = t.disputes.some((d) => !['RESOLVED_BUYER', 'RESOLVED_SELLER', 'CANCELLED'].includes(d.status));
    const [seller, buyer, refunds] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: t.sellerCompanyId }, select: { name: true } }),
      t.buyerCompanyId ? this.prisma.company.findUnique({ where: { id: t.buyerCompanyId }, select: { name: true } }) : null,
      t.payment ? this.prisma.refund.findMany({ where: { paymentId: t.payment.id }, orderBy: { createdAt: 'desc' } }) : [],
    ]);
    let trip = null;
    if (t.referenceType === 'freightMatch') {
      const m = await this.prisma.freightMatch.findUnique({
        where: { id: t.referenceId },
        include: { tripEvents: { where: { type: { not: 'LOCATION_UPDATE' } }, orderBy: { createdAt: 'asc' } } },
      });
      // Location privacy: the buyer sees trip milestones, never coordinates.
      if (m) {
        trip = {
          matchId: m.id,
          origin: m.origin,
          destination: m.destination,
          tripStatus: m.tripStatus,
          trackingConsent: Boolean(m.trackingConsentAt),
          events: m.tripEvents.map((e) => ({ id: e.id, type: e.type, createdAt: e.createdAt, source: e.source, ...(role === 'SELLER' ? { latitude: e.latitude, longitude: e.longitude } : {}) })),
        };
      }
    }
    const payment = t.payment && role !== 'SELLER' && !isPlatformAdmin ? { ...t.payment } : t.payment;
    return {
      transaction: {
        ...t,
        payment,
        sellerName: seller?.name,
        buyerCompanyName: buyer?.name ?? null,
        refunds,
        trip,
      },
      role: role || 'ADMIN',
      allowedActions: this.allowedActions(t, role, caps.capabilities, { isPlatformAdmin, openDispute }),
      provider: caps,
    };
  }

  async list(companyId, { view = 'all', limit = 50 } = {}) {
    const mine = { OR: [{ sellerCompanyId: companyId }, { buyerCompanyId: companyId }] };
    const views = {
      all: mine,
      charges: { sellerCompanyId: companyId },
      payments: { buyerCompanyId: companyId },
      receivable: { sellerCompanyId: companyId, status: { in: ['AWAITING_PAYMENT', 'PAID', 'PROTECTED', 'READY_TO_RELEASE'] } },
      toRelease: { ...mine, status: { in: ['PROTECTED', 'READY_TO_RELEASE'] } },
      history: { ...mine, status: { in: ['RELEASED', 'REFUNDED', 'CANCELLED', 'PAID'] } },
      commissions: { sellerCompanyId: companyId, status: { in: ['PAID', 'PROTECTED', 'READY_TO_RELEASE', 'RELEASED'] } },
    };
    const items = await this.prisma.marketplaceTransaction.findMany({
      where: views[view] || mine,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: LIST_SELECT,
    });
    return items.map((t) => ({ ...t, role: this.roleOf(t, companyId) }));
  }

  /** AutoPix Pay header metrics — all from the database. */
  async summary(companyId) {
    const sum = async (where, field) => (await this.prisma.marketplaceTransaction.aggregate({ where, _sum: { [field]: true } }))._sum[field] ?? 0;
    const seller = { sellerCompanyId: companyId };
    const [received, toRelease, processing, commissions, refundsProcessing] = await Promise.all([
      sum({ ...seller, status: { in: ['PAID', 'PROTECTED', 'READY_TO_RELEASE', 'RELEASED'] } }, 'grossAmount'),
      sum({ ...seller, status: { in: ['PROTECTED', 'READY_TO_RELEASE'] } }, 'sellerNetAmount'),
      sum({ ...seller, status: 'AWAITING_PAYMENT' }, 'grossAmount'),
      sum({ ...seller, status: { in: ['PAID', 'PROTECTED', 'READY_TO_RELEASE', 'RELEASED'] } }, 'commissionAmount'),
      this.prisma.refund.aggregate({ where: { status: { in: ['REQUESTED', 'PROCESSING'] }, payment: { companyId } }, _sum: { amountCents: true } }),
    ]);
    return {
      receivedCents: received,
      toReleaseCents: toRelease,
      processingCents: processing + (refundsProcessing._sum.amountCents ?? 0),
      commissionsCents: commissions,
    };
  }
}
