import { formatCents } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { generateToken } from '../security/tokens.js';
import { FinancialError, capabilityError } from '../payments/errors.js';
import { getPaymentProvider } from '../payments/index.js';
import { logger } from '../logger.js';

const ACTIVE = ['REQUESTED', 'PROCESSING'];

/**
 * RefundService — full and partial refunds through the provider.
 * A refund is COMPLETED only when the provider confirms it (synchronous
 * response, webhook or reconciliation) — never on request.
 */
export class RefundService {
  constructor({ prisma = getPrisma(), config = getConfig(), events, audit, transactions, providerFactory = getPaymentProvider } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.events = events;
    this.audit = audit;
    this.transactions = transactions;
    this.providerFactory = providerFactory;
  }

  async #remaining(payment) {
    const pending = await this.prisma.refund.aggregate({ where: { paymentId: payment.id, status: { in: ACTIVE } }, _sum: { amountCents: true } });
    return payment.amountCents - payment.refundedCents - (pending._sum.amountCents ?? 0);
  }

  /**
   * @param {object} o
   * @param {string} o.transactionId  marketplace transaction (seller side), or
   * @param {string} o.paymentId      any payment (platform admin only)
   */
  async request({ user, company, transactionId, paymentId, amountCents, reason, source = 'WEB', ip, isPlatformAdmin = false, viaDispute = false }) {
    let payment;
    let t = null;
    if (transactionId) {
      t = isPlatformAdmin
        ? await this.prisma.marketplaceTransaction.findUnique({ where: { id: transactionId }, include: { payment: true } })
        : await this.transactions.load(transactionId, company.id);
      if (!t) throw notFound('Transação não encontrada.');
      if (!isPlatformAdmin && this.transactions.roleOf(t, company.id) !== 'SELLER') throw forbidden('Apenas o vendedor pode reembolsar.');
      if (t.status === 'RELEASED') throw conflict('O pagamento já foi liberado ao prestador; abra uma disputa.');
      if (t.status === 'DISPUTED' && !viaDispute) throw conflict('Há uma disputa aberta; o reembolso será decidido nela.');
      payment = t.payment;
    } else {
      if (!isPlatformAdmin) throw forbidden();
      payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    }
    if (!payment) throw notFound('Pagamento não encontrado.');
    if (payment.status !== 'CONFIRMED') throw conflict('Só é possível reembolsar pagamentos confirmados.');

    const provider = this.providerFactory(payment.provider, this.config);
    const caps = provider.getCapabilities().capabilities;
    if (!caps.refund) throw capabilityError('refund');
    const remaining = await this.#remaining(payment);
    const amount = amountCents ?? remaining;
    if (!Number.isInteger(amount) || amount < 1) throw badRequest('Valor de reembolso inválido.');
    if (amount > remaining) throw badRequest(`Valor acima do disponível para reembolso (${formatCents(remaining)}).`);
    if (amount < payment.amountCents - payment.refundedCents && !caps.partialRefund) throw capabilityError('partialRefund');

    const refund = await this.prisma.$transaction(async (tx) => {
      const r = await tx.refund.create({
        data: { paymentId: payment.id, transactionId: t?.id ?? null, amountCents: amount, reason: reason || null, idempotencyKey: `rf-${generateToken(12)}`, requestedByUserId: user.id },
      });
      if (t) await this.transactions.timeline(t.id, { type: 'REFUND_REQUESTED', actorUserId: user.id, title: `Reembolso solicitado · ${formatCents(amount)}`, metadata: { refundId: r.id } }, tx);
      await this.events.publish(
        {
          type: 'REFUND_REQUESTED',
          companyId: payment.companyId,
          userId: user.id,
          aggregateType: 'payment',
          aggregateId: payment.id,
          payload: { amountCents: amount, refundId: r.id, link: t ? `/app/pay/transactions/${t.id}` : null },
          activity: { type: 'PAYMENT', title: `Reembolso solicitado · ${formatCents(amount)}`, description: 'Aguardando confirmação do parceiro financeiro.', source: 'TemPix Pay', severity: 'WARNING' },
        },
        tx,
      );
      await this.audit.log({ action: 'REFUND_REQUESTED', source, userId: user.id, companyId: company?.id ?? null, transactionId: t?.id ?? null, paymentId: payment.id, ip, metadata: { amountCents: amount, refundId: r.id, partial: amount < payment.amountCents } }, tx);
      return r;
    });

    return this.#submit(refund, payment, provider, reason);
  }

  async #submit(refund, payment, provider, reason) {
    let res;
    try {
      res = await provider.refundPayment(payment.providerPaymentId, { amountCents: refund.amountCents, idempotencyKey: refund.idempotencyKey, reason });
    } catch (err) {
      const code = err instanceof FinancialError ? err.code : 'REFUND_FAILED';
      logger.warn('refund request failed', { refundId: refund.id, code });
      if (err.retryable) {
        // Unknown outcome — keep it REQUESTED; reconciliation retries with the same idempotency key.
        await this.prisma.refund.update({ where: { id: refund.id }, data: { error: code } });
        await this.#issue({ paymentId: payment.id, refundId: refund.id, kind: 'REFUND_PENDING_UNKNOWN', localStatus: 'REQUESTED', providerStatus: code });
        return this.prisma.refund.findUnique({ where: { id: refund.id } });
      }
      await this.fail(refund.id, code);
      throw err instanceof FinancialError ? err : new FinancialError('REFUND_FAILED');
    }
    await this.prisma.refund.update({ where: { id: refund.id }, data: { status: 'PROCESSING', providerRefundId: res.providerRefundId, error: null } });
    if (res.status === 'COMPLETED') return this.complete(refund.id, { source: 'SYSTEM' });
    if (res.status === 'FAILED') return this.fail(refund.id, 'REFUND_FAILED');
    return this.prisma.refund.findUnique({ where: { id: refund.id } });
  }

  async #issue(data, tx = this.prisma) {
    const exists = await tx.reconciliationIssue.findFirst({ where: { paymentId: data.paymentId, refundId: data.refundId ?? undefined, kind: data.kind, status: { in: ['OPEN', 'ACKNOWLEDGED'] } } });
    if (!exists) await tx.reconciliationIssue.create({ data });
  }

  /** Provider confirmed the refund. Idempotent. */
  async complete(refundId, { source = 'SYSTEM' } = {}, outerTx) {
    const run = async (tx) => {
      const moved = await tx.refund.updateMany({ where: { id: refundId, status: { in: ACTIVE } }, data: { status: 'COMPLETED', completedAt: new Date(), error: null } });
      const r = await tx.refund.findUnique({ where: { id: refundId }, include: { payment: true } });
      if (moved.count !== 1) return r;
      const p = await tx.payment.update({ where: { id: r.paymentId }, data: { refundedCents: { increment: r.amountCents } } });
      const full = p.refundedCents >= p.amountCents;
      if (full) {
        await tx.payment.update({ where: { id: p.id }, data: { status: 'REFUNDED', refundedAt: new Date(), protectionStatus: p.kind === 'CHARGE' ? 'REFUNDED' : undefined } });
        if (p.kind === 'SUBSCRIPTION' && p.subscriptionId) await tx.subscription.update({ where: { id: p.subscriptionId }, data: { status: 'CANCELED', canceledAt: new Date() } });
      }
      const t = p.transactionId ? await tx.marketplaceTransaction.findUnique({ where: { id: p.transactionId } }) : null;
      if (t) {
        if (full) await tx.marketplaceTransaction.update({ where: { id: t.id }, data: { status: 'REFUNDED', settlementStatus: 'REFUNDED' } });
        await this.transactions.timeline(t.id, { type: 'REFUNDED', title: `${full ? 'Reembolso concluído' : 'Reembolso parcial concluído'} · ${formatCents(r.amountCents)}`, metadata: { refundId: r.id } }, tx);
      }
      const event = {
        type: 'PAYMENT_REFUNDED',
        payload: { amountCents: r.amountCents, full, refundId: r.id, kind: p.kind, link: t ? `/app/pay/transactions/${t.id}` : null },
        activity: { type: 'PAYMENT', title: `Reembolso concluído · ${formatCents(r.amountCents)}`, description: 'Confirmado pelo parceiro financeiro.', source: 'TemPix Pay', severity: 'WARNING' },
      };
      if (t) await this.transactions.publishBoth(t, event, tx);
      else await this.events.publish({ ...event, companyId: p.companyId, aggregateType: 'payment', aggregateId: p.id }, tx);
      await this.events.publish({ type: 'REFUND_COMPLETED', companyId: p.companyId, aggregateType: 'payment', aggregateId: p.id, payload: { refundId: r.id, amountCents: r.amountCents } }, tx);
      await this.audit.log({ action: 'REFUND_COMPLETED', source, companyId: p.companyId, transactionId: t?.id ?? null, paymentId: p.id, metadata: { refundId: r.id, amountCents: r.amountCents, full } }, tx);
      return tx.refund.findUnique({ where: { id: refundId } });
    };
    return outerTx ? run(outerTx) : this.prisma.$transaction(run);
  }

  async fail(refundId, code = 'REFUND_FAILED', outerTx) {
    const run = async (tx) => {
      const moved = await tx.refund.updateMany({ where: { id: refundId, status: { in: ACTIVE } }, data: { status: 'FAILED', error: code } });
      const r = await tx.refund.findUnique({ where: { id: refundId }, include: { payment: true } });
      if (moved.count === 1) {
        if (r.transactionId) await this.transactions.timeline(r.transactionId, { type: 'REFUND_FAILED', title: 'Reembolso não realizado pelo parceiro financeiro', metadata: { refundId } }, tx);
        await this.audit.log({ action: 'REFUND_FAILED', source: 'SYSTEM', companyId: r.payment.companyId, transactionId: r.transactionId, paymentId: r.paymentId, metadata: { refundId, code } }, tx);
      }
      return r;
    };
    return outerTx ? run(outerTx) : this.prisma.$transaction(run);
  }

  /** Webhook path (inside PaymentService.applyEvent's transaction). */
  async applyProviderEvent(tx, payment, { refundProviderId, status, amountCents }) {
    const r = await tx.refund.findFirst({ where: { paymentId: payment.id, providerRefundId: refundProviderId } });
    if (!r) {
      await this.#issue({ paymentId: payment.id, kind: 'UNKNOWN_REFUND', providerStatus: status, details: { refundProviderId, amountCents } }, tx);
      return { flagged: 'unknown_refund' };
    }
    if (amountCents != null && amountCents !== r.amountCents) {
      await this.#issue({ paymentId: payment.id, refundId: r.id, kind: 'REFUND_AMOUNT_MISMATCH', localStatus: r.status, providerStatus: status, details: { expected: r.amountCents, received: amountCents } }, tx);
      return { flagged: 'refund_amount_mismatch' };
    }
    if (status === 'COMPLETED') await this.complete(r.id, { source: 'SYSTEM' }, tx);
    else if (status === 'FAILED') await this.fail(r.id, 'REFUND_FAILED', tx);
    return { refund: r.id, status };
  }

  /** Reconciliation path: ask the provider; resubmit REQUESTED ones with the same key. */
  async sync(refund) {
    const payment = refund.payment ?? (await this.prisma.payment.findUnique({ where: { id: refund.paymentId } }));
    const provider = this.providerFactory(payment.provider, this.config);
    if (refund.status === 'REQUESTED' && !refund.providerRefundId) return this.#submit(refund, payment, provider, refund.reason);
    const { status } = await provider.getRefundStatus(payment.providerPaymentId, refund.providerRefundId);
    if (status === 'COMPLETED') return this.complete(refund.id, { source: 'WORKER' });
    if (status === 'FAILED') {
      await this.#issue({ paymentId: payment.id, refundId: refund.id, kind: 'REFUND_FAILED', localStatus: refund.status, providerStatus: status });
      return this.fail(refund.id, 'REFUND_FAILED');
    }
    return refund;
  }
}
