import { PLAN } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { generateToken } from '../security/tokens.js';
import { conflict, forbidden, notFound, unavailable, badRequest } from '../errors.js';
import { getPaymentProvider, isWebhookProviderAllowed } from '../payments/index.js';
import { WebhookSignatureError } from '../payments/PaymentProvider.js';
import { ActivityService } from './activityService.js';
import { AuthService } from './authService.js';
import { JobQueue } from '../engine/jobQueue.js';
import { logger } from '../logger.js';

const PIX_TTL_MS = 30 * 60 * 1000;
const RECONCILE_EVERY_MS = 15_000;
const RENEWAL_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

export const PUBLIC_PAYMENT_SELECT = {
  id: true,
  status: true,
  amountCents: true,
  currency: true,
  method: true,
  provider: true,
  pixQrCodeBase64: true,
  pixCopyPaste: true,
  expiresAt: true,
  paidAt: true,
  createdAt: true,
  companyId: true,
  subscriptionId: true,
};

/**
 * PaymentService — Pix charge creation, webhook processing (idempotent and
 * transactional) and subscription activation.
 */
export class PaymentService {
  constructor({ prisma = getPrisma(), config = getConfig(), email, providerFactory = getPaymentProvider } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.email = email;
    this.providerFactory = providerFactory;
    this.activity = new ActivityService({ prisma });
    this.auth = new AuthService({ prisma, config, email });
    this.queue = new JobQueue({ prisma });
    this.lastReconcile = new Map();
  }

  provider(name = this.config.payment.provider) {
    return this.providerFactory(name, this.config);
  }

  // ---------------------------------------------------------------- checkout

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

    // Reuse a live pending charge (refreshing the page must not create new charges).
    const pending = await this.prisma.payment.findFirst({
      where: {
        companyId: company.id,
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
        subscriptionId: subscription.id,
        companyId: company.id,
        provider: provider.name,
        amountCents: subscription.priceCents,
        idempotencyKey: generateToken(18),
        expiresAt,
      },
    });

    try {
      const charge = await provider.createPixCharge({
        paymentId: payment.id,
        amountCents: payment.amountCents,
        description: 'Assinatura AutoPix — 30 dias',
        payer: { name: user.name, email: user.email, cnpj: company.cnpj, companyId: company.id },
        idempotencyKey: payment.idempotencyKey,
        expiresAt,
      });
      const updated = await this.prisma.payment.update({
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
      await this.activity.record({
        companyId: company.id,
        userId: user.id,
        type: 'PAYMENT',
        title: 'Cobrança Pix gerada',
        description: 'Aguardando pagamento de R$ 597,00.',
        source: provider.name,
        metadata: { paymentId: payment.id },
      });
      return updated;
    } catch (err) {
      logger.error('pix charge creation failed', { err, paymentId: payment.id, provider: provider.name });
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      throw unavailable('Não foi possível gerar o Pix agora. Tente novamente em instantes.');
    }
  }

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
        // Safety net when a webhook is delayed or lost.
        await this.reconcile(payment.id).catch((err) => logger.warn('reconcile failed', { err }));
        payment = await this.prisma.payment.findUnique({ where: { id }, select: PUBLIC_PAYMENT_SELECT });
      }
    }
    return payment;
  }

  /** Ask the provider for the authoritative status (throttled). */
  async reconcile(paymentId) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment?.providerPaymentId || payment.status !== 'PENDING' || payment.provider === 'mock') return null;
    const last = this.lastReconcile.get(paymentId) || 0;
    if (Date.now() - last < RECONCILE_EVERY_MS) return null;
    this.lastReconcile.set(paymentId, Date.now());

    const provider = this.provider(payment.provider);
    const { status, paidAt } = await provider.getPaymentStatus(payment.providerPaymentId);
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

  // ---------------------------------------------------------------- webhooks

  /**
   * Verify and apply a provider webhook.
   * @returns {Promise<{received:boolean, results:Array}>}
   */
  async processWebhook(providerName, req) {
    if (!isWebhookProviderAllowed(providerName, this.config)) throw notFound('Provedor não configurado.');
    const provider = this.provider(providerName);
    const events = await provider.handleWebhook(req); // throws WebhookSignatureError
    const results = [];
    for (const event of events) {
      results.push(await this.applyEvent({ provider: provider.name, ...event }));
    }
    return { received: true, results };
  }

  /**
   * Idempotent, transactional state transition:
   * validate → dedupe event → lock payment → update payment → activate
   * subscription → create activation token → commit.
   */
  async applyEvent({ provider, providerEventId, providerPaymentId, type, status, paidAt, payload }) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      // 1. Dedupe (ON CONFLICT DO NOTHING keeps the transaction healthy).
      const inserted = await tx.paymentEvent.createMany({
        data: [
          {
            provider,
            providerEventId,
            providerPaymentId,
            type: String(type || 'unknown').slice(0, 80),
            status,
            payload: payload ?? undefined,
          },
        ],
        skipDuplicates: true,
      });
      if (inserted.count === 0) return { duplicate: true };

      // 2. Lock the payment row so concurrent deliveries serialize.
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

      if (status === 'CONFIRMED') {
        if (payment.status === 'CONFIRMED') {
          await markProcessed();
          return { alreadyConfirmed: true, paymentId: payment.id };
        }
        const now = new Date();
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'CONFIRMED', paidAt: paidAt || now } });

        // 3. Activate / extend the subscription exactly once per payment.
        const sub = payment.subscription;
        const base =
          sub.status === 'ACTIVE' && sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
        const periodEnd = new Date(base.getTime() + PLAN.intervalDays * 24 * 60 * 60 * 1000);
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

        // 4. One-time activation token for a user who has no password yet.
        const owner = payment.company.users[0];
        let activation = null;
        if (owner && (owner.status === 'PENDING_PAYMENT' || owner.status === 'PENDING_ACTIVATION')) {
          await tx.user.update({ where: { id: owner.id }, data: { status: 'PENDING_ACTIVATION' } });
          const token = await this.auth.issueActivationToken(owner.id, tx);
          activation = { token, user: owner };
        }

        // 5. Start the agents.
        await this.queue.enqueue(payment.companyId, { trigger: 'PAYMENT', isDemo: this.config.demoMode }, tx);
        await this.activity.record(
          {
            companyId: payment.companyId,
            type: 'PAYMENT',
            title: 'Pagamento confirmado',
            description: 'Pix de R$ 597,00 confirmado pelo provedor.',
            source: provider,
            severity: 'SUCCESS',
            metadata: { paymentId: payment.id },
          },
          tx,
        );
        await this.activity.record(
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
        await markProcessed();
        return { confirmed: true, paymentId: payment.id, activation };
      }

      // Non-confirmation transitions.
      const terminal = { FAILED: 1, EXPIRED: 1, CANCELED: 1 };
      if (terminal[status] && payment.status === 'PENDING') {
        await tx.payment.update({ where: { id: payment.id }, data: { status } });
      } else if (status === 'REFUNDED' && payment.status === 'CONFIRMED') {
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
        await tx.subscription.update({
          where: { id: payment.subscriptionId },
          data: { status: 'CANCELED', canceledAt: new Date() },
        });
        await this.activity.record(
          {
            companyId: payment.companyId,
            type: 'PAYMENT',
            title: 'Pagamento estornado',
            description: 'A assinatura foi cancelada após o estorno.',
            source: provider,
            severity: 'WARNING',
          },
          tx,
        );
      }
      await markProcessed();
      return { updated: true, paymentId: payment.id, status };
    });

    // After commit: deliver the activation e-mail (never inside the transaction).
    if (outcome.activation && this.email) {
      const { token, user } = outcome.activation;
      await this.email
        .activationEmail({ to: user.email, name: user.name, link: `${this.config.appUrl}/activate/${token}` })
        .catch((err) => logger.error('activation email failed', { err }));
    }
    const { activation, ...safe } = outcome;
    return { ...safe, activationIssued: Boolean(activation) };
  }

  // ---------------------------------------------------- activation hand-off

  /**
   * The browser that paid (holding the onboarding session) receives a fresh
   * one-time activation token, so it can continue straight to /activate.
   */
  async claimActivation(paymentId, user) {
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, companyId: user.companyId } });
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
    const req = provider.buildWebhook(payment.providerPaymentId, 'CONFIRMED');
    return this.processWebhook('mock', req);
  }

  async listPayments(companyId) {
    return this.prisma.payment.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 24,
      select: { id: true, status: true, amountCents: true, provider: true, method: true, createdAt: true, paidAt: true, expiresAt: true },
    });
  }
}

export { WebhookSignatureError };
