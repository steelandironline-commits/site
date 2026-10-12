import { PLAN, deepLinks, formatCents } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { generateToken } from '../security/tokens.js';
import { badRequest, conflict, forbidden, notFound, unavailable } from '../errors.js';
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
};

function newReference() {
  return `AP-${generateToken(6).replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()}`;
}

/**
 * PaymentService — Pix charges (subscription and protected charges),
 * idempotent webhook processing, protected-funds lifecycle.
 */
export class PaymentService {
  constructor({ prisma = getPrisma(), config = getConfig(), email, events, providerFactory = getPaymentProvider } = {}) {
    this.prisma = prisma;
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
          metadata: charge.metadata ?? undefined,
        },
        select: PUBLIC_PAYMENT_SELECT,
      });
    } catch (err) {
      logger.error('pix charge creation failed', { err, paymentId: payment.id, provider: provider.name });
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      throw unavailable('Não foi possível gerar o Pix agora. Tente novamente em instantes.');
    }
  }

  // ------------------------------------------------- subscription checkout

  async createPixCharge({ user, company }) {
    const provider = this.provider();
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
        description: 'Assinatura AutoPix — 30 dias',
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

  // ------------------------------------------------------ protected charges

  /**
   * Create a protected Pix charge for the company (e.g. to bill its own
   * customer). Funds are HELD on confirmation and released to the company's
   * payout key only through RELEASE_PAYMENT (step-up confirmed).
   */
  async createCharge({ user, company, amountCents, description, payer = {}, relatedType = null, relatedId = null }) {
    const provider = this.provider();
    if (!Number.isInteger(amountCents) || amountCents < 100) throw badRequest('Valor mínimo: R$ 1,00.');
    const payerDocument = payer.document || company.cnpj;
    if (provider.name === 'asaas' && !payerDocument) throw badRequest('Informe o CPF/CNPJ do pagador.');

    const expiresAt = new Date(Date.now() + CHARGE_TTL_MS);
    const payment = await this.prisma.payment.create({
      data: {
        kind: 'CHARGE',
        companyId: company.id,
        provider: provider.name,
        amountCents,
        reference: newReference(),
        description: description || `Cobrança ${company.name}`,
        payerName: payer.name || null,
        payerDocument: payerDocument || null,
        payerEmail: payer.email || null,
        relatedType,
        relatedId,
        idempotencyKey: generateToken(18),
        createdByUserId: user.id,
        expiresAt,
      },
    });
    const updated = await this.#issueCharge(payment, {
      payer: {
        name: payer.name || company.name,
        email: payer.email || user.email,
        cnpj: payerDocument,
        companyId: company.id,
      },
      description: `${payment.description} · ${payment.reference}`,
      expiresAt,
      idempotencyKey: payment.idempotencyKey,
    });
    await this.events.publish({
      type: 'PAYMENT_CREATED',
      companyId: company.id,
      userId: user.id,
      aggregateType: 'payment',
      aggregateId: payment.id,
      payload: { amountCents, reference: payment.reference, kind: 'CHARGE' },
      activity: {
        type: 'PAYMENT',
        title: `Pix gerado · ${formatCents(amountCents)}`,
        description: `${payment.reference} · ${payment.description}`,
        source: provider.name,
        metadata: { paymentId: payment.id },
      },
    });
    return updated;
  }

  async #loadCharge(companyId, id) {
    const p = await this.prisma.payment.findFirst({ where: { id, companyId, kind: 'CHARGE' } });
    if (!p) throw notFound('Pagamento não encontrado.');
    return p;
  }

  async requestRelease({ companyId, userId, paymentId, reason }) {
    const p = await this.#loadCharge(companyId, paymentId);
    if (p.status !== 'CONFIRMED' || p.protectionStatus !== 'HELD') throw conflict('Este pagamento não está protegido aguardando liberação.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.payment.update({ where: { id: p.id }, data: { protectionStatus: 'RELEASE_REQUESTED' }, select: PUBLIC_PAYMENT_SELECT });
      await this.events.publish(
        {
          type: 'PAYMENT_RELEASE_REQUESTED',
          companyId,
          userId,
          aggregateType: 'payment',
          aggregateId: p.id,
          payload: { amountCents: p.amountCents, reference: p.reference, reason },
          activity: { type: 'PAYMENT', title: 'Liberação de pagamento solicitada', description: `${p.reference} · ${formatCents(p.amountCents)}`, source: 'payments' },
        },
        tx,
      );
      return u;
    });
    return updated;
  }

  /** Executes only after ActionEngine verified a confirmed challenge. */
  async release({ company, userId, paymentId }) {
    const p = await this.#loadCharge(company.id, paymentId);
    if (p.status !== 'CONFIRMED' || !['HELD', 'RELEASE_REQUESTED'].includes(p.protectionStatus)) {
      throw conflict('Este pagamento não pode ser liberado.');
    }
    if (!company.payoutPixKey) throw badRequest('Cadastre a chave Pix de recebimento antes de liberar.');
    // Reserve the state first so a concurrent release cannot pay out twice.
    const reserved = await this.prisma.payment.updateMany({
      where: { id: p.id, protectionStatus: { in: ['HELD', 'RELEASE_REQUESTED'] } },
      data: { protectionStatus: 'RELEASED', releasedAt: new Date() },
    });
    if (reserved.count !== 1) throw conflict('Este pagamento já foi liberado.');
    let transfer;
    try {
      transfer = await this.provider(p.provider).releaseFunds({
        amountCents: p.amountCents,
        pixKey: company.payoutPixKey,
        pixKeyType: company.payoutPixKeyType,
        description: `AutoPix ${p.reference}`,
      });
    } catch (err) {
      await this.prisma.payment.update({ where: { id: p.id }, data: { protectionStatus: p.protectionStatus, releasedAt: null } });
      throw unavailable(`Não foi possível liberar o pagamento: ${err.message}`);
    }
    await this.events.publish({
      type: 'PAYMENT_RELEASED',
      companyId: company.id,
      userId,
      aggregateType: 'payment',
      aggregateId: p.id,
      payload: { amountCents: p.amountCents, reference: p.reference, transferId: transfer.transferId },
      activity: {
        type: 'PAYMENT',
        title: `Pagamento liberado · ${formatCents(p.amountCents)}`,
        description: `${p.reference} enviado para a chave Pix cadastrada.`,
        source: p.provider,
        severity: 'SUCCESS',
      },
    });
    return this.prisma.payment.findUnique({ where: { id: p.id }, select: PUBLIC_PAYMENT_SELECT });
  }

  async refund({ companyId, userId, paymentId }) {
    const p = await this.#loadCharge(companyId, paymentId);
    if (p.status !== 'CONFIRMED' || ['RELEASED', 'REFUNDED'].includes(p.protectionStatus)) throw conflict('Este pagamento não pode ser estornado.');
    await this.provider(p.provider).refundPayment(p.providerPaymentId);
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: p.id }, data: { status: 'REFUNDED', protectionStatus: 'REFUNDED', refundedAt: new Date() } });
      await this.events.publish(
        {
          type: 'PAYMENT_REFUNDED',
          companyId,
          userId,
          aggregateType: 'payment',
          aggregateId: p.id,
          payload: { amountCents: p.amountCents, reference: p.reference },
          activity: { type: 'PAYMENT', title: 'Pagamento estornado', description: `${p.reference} · ${formatCents(p.amountCents)}`, source: p.provider, severity: 'WARNING' },
        },
        tx,
      );
    });
    return this.prisma.payment.findUnique({ where: { id: p.id }, select: PUBLIC_PAYMENT_SELECT });
  }

  async openDispute({ companyId, userId, paymentId, reason }) {
    const p = await this.#loadCharge(companyId, paymentId);
    if (!['HELD', 'RELEASE_REQUESTED'].includes(p.protectionStatus)) throw conflict('Só é possível abrir disputa para pagamentos protegidos.');
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: p.id }, data: { protectionStatus: 'DISPUTED', disputeReason: reason } });
      await this.events.publish(
        {
          type: 'PAYMENT_DISPUTED',
          companyId,
          userId,
          aggregateType: 'payment',
          aggregateId: p.id,
          payload: { reference: p.reference, reason },
          activity: { type: 'PAYMENT', title: 'Disputa aberta', description: `${p.reference}: ${reason}`, source: 'payments', severity: 'WARNING' },
        },
        tx,
      );
    });
    return this.prisma.payment.findUnique({ where: { id: p.id }, select: PUBLIC_PAYMENT_SELECT });
  }

  // ---------------------------------------------------------------- queries

  async getPayment(id, companyId) {
    let payment = await this.prisma.payment.findFirst({ where: { id, companyId }, select: PUBLIC_PAYMENT_SELECT });
    if (!payment) throw notFound('Pagamento não encontrado.');

    if (payment.status === 'PENDING') {
      if (payment.expiresAt && payment.expiresAt.getTime() < Date.now()) {
        await this.reconcile(payment.id).catch(() => null);
        payment = await this.prisma.payment.findUnique({ where: { id }, select: PUBLIC_PAYMENT_SELECT });
        if (payment.status === 'PENDING') {
          payment = await this.prisma.payment.update({ where: { id }, data: { status: 'EXPIRED' }, select: PUBLIC_PAYMENT_SELECT });
        }
      } else {
        await this.reconcile(payment.id).catch((err) => logger.warn('reconcile failed', { err }));
        payment = await this.prisma.payment.findUnique({ where: { id }, select: PUBLIC_PAYMENT_SELECT });
      }
    }
    return payment;
  }

  async reconcile(paymentId) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment?.providerPaymentId || payment.status !== 'PENDING' || payment.provider === 'mock') return null;
    const last = this.lastReconcile.get(paymentId) || 0;
    if (Date.now() - last < RECONCILE_EVERY_MS) return null;
    this.lastReconcile.set(paymentId, Date.now());

    const { status, paidAt } = await this.provider(payment.provider).getPaymentStatus(payment.providerPaymentId);
    if (status === 'PENDING') return null;
    return this.applyEvent({
      provider: payment.provider,
      providerEventId: `reconcile:${payment.providerPaymentId}:${status}`,
      providerPaymentId: payment.providerPaymentId,
      type: 'reconcile',
      status,
      paidAt,
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

  async processWebhook(providerName, req) {
    if (!isWebhookProviderAllowed(providerName, this.config)) throw notFound('Provedor não configurado.');
    const provider = this.provider(providerName);
    const events = await provider.handleWebhook(req); // throws WebhookSignatureError
    const results = [];
    for (const event of events) results.push(await this.applyEvent({ provider: provider.name, ...event }));
    return { received: true, results };
  }

  /**
   * Idempotent, transactional state transition:
   * dedupe event → lock payment → update payment → (subscription: activate +
   * activation token | charge: protect funds) → domain events → commit.
   */
  async applyEvent({ provider, providerEventId, providerPaymentId, type, status, paidAt, payload }) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const inserted = await tx.paymentEvent.createMany({
        data: [{ provider, providerEventId, providerPaymentId, type: String(type || 'unknown').slice(0, 80), status, payload: payload ?? undefined }],
        skipDuplicates: true,
      });
      if (inserted.count === 0) return { duplicate: true };

      const locked = await tx.$queryRaw`
        SELECT id FROM "Payment" WHERE provider = ${provider} AND "providerPaymentId" = ${providerPaymentId} FOR UPDATE`;
      if (!locked.length) return { ignored: 'payment_not_found' };
      const payment = await tx.payment.findUnique({
        where: { id: locked[0].id },
        include: { subscription: true, company: { include: { users: { orderBy: { createdAt: 'asc' }, take: 1 } } } },
      });
      const markProcessed = () =>
        tx.paymentEvent.update({
          where: { provider_providerEventId: { provider, providerEventId } },
          data: { processed: true, paymentId: payment.id },
        });
      const base = { companyId: payment.companyId, aggregateType: 'payment', aggregateId: payment.id };

      if (status === 'CONFIRMED') {
        if (payment.status === 'CONFIRMED') {
          await markProcessed();
          return { alreadyConfirmed: true, paymentId: payment.id };
        }
        const now = new Date();
        let activation = null;

        if (payment.kind === 'CHARGE') {
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'CONFIRMED', paidAt: paidAt || now, protectionStatus: 'HELD' } });
          await this.events.publish(
            {
              ...base,
              type: 'PAYMENT_RECEIVED',
              payload: { amountCents: payment.amountCents, reference: payment.reference, kind: 'CHARGE' },
              activity: {
                type: 'PAYMENT',
                title: `Pix recebido · ${formatCents(payment.amountCents)}`,
                description: `${payment.reference} · ${payment.description || ''}`.trim(),
                source: provider,
                severity: 'SUCCESS',
                metadata: { paymentId: payment.id },
              },
            },
            tx,
          );
          await this.events.publish(
            { ...base, type: 'PAYMENT_PROTECTED', payload: { amountCents: payment.amountCents, reference: payment.reference } },
            tx,
          );
        } else {
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'CONFIRMED', paidAt: paidAt || now } });
          const sub = payment.subscription;
          const baseDate = sub.status === 'ACTIVE' && sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
          const periodEnd = new Date(baseDate.getTime() + PLAN.intervalDays * 24 * 60 * 60 * 1000);
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
              payload: { amountCents: payment.amountCents, kind: 'SUBSCRIPTION' },
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
              title: 'AutoPix ativado',
              description: `Assinatura ativa até ${periodEnd.toLocaleDateString('pt-BR')}. Agentes iniciando.`,
              source: 'subscription',
              severity: 'SUCCESS',
            },
            tx,
          );
        }
        await markProcessed();
        return { confirmed: true, paymentId: payment.id, activation };
      }

      const terminal = { FAILED: 1, EXPIRED: 1, CANCELED: 1 };
      if (terminal[status] && payment.status === 'PENDING') {
        await tx.payment.update({ where: { id: payment.id }, data: { status } });
      } else if (status === 'REFUNDED' && payment.status === 'CONFIRMED') {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'REFUNDED', refundedAt: new Date(), ...(payment.kind === 'CHARGE' ? { protectionStatus: 'REFUNDED' } : {}) },
        });
        if (payment.kind === 'SUBSCRIPTION') {
          await tx.subscription.update({ where: { id: payment.subscriptionId }, data: { status: 'CANCELED', canceledAt: new Date() } });
        }
        await this.events.publish(
          {
            ...base,
            type: 'PAYMENT_REFUNDED',
            payload: { amountCents: payment.amountCents, kind: payment.kind },
            activity: {
              type: 'PAYMENT',
              title: 'Pagamento estornado',
              description: payment.kind === 'SUBSCRIPTION' ? 'A assinatura foi cancelada após o estorno.' : payment.reference,
              source: provider,
              severity: 'WARNING',
            },
          },
          tx,
        );
      }
      await markProcessed();
      return { updated: true, paymentId: payment.id, status };
    });

    if (outcome.activation && this.email) {
      const { token, user } = outcome.activation;
      await this.email
        .activationEmail({ to: user.email, name: user.name, link: `${this.config.appUrl}/activate/${token}` })
        .catch((err) => logger.error('activation email failed', { err }));
    }
    this.events.kick?.();
    const { activation, ...safe } = outcome;
    return { ...safe, activationIssued: Boolean(activation) };
  }

  // ---------------------------------------------------- activation hand-off

  async claimActivation(paymentId, user) {
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, companyId: user.companyId, kind: 'SUBSCRIPTION' } });
    if (!payment) throw notFound('Pagamento não encontrado.');
    if (payment.status !== 'CONFIRMED') throw conflict('O pagamento ainda não foi confirmado.');
    const fresh = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (fresh.status === 'ACTIVE') return { alreadyActive: true };
    if (fresh.status !== 'PENDING_ACTIVATION') throw conflict('Conta não está aguardando ativação.');
    const token = await this.auth.issueActivationToken(fresh.id);
    return { token };
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
