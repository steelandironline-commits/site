import crypto from 'node:crypto';
import { PLAN, checkoutState, deepLinks, formatCents, PRICING, COMMISSION_PLAN_CODE } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { generateToken, hashToken } from '../security/tokens.js';
import { badRequest, conflict, forbidden, gone, notFound, unavailable } from '../errors.js';
import { FinancialError } from '../payments/errors.js';
import { PAYMENTS_UNAVAILABLE_MESSAGE } from '../payments/DisabledPaymentProvider.js';
import { getPaymentProvider, isWebhookProviderAllowed } from '../payments/index.js';
import { WebhookSignatureError } from '../payments/PaymentProvider.js';
import { AuthService } from './authService.js';
import { EventEngine } from '../events/EventEngine.js';
import { JobQueue } from '../engine/jobQueue.js';
import { logger } from '../logger.js';

const PIX_TTL_MS = 30 * 60 * 1000;
const CHARGE_TTL_MS = 24 * 60 * 60 * 1000;
const RECONCILE_EVERY_MS = 15_000;
const RENEWAL_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

export const PUBLIC_PAYMENT_SELECT = {
  id: true,
  kind: true,
  reference: true,
  description: true,
  status: true,
  protectionStatus: true,
  amountCents: true,
  currency: true,
  method: true,
  provider: true,
  pixQrCodeBase64: true,
  pixCopyPaste: true,
  expiresAt: true,
  paidAt: true,
  releasedAt: true,
  refundedAt: true,
  disputeReason: true,
  payerName: true,
  relatedType: true,
  relatedId: true,
  createdAt: true,
  companyId: true,
  subscriptionId: true,
  txid: true,
  isSandbox: true,
  refundedCents: true,
  transactionId: true,
  failureCode: true,
};

const LIST_SELECT = {
  id: true,
  kind: true,
  reference: true,
  description: true,
  status: true,
  protectionStatus: true,
  amountCents: true,
  provider: true,
  method: true,
  createdAt: true,
  paidAt: true,
  expiresAt: true,
  releasedAt: true,
  payerName: true,
  isSandbox: true,
  transactionId: true,
};

function newReference() {
  return `AP-${generateToken(6).replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()}`;
}

/**
 * PaymentService — Pix charges (subscription and TemPix Pay charges) and
 * idempotent provider-event processing. Money movement after payment
 * (release, refund, split, payout) lives in the finance services and always
 * goes through the provider's authorized flows.
 */
export class PaymentService {
  constructor({ prisma = getPrisma(), config = getConfig(), email, events, audit, providerFactory = getPaymentProvider } = {}) {
    this.prisma = prisma;
    this.audit = audit;
    /** Wired by buildPlatform (circular): MarketplaceTransactionService, RefundService. */
    this.transactions = null;
    this.refunds = null;
    this.config = config;
    this.email = email;
    this.providerFactory = providerFactory;
    this.events = events ?? new EventEngine({ prisma });
    this.auth = new AuthService({ prisma, config, email });
    this.queue = new JobQueue({ prisma });
    this.lastReconcile = new Map();
  }

  provider(name = this.config.payment.provider) {
    return this.providerFactory(name, this.config);
  }

  async #issueCharge(payment, { payer, description, expiresAt, idempotencyKey }) {
    const provider = this.provider(payment.provider);
    try {
      const charge = await provider.createPixCharge({
        paymentId: payment.id,
        amountCents: payment.amountCents,
        description,
        payer,
        idempotencyKey,
        expiresAt,
      });
      return await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: charge.providerPaymentId,
          pixQrCodeBase64: charge.qrCodeBase64,
          pixCopyPaste: charge.copyPaste,
          expiresAt: charge.expiresAt || expiresAt,
          txid: provider.name === 'banco_do_brasil' ? charge.providerPaymentId : (charge.metadata?.txid ?? null),
          isSandbox: Boolean(provider.isSandbox),
          metadata: charge.metadata ?? undefined,
        },
        select: PUBLIC_PAYMENT_SELECT,
      });
    } catch (err) {
      // Never expose raw bank/provider errors to the customer.
      const code = err instanceof FinancialError ? err.code : 'PIX_CREATE_FAILED';
      logger.error('pix charge creation failed', { code, paymentId: payment.id, provider: provider.name });
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureCode: code } });
      if (err instanceof FinancialError && err.status < 500) throw err;
      throw unavailable('Não foi possível gerar o Pix agora. Tente novamente em instantes.');
    }
  }

  /** Create one idempotent Pix fee for a real workforce match. */
  async createWorkforceFeeCharge({ kind, user, company, matchId, amountCents, payer, description }) {
    if (!['INTERVIEW_FEE', 'HIRING_FEE'].includes(kind)) throw badRequest('Tipo de taxa inválido.');
    if (!Number.isInteger(amountCents) || amountCents < 1) throw badRequest('Valor da taxa inválido.');
    if (company.accountType !== 'COMPANY') throw forbidden('Somente empresas podem iniciar esta cobrança.');
    const provider = this.provider();
    if (provider.name === 'none') throw unavailable(PAYMENTS_UNAVAILABLE_MESSAGE);

    const prefix = kind === 'INTERVIEW_FEE' ? 'WORKFORCE_INTERVIEW' : 'WORKFORCE_HIRE';
    const previous = await this.prisma.payment.findMany({
      where: { companyId: company.id, kind, relatedId: matchId, relatedType: { startsWith: prefix } },
      orderBy: { createdAt: 'desc' },
      select: PUBLIC_PAYMENT_SELECT,
      take: 1,
    });
    const last = previous[0];
    if (last?.status === 'CONFIRMED') {
      if (last.amountCents !== amountCents) throw conflict('Esta taxa já foi paga com outro valor.');
      return last;
    }
    if (last?.status === 'PENDING' && last.expiresAt > new Date()) {
      if (last.amountCents !== amountCents) throw conflict('Já existe um Pix pendente para esta taxa. Aguarde a confirmação ou o vencimento.');
      return last;
    }

    const expiresAt = new Date(Date.now() + PIX_TTL_MS);
    const previousAttempt = Number(last?.relatedType?.slice(prefix.length + 1)) || 0;
    const relatedType = `${prefix}_${previousAttempt + 1}`;
    let payment;
    try {
      payment = await this.prisma.payment.create({
        data: {
          kind,
          relatedType,
          relatedId: matchId,
          companyId: company.id,
          provider: provider.name,
          amountCents,
          description,
          payerName: payer.name || null,
          payerEmail: payer.email || null,
          createdByUserId: user.id,
          idempotencyKey: crypto.createHash('sha256').update(`${company.id}:${kind}:${matchId}:${relatedType}`).digest('hex'),
          expiresAt,
        },
      });
    } catch (err) {
      if (err.code !== 'P2002') throw err;
      const raced = await this.prisma.payment.findFirst({
        where: { companyId: company.id, kind, relatedId: matchId, relatedType },
        select: PUBLIC_PAYMENT_SELECT,
      });
      if (raced) return raced;
      throw err;
    }

    const issued = await this.#issueCharge(payment, { payer, description, expiresAt, idempotencyKey: payment.idempotencyKey });
    await this.events.activity.record({
      companyId: company.id,
      userId: user.id,
      type: 'PAYMENT',
      title: 'Cobrança Pix de contratação gerada',
      description: `${description} · ${formatCents(amountCents)}.`,
      source: provider.name,
      metadata: { paymentId: payment.id, kind, matchId },
    });
    await this.audit?.log({ action: 'WORKFORCE_FEE_CHARGE_CREATED', source: 'WEB', userId: user.id, companyId: company.id, paymentId: payment.id, metadata: { kind, amountCents, matchId } });
    return issued;
  }

  // ----------------------------------------------- company signup fee (one-time)

  /** Commission model: companies pay a one-time signup fee; nothing recurring. */
  async #createSignupFeeCharge({ user, company }) {
    const fee = this.config.billing.companySignupFeeCents;
    if (company.accountType !== 'COMPANY' || fee <= 0) {
      throw conflict(`Esta conta não tem taxa de cadastro. O TemPix só cobra ${PRICING.commissionLabel} por contrato fechado.`);
    }
    const provider = this.provider();
    // nothing is recorded when the gateway cannot issue a Pix yet
    if (provider.name === 'none' || !provider.has('pix')) throw unavailable(PAYMENTS_UNAVAILABLE_MESSAGE);
    let access = await this.prisma.subscription.findUnique({ where: { companyId: company.id } });
    if (access?.status === 'ACTIVE') throw conflict('A taxa de cadastro já foi paga.');
    if (!access) {
      access = await this.prisma.subscription.create({
        data: { companyId: company.id, plan: COMMISSION_PLAN_CODE, priceCents: 0, provider: provider.name },
      });
    }
    if (provider.name === 'asaas' && !company.cnpj) throw badRequest('Informe o CNPJ da empresa para gerar o Pix.');

    const pending = await this.prisma.payment.findFirst({
      where: {
        companyId: company.id,
        kind: 'SIGNUP_FEE',
        status: 'PENDING',
        provider: provider.name,
        amountCents: fee,
        expiresAt: { gt: new Date(Date.now() + 60_000) },
        pixCopyPaste: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: PUBLIC_PAYMENT_SELECT,
    });
    if (pending) return pending;

    // The Pix never outlives the signup's hour; an unpaid signup past it is reset, not charged.
    const draft = await this.prisma.user.findUnique({ where: { id: user.id }, select: { status: true, pendingExpiresAt: true } });
    if (draft?.status === 'PENDING_PAYMENT' && draft.pendingExpiresAt && draft.pendingExpiresAt <= new Date()) {
      throw gone('O prazo de 1 hora para concluir este cadastro acabou. Comece de novo.');
    }
    const deadline = draft?.pendingExpiresAt ? draft.pendingExpiresAt.getTime() : Infinity;
    const expiresAt = new Date(Math.min(Date.now() + PIX_TTL_MS, deadline));
    const payment = await this.prisma.payment.create({
      data: {
        kind: 'SIGNUP_FEE',
        subscriptionId: access.id,
        companyId: company.id,
        provider: provider.name,
        amountCents: fee,
        description: 'Taxa de cadastro TemPix · pagamento único',
        isSandbox: Boolean(provider.isSandbox),
        idempotencyKey: generateToken(18),
        createdByUserId: user.id,
        expiresAt,
      },
    });
    const updated = await this.#issueCharge(payment, {
      payer: { name: user.name, email: user.email, cnpj: company.cnpj, companyId: company.id },
      description: payment.description,
      expiresAt,
      idempotencyKey: payment.idempotencyKey,
    });
    await this.events.activity.record({
      companyId: company.id,
      userId: user.id,
      type: 'PAYMENT',
      title: 'Cobrança Pix gerada',
      description: `Taxa de cadastro · ${formatCents(fee)} · pagamento único.`,
      source: provider.name,
      metadata: { paymentId: payment.id },
    });
    return updated;
  }

  // ------------------------------------------------- subscription checkout

  async createPixCharge({ user, company }) {
    if (this.config.billing.model === 'commission') return this.#createSignupFeeCharge({ user, company });
    const provider = this.provider();
    if (provider.name === 'none') throw unavailable(PAYMENTS_UNAVAILABLE_MESSAGE); // nothing is recorded
    let subscription = await this.prisma.subscription.findUnique({ where: { companyId: company.id } });
    if (!subscription) {
      subscription = await this.prisma.subscription.create({
        data: { companyId: company.id, priceCents: PLAN.priceCents, plan: PLAN.code, provider: provider.name },
      });
    }
    if (
      subscription.status === 'ACTIVE' &&
      subscription.currentPeriodEnd &&
      subscription.currentPeriodEnd.getTime() - Date.now() > RENEWAL_WINDOW_MS
    ) {
      throw conflict('Sua assinatura já está ativa.');
    }
    if (provider.name === 'asaas' && !company.cnpj) throw badRequest('Informe o CNPJ da empresa para gerar o Pix.');

    const pending = await this.prisma.payment.findFirst({
      where: {
        companyId: company.id,
        kind: 'SUBSCRIPTION',
        status: 'PENDING',
        provider: provider.name,
        expiresAt: { gt: new Date(Date.now() + 60_000) },
        pixCopyPaste: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: PUBLIC_PAYMENT_SELECT,
    });
    if (pending) return pending;

    const expiresAt = new Date(Date.now() + PIX_TTL_MS);
    const payment = await this.prisma.payment.create({
      data: {
        kind: 'SUBSCRIPTION',
        subscriptionId: subscription.id,
        companyId: company.id,
        provider: provider.name,
        amountCents: subscription.priceCents,
        description: 'Assinatura TemPix — 30 dias',
        isSandbox: Boolean(provider.isSandbox),
        idempotencyKey: generateToken(18),
        createdByUserId: user.id,
        expiresAt,
      },
    });
    const updated = await this.#issueCharge(payment, {
      payer: { name: user.name, email: user.email, cnpj: company.cnpj, companyId: company.id },
      description: payment.description,
      expiresAt,
      idempotencyKey: payment.idempotencyKey,
    });
    await this.events.activity.record({
      companyId: company.id,
      userId: user.id,
      type: 'PAYMENT',
      title: 'Cobrança Pix gerada',
      description: `Assinatura · ${formatCents(payment.amountCents)}.`,
      source: provider.name,
      metadata: { paymentId: payment.id },
    });
    return updated;
  }

  // ------------------------------------------------------------ charges

  /**
   * Create a Pix charge. For TemPix Pay the amount ALWAYS comes from the
   * MarketplaceTransaction (server-side), never from the client.
   */
  async createCharge({ user, company, amountCents, description, payer = {}, transactionId = null, relatedType = null, relatedId = null }) {
    const provider = this.provider();
    if (provider.name === 'none') throw unavailable(PAYMENTS_UNAVAILABLE_MESSAGE); // nothing is recorded
    if (!provider.has('pix')) throw new FinancialError('PROVIDER_CAPABILITY_NOT_AVAILABLE', { capability: 'pix' });
    if (!Number.isInteger(amountCents) || amountCents < 100) throw badRequest('Valor mínimo: R$ 1,00.');
    const payerDocument = payer.document || null;
    if (provider.name === 'asaas' && !(payerDocument || company.cnpj)) throw badRequest('Informe o CPF/CNPJ do pagador.');

    const expiresAt = new Date(Date.now() + (provider.name === 'banco_do_brasil' ? this.config.bb.pixExpirationSeconds * 1000 : CHARGE_TTL_MS));
    const payment = await this.prisma.payment.create({
      data: {
        kind: 'CHARGE',
        companyId: company.id,
        provider: provider.name,
        amountCents,
        reference: newReference(),
        description: description || `Cobrança ${company.name}`,
        payerName: payer.name || null,
        payerDocument,
        payerEmail: payer.email || null,
        relatedType,
        relatedId,
        transactionId,
        isSandbox: Boolean(provider.isSandbox),
        idempotencyKey: generateToken(18),
        createdByUserId: user.id,
        expiresAt,
      },
    });
    const updated = await this.#issueCharge(payment, {
      payer: { name: payer.name || null, email: payer.email || null, cnpj: payerDocument || (provider.name === 'asaas' ? company.cnpj : null), companyId: company.id },
      description: `${payment.description} · ${payment.reference}`,
      expiresAt,
      idempotencyKey: payment.idempotencyKey,
    });
    const event = {
      type: 'PAYMENT_CREATED',
      userId: user.id,
      payload: { amountCents, reference: payment.reference, kind: 'CHARGE', paymentId: payment.id, link: transactionId ? deepLinks.transaction(transactionId) : deepLinks.payment(payment.id) },
      activity: {
        type: 'PAYMENT',
        title: `Cobrança TemPix criada · ${formatCents(amountCents)}`,
        description: `${payment.reference} · ${payment.description}`,
        source: 'TemPix Pay',
        metadata: { paymentId: payment.id },
      },
    };
    const t = transactionId && this.transactions ? await this.prisma.marketplaceTransaction.findUnique({ where: { id: transactionId } }) : null;
    if (t) await this.transactions.publishBoth(t, event);
    else await this.events.publish({ ...event, companyId: company.id, aggregateType: 'payment', aggregateId: payment.id });
    await this.audit?.log({ action: 'PIX_CHARGE_CREATED', source: 'SYSTEM', userId: user.id, companyId: company.id, transactionId, paymentId: payment.id, metadata: { amountCents, provider: provider.name, sandbox: Boolean(provider.isSandbox) } });
    return updated;
  }

  // ---------------------------------------------------------------- queries

  async getPayment(id, companyId) {
    let payment = await this.prisma.payment.findFirst({ where: { id, companyId }, select: PUBLIC_PAYMENT_SELECT });
    if (!payment) throw notFound('Pagamento não encontrado.');

    if (payment.status === 'PENDING') {
      await this.reconcile(payment.id).catch((err) => logger.warn('reconcile failed', { code: err.code || err.name }));
      payment = await this.prisma.payment.findUnique({ where: { id }, select: PUBLIC_PAYMENT_SELECT });
      if (payment.status === 'PENDING' && payment.expiresAt && payment.expiresAt.getTime() < Date.now()) {
        await this.expireLocally(payment.id);
        payment = await this.prisma.payment.findUnique({ where: { id }, select: PUBLIC_PAYMENT_SELECT });
      }
    }
    return { ...payment, checkoutState: checkoutState(payment) };
  }

  /** The charge's own deadline passed and the provider did not confirm it. */
  async expireLocally(paymentId) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!p || p.status !== 'PENDING') return null;
    if (!p.providerPaymentId) return this.prisma.payment.update({ where: { id: p.id }, data: { status: 'EXPIRED' } });
    return this.applyEvent({
      provider: p.provider,
      providerEventId: `local-expiry:${p.id}`,
      providerPaymentId: p.providerPaymentId,
      type: 'local.expiry',
      status: 'EXPIRED',
      payload: { source: 'local-expiry' },
    });
  }

  async reconcile(paymentId) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment?.providerPaymentId || payment.status !== 'PENDING' || payment.provider === 'mock') return null;
    const last = this.lastReconcile.get(paymentId) || 0;
    if (Date.now() - last < RECONCILE_EVERY_MS) return null;
    this.lastReconcile.set(paymentId, Date.now());

    const { status, paidAt, amountCents } = await this.provider(payment.provider).getPaymentStatus(payment.providerPaymentId);
    if (status === 'PENDING') return null;
    return this.applyEvent({
      provider: payment.provider,
      providerEventId: `reconcile:${payment.providerPaymentId}:${status}`,
      providerPaymentId: payment.providerPaymentId,
      type: 'reconcile',
      status,
      paidAt,
      amountCents,
      payload: { source: 'reconcile' },
    });
  }

  async listPayments(companyId, { kind } = {}) {
    return this.prisma.payment.findMany({
      where: { companyId, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: LIST_SELECT,
    });
  }

  // ---------------------------------------------------------------- webhooks

  static hashPayload(raw) {
    const s = Buffer.isBuffer(raw) ? raw : Buffer.from(typeof raw === 'string' ? raw : JSON.stringify(raw ?? {}));
    return crypto.createHash('sha256').update(s).digest('hex');
  }

  async processWebhook(providerName, req) {
    if (!isWebhookProviderAllowed(providerName, this.config)) throw notFound('Provedor não configurado.');
    const provider = this.provider(providerName);
    const payloadHash = PaymentService.hashPayload(req.rawBody ?? req.body);
    let events;
    try {
      events = await provider.handleWebhook(req); // authenticity first; throws on failure
    } catch (err) {
      // Keep a trace of rejected deliveries for the admin "failed webhooks" view
      // (hash only, never the body — it may carry personal data).
      await this.prisma.paymentEvent
        .createMany({
          data: [{ provider: provider.name, providerEventId: `rejected:${payloadHash}`, type: 'rejected', processingStatus: 'FAILED', payloadHash, error: err.code || err.name, processedAt: new Date() }],
          skipDuplicates: true,
        })
        .catch(() => null);
      throw err;
    }
    const results = [];
    for (const event of events) results.push(await this.applyEvent({ provider: provider.name, payloadHash, ...event }));
    return { received: true, results };
  }

  async #flag(tx, payment, kind, details, providerStatus) {
    const open = await tx.reconciliationIssue.findFirst({ where: { paymentId: payment.id, kind, status: { in: ['OPEN', 'ACKNOWLEDGED'] } } });
    if (!open) await tx.reconciliationIssue.create({ data: { paymentId: payment.id, kind, localStatus: payment.status, providerStatus, details } });
    await this.events.publish({ type: 'RECONCILIATION_ISSUE', companyId: payment.companyId, aggregateType: 'payment', aggregateId: payment.id, payload: { kind } }, tx);
  }

  /**
   * Idempotent, transactional state transition:
   * dedupe (provider, providerEventId) → lock payment → validate amount →
   * apply → hand off to subscription / TemPix Pay transaction → domain
   * events → mark event processed. Ambiguities are FLAGGED, never guessed.
   */
  async applyEvent({ provider, providerEventId, providerPaymentId, type, status, paidAt, amountCents = null, kind = 'payment', refundProviderId, payload, payloadHash }) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const inserted = await tx.paymentEvent.createMany({
        data: [
          {
            provider,
            providerEventId,
            providerPaymentId,
            type: String(type || 'unknown').slice(0, 80),
            status,
            payload: payload ?? undefined,
            payloadHash: payloadHash ?? PaymentService.hashPayload(payload),
            metadata: amountCents != null ? { amountCents } : undefined,
          },
        ],
        skipDuplicates: true,
      });
      if (inserted.count === 0) return { duplicate: true };
      const finish = (processingStatus, { paymentId = null, error = null } = {}) =>
        tx.paymentEvent.update({
          where: { provider_providerEventId: { provider, providerEventId } },
          data: { processed: processingStatus === 'PROCESSED', processingStatus, paymentId, error, processedAt: new Date() },
        });

      const locked = await tx.$queryRaw`
        SELECT id FROM "Payment" WHERE provider = ${provider} AND "providerPaymentId" = ${providerPaymentId} FOR UPDATE`;
      if (!locked.length) {
        await finish('IGNORED', { error: 'payment_not_found' });
        return { ignored: 'payment_not_found' };
      }
      const payment = await tx.payment.findUnique({
        where: { id: locked[0].id },
        include: { subscription: true, transaction: true, company: { include: { users: { orderBy: { createdAt: 'asc' }, take: 1 } } } },
      });
      const base = { companyId: payment.companyId, aggregateType: 'payment', aggregateId: payment.id };

      // Refund lifecycle events (provider-confirmed only).
      if (kind === 'refund') {
        const r = await this.refunds.applyProviderEvent(tx, payment, { refundProviderId, status, amountCents });
        await finish(r.flagged ? 'FLAGGED' : 'PROCESSED', { paymentId: payment.id, error: r.flagged || null });
        return { refund: true, paymentId: payment.id, ...r };
      }

      if (status === 'CONFIRMED') {
        if (['CONFIRMED', 'REFUNDED'].includes(payment.status)) {
          await finish('PROCESSED', { paymentId: payment.id });
          return { alreadyConfirmed: true, paymentId: payment.id };
        }
        if (payment.status !== 'PENDING') {
          // Paid after we considered it expired/cancelled: real money, needs a human.
          await this.#flag(tx, payment, 'LATE_PAYMENT', { amountCents }, status);
          await finish('FLAGGED', { paymentId: payment.id, error: 'late_payment' });
          return { flagged: 'late_payment', paymentId: payment.id };
        }
        if (amountCents != null && amountCents !== payment.amountCents) {
          await tx.payment.update({ where: { id: payment.id }, data: { failureCode: 'AMOUNT_MISMATCH' } });
          await this.#flag(tx, payment, 'AMOUNT_MISMATCH', { expected: payment.amountCents, received: amountCents }, status);
          await finish('FLAGGED', { paymentId: payment.id, error: 'amount_mismatch' });
          return { flagged: 'amount_mismatch', paymentId: payment.id };
        }
        const now = new Date();
        let activation = null;

        if (payment.kind === 'CHARGE') {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'CONFIRMED', paidAt: paidAt || now, protectionStatus: payment.transaction?.protectedFlow ? 'HELD' : 'NONE' },
          });
          const event = {
            type: 'PAYMENT_RECEIVED',
            payload: { amountCents: payment.amountCents, reference: payment.reference, kind: 'CHARGE', link: payment.transactionId ? deepLinks.transaction(payment.transactionId) : deepLinks.payment(payment.id) },
            activity: {
              type: 'PAYMENT',
              title: `Pix recebido · ${formatCents(payment.amountCents)}`,
              description: `${payment.reference} · ${payment.description || ''}`.trim(),
              source: 'TemPix Pay',
              severity: 'SUCCESS',
              metadata: { paymentId: payment.id },
            },
          };
          if (payment.transaction && this.transactions) {
            await this.transactions.publishBoth(payment.transaction, event, tx);
            await this.transactions.onPaymentConfirmed(tx, payment);
          } else {
            await this.events.publish({ ...base, ...event }, tx);
          }
        } else if (payment.kind === 'INTERVIEW_FEE' || payment.kind === 'HIRING_FEE') {
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'CONFIRMED', paidAt: paidAt || now } });
          const matchData = payment.kind === 'INTERVIEW_FEE'
            ? { interviewFeePaidAt: paidAt || now }
            : { hiringFeePaidAt: paidAt || now };
          const updatedMatch = await tx.workforceMatch.updateMany({
            where: {
              id: payment.relatedId || '',
              companyId: payment.companyId,
              isDemo: false,
              ...(payment.kind === 'INTERVIEW_FEE' ? { interviewCanceledAt: null } : {}),
            },
            data: matchData,
          });
          if (updatedMatch.count === 1) {
            await this.events.publish({
              companyId: payment.companyId,
              userId: payment.createdByUserId,
              type: 'WORKFORCE_FEE_PAID',
              aggregateType: 'workforceMatch',
              aggregateId: payment.relatedId,
              payload: { kind: payment.kind, amountCents: payment.amountCents, paymentId: payment.id },
              activity: {
                type: 'PAYMENT',
                title: payment.kind === 'INTERVIEW_FEE' ? 'Taxa de agendamento paga' : 'Taxa de contratação confirmada',
                description: `Pix de ${formatCents(payment.amountCents)} confirmado pelo provedor.`,
                source: provider,
                severity: 'SUCCESS',
                metadata: { paymentId: payment.id },
              },
            }, tx);
          }
        } else {
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'CONFIRMED', paidAt: paidAt || now } });
          const sub = payment.subscription;
          // A signup fee opens access with no end date; a subscription adds a period.
          const oneTime = payment.kind === 'SIGNUP_FEE';
          const baseDate = sub.status === 'ACTIVE' && sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
          const periodEnd = oneTime ? null : new Date(baseDate.getTime() + PLAN.intervalDays * 24 * 60 * 60 * 1000);
          await tx.subscription.update({
            where: { id: sub.id },
            data: {
              status: 'ACTIVE',
              activatedAt: sub.activatedAt || now,
              currentPeriodStart: sub.status === 'ACTIVE' ? sub.currentPeriodStart : now,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: false,
              canceledAt: null,
            },
          });
          const owner = payment.company.users[0];
          if (owner && (owner.status === 'PENDING_PAYMENT' || owner.status === 'PENDING_ACTIVATION')) {
            await tx.user.update({ where: { id: owner.id }, data: { status: 'PENDING_ACTIVATION' } });
            const token = await this.auth.issueActivationToken(owner.id, tx);
            activation = { token, user: owner };
          }
          await this.queue.enqueue(payment.companyId, { trigger: 'PAYMENT', isDemo: this.config.demoMode }, tx);
          await this.events.publish(
            {
              ...base,
              type: 'PAYMENT_RECEIVED',
              payload: { amountCents: payment.amountCents, kind: payment.kind },
              activity: {
                type: 'PAYMENT',
                title: 'Pagamento confirmado',
                description: `Pix de ${formatCents(payment.amountCents)} confirmado pelo provedor.`,
                source: provider,
                severity: 'SUCCESS',
                metadata: { paymentId: payment.id },
              },
            },
            tx,
          );
          await this.events.activity.record(
            {
              companyId: payment.companyId,
              type: 'SYSTEM',
              title: 'TemPix ativado',
              description: oneTime
                ? 'Taxa de cadastro confirmada. Sem mensalidade. Agentes iniciando.'
                : `Assinatura ativa até ${periodEnd.toLocaleDateString('pt-BR')}. Agentes iniciando.`,
              source: 'subscription',
              severity: 'SUCCESS',
            },
            tx,
          );
        }
        await this.audit?.log({ action: 'PAYMENT_CONFIRMED', source: 'SYSTEM', companyId: payment.companyId, transactionId: payment.transactionId, paymentId: payment.id, metadata: { provider, providerEventId, amountCents: payment.amountCents } }, tx);
        await finish('PROCESSED', { paymentId: payment.id });
        return { confirmed: true, paymentId: payment.id, activation };
      }

      if (['FAILED', 'EXPIRED', 'CANCELED'].includes(status) && payment.status === 'PENDING') {
        await tx.payment.update({ where: { id: payment.id }, data: { status } });
        if (payment.kind === 'CHARGE') {
          const event = {
            type: status === 'EXPIRED' ? 'PAYMENT_EXPIRED' : 'PAYMENT_CANCELLED',
            payload: { amountCents: payment.amountCents, reference: payment.reference, link: payment.transactionId ? deepLinks.transaction(payment.transactionId) : null },
            activity: { type: 'PAYMENT', title: status === 'EXPIRED' ? 'Pix expirado' : 'Cobrança cancelada', description: `${payment.reference} · ${formatCents(payment.amountCents)}`, source: 'TemPix Pay' },
          };
          if (payment.transaction && this.transactions) {
            await this.transactions.publishBoth(payment.transaction, event, tx, { buyerActivity: null });
            await this.transactions.onPaymentLapsed(tx, payment, status);
          } else await this.events.publish({ ...base, ...event }, tx);
        }
      } else if (status === 'REFUNDED' && payment.status === 'CONFIRMED') {
        // Status-only "refunded" signal (providers without refund events):
        // complete OUR in-flight refunds; anything else is external → human.
        const inflight = await tx.refund.findMany({ where: { paymentId: payment.id, status: { in: ['REQUESTED', 'PROCESSING'] } } });
        if (inflight.length && this.refunds) {
          for (const r of inflight) await this.refunds.complete(r.id, { source: 'SYSTEM' }, tx);
        } else {
          await this.#flag(tx, payment, 'EXTERNAL_REFUND', { note: 'Provedor informou estorno não solicitado pelo TemPix.' }, status);
          await finish('FLAGGED', { paymentId: payment.id, error: 'external_refund' });
          return { flagged: 'external_refund', paymentId: payment.id };
        }
      }
      await finish('PROCESSED', { paymentId: payment.id });
      return { updated: true, paymentId: payment.id, status };
    });

    if (outcome.activation && this.email) {
      const { token, user } = outcome.activation;
      const sent = await this.email
        .activationEmail({ to: user.email, name: user.name, link: `${this.config.appUrl}/activate/${token}` })
        .catch((err) => {
          logger.error('activation email failed', { err });
          return false;
        });
      if (sent) {
        await this.prisma.activationToken.updateMany({
          where: { tokenHash: hashToken(token, this.config.secrets.activation) },
          data: { emailSentAt: new Date() },
        });
      }
    }
    this.events.kick?.();
    const { activation, ...safe } = outcome;
    return { ...safe, activationIssued: Boolean(activation) };
  }

  // ---------------------------------------------------- activation hand-off

  async claimActivation(paymentId, user) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, companyId: user.companyId, kind: { in: ['SUBSCRIPTION', 'SIGNUP_FEE'] } },
    });
    if (!payment) throw notFound('Pagamento não encontrado.');
    if (payment.status !== 'CONFIRMED') throw conflict('O pagamento ainda não foi confirmado.');
    const fresh = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (fresh.status === 'ACTIVE') return { alreadyActive: true };
    if (fresh.status !== 'PENDING_ACTIVATION') throw conflict('Conta não está aguardando ativação.');
    const sentToken = await this.prisma.activationToken.findFirst({
      where: { userId: fresh.id, usedAt: null, expiresAt: { gt: new Date() }, emailSentAt: { not: null } },
      select: { id: true },
    });
    if (sentToken) return { emailVerificationRequired: true, emailSent: true };
    await this.prisma.activationToken.updateMany({ where: { userId: fresh.id, usedAt: null }, data: { usedAt: new Date() } });
    const token = await this.auth.issueActivationToken(fresh.id);
    const sent = await this.email?.activationEmail({ to: fresh.email, name: fresh.name, link: `${this.config.appUrl}/activate/${token}` });
    if (!sent) {
      await this.prisma.activationToken.updateMany({ where: { userId: fresh.id, usedAt: null }, data: { usedAt: new Date() } });
      throw unavailable('Não foi possível enviar o link de verificação. Configure o e-mail de ativação para continuar.');
    }
    await this.prisma.activationToken.updateMany({ where: { tokenHash: hashToken(token, this.config.secrets.activation) }, data: { emailSentAt: new Date() } });
    return { emailVerificationRequired: true, emailSent: true };
  }

  /** Development only: confirm a mock charge through the real webhook path. */
  async simulateConfirmation(paymentId, companyId) {
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, companyId } });
    if (!payment) throw notFound('Pagamento não encontrado.');
    if (this.config.isProduction || payment.provider !== 'mock') throw forbidden('Simulação indisponível.');
    const provider = this.provider('mock');
    if (!provider.supportsSimulation) throw forbidden('Simulação indisponível.');
    return this.processWebhook('mock', provider.buildWebhook(payment.providerPaymentId, 'CONFIRMED'));
  }

  link(paymentId) {
    return deepLinks.payment(paymentId);
  }
}

export { WebhookSignatureError };
