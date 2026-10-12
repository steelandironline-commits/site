import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { getPaymentProvider } from '../payments/index.js';
import { logger } from '../logger.js';

const OPEN = ['OPEN', 'ACKNOWLEDGED'];

/**
 * PaymentReconciliationJob — compares local state with the provider.
 *
 * Safe repairs only: a missed webhook for a PENDING charge whose provider
 * status is CONFIRMED with the SAME amount is applied through the normal
 * idempotent event path and recorded as AUTO_REPAIRED. Everything ambiguous
 * (amount differences, a confirmed payment the provider no longer reports,
 * failed/unknown refunds or payouts) becomes an OPEN ReconciliationIssue for a
 * human. Money differences are never resolved silently.
 */
export class ReconciliationService {
  constructor({ prisma = getPrisma(), config = getConfig(), payments, refunds, events, providerFactory = getPaymentProvider } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.payments = payments;
    this.refunds = refunds;
    this.events = events;
    this.providerFactory = providerFactory;
  }

  async issue(data) {
    const exists = await this.prisma.reconciliationIssue.findFirst({
      where: { paymentId: data.paymentId ?? null, kind: data.kind, status: data.status === 'AUTO_REPAIRED' ? 'AUTO_REPAIRED' : { in: OPEN }, ...(data.refundId ? { refundId: data.refundId } : {}) },
    });
    if (exists) return exists;
    const created = await this.prisma.reconciliationIssue.create({ data });
    if (created.status === 'OPEN') logger.warn('reconciliation issue', { kind: data.kind, paymentId: data.paymentId });
    return created;
  }

  async run({ minAgeMs = 120_000, limit = 50, now = new Date() } = {}) {
    const stats = { checked: 0, repaired: 0, flagged: 0, refunds: 0, errors: 0 };
    const before = new Date(now.getTime() - minAgeMs);

    // 1. PENDING charges older than minAge — missed webhooks / expiries.
    const pending = await this.prisma.payment.findMany({
      where: { status: 'PENDING', providerPaymentId: { not: null }, createdAt: { lt: before } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    for (const p of pending) {
      try {
        stats.checked += 1;
        const st = await this.providerFactory(p.provider, this.config).getPaymentStatus(p.providerPaymentId);
        if (st.status === 'PENDING') {
          if (p.expiresAt && p.expiresAt < now && p.provider === 'mock') await this.#apply(p, 'EXPIRED');
          continue;
        }
        if (st.status === 'CONFIRMED' && st.amountCents != null && st.amountCents !== p.amountCents) {
          await this.issue({ paymentId: p.id, kind: 'AMOUNT_MISMATCH', localStatus: p.status, providerStatus: st.status, details: { expected: p.amountCents, received: st.amountCents } });
          stats.flagged += 1;
          continue;
        }
        const r = await this.#apply(p, st.status, st.paidAt, st.amountCents);
        if (st.status === 'CONFIRMED' && (r.confirmed || r.flagged)) {
          if (r.confirmed) {
            await this.issue({ paymentId: p.id, kind: 'MISSED_WEBHOOK', localStatus: 'PENDING', providerStatus: 'CONFIRMED', status: 'AUTO_REPAIRED', details: { note: 'Confirmação aplicada pela reconciliação (mesmo valor).' } });
            stats.repaired += 1;
          } else stats.flagged += 1;
        }
      } catch (err) {
        stats.errors += 1;
        logger.warn('reconcile payment failed', { paymentId: p.id, code: err.code || err.name });
      }
    }

    // 2. Recently confirmed charges — verify once that the provider agrees.
    const confirmed = await this.prisma.payment.findMany({
      where: { status: 'CONFIRMED', providerPaymentId: { not: null }, paidAt: { gt: new Date(now.getTime() - 86_400_000) }, provider: { not: 'mock' } },
      take: limit,
    });
    for (const p of confirmed) {
      if (p.metadata?.reconciledAt) continue;
      try {
        stats.checked += 1;
        const st = await this.providerFactory(p.provider, this.config).getPaymentStatus(p.providerPaymentId);
        if (!['CONFIRMED', 'REFUNDED'].includes(st.status) || (st.amountCents != null && st.amountCents !== p.amountCents)) {
          await this.issue({ paymentId: p.id, kind: 'STATUS_DIVERGENCE', localStatus: p.status, providerStatus: st.status, details: { expected: p.amountCents, received: st.amountCents ?? null } });
          stats.flagged += 1;
        } else {
          await this.prisma.payment.update({ where: { id: p.id }, data: { metadata: { ...(p.metadata || {}), reconciledAt: now.toISOString() } } });
        }
      } catch (err) {
        stats.errors += 1;
        logger.warn('reconcile confirmed payment failed', { paymentId: p.id, code: err.code || err.name });
      }
    }

    // 3. Refunds in flight — complete only on provider confirmation.
    const refunds = await this.prisma.refund.findMany({
      where: { status: { in: ['REQUESTED', 'PROCESSING'] }, createdAt: { lt: new Date(now.getTime() - 10_000) } },
      include: { payment: true },
      take: limit,
    });
    for (const r of refunds) {
      try {
        stats.refunds += 1;
        await this.refunds.sync(r);
      } catch (err) {
        stats.errors += 1;
        logger.warn('reconcile refund failed', { refundId: r.id, code: err.code || err.name });
      }
    }

    // 4. Failed payouts surface for humans (no automatic re-send).
    const failedPayouts = await this.prisma.payout.findMany({ where: { status: 'FAILED' }, include: { transaction: { select: { payment: { select: { id: true } } } } }, take: limit });
    for (const po of failedPayouts) {
      await this.issue({ paymentId: po.transaction?.payment?.id ?? null, kind: 'PAYOUT_FAILED', localStatus: 'FAILED', providerStatus: po.error, details: { payoutId: po.id, idempotencyKey: po.idempotencyKey } });
    }
    return stats;
  }

  #apply(p, status, paidAt = null, amountCents = null) {
    return this.payments.applyEvent({
      provider: p.provider,
      providerEventId: `reconcile:${p.providerPaymentId}:${status}`,
      providerPaymentId: p.providerPaymentId,
      type: 'reconcile',
      status,
      paidAt,
      amountCents,
      payload: { source: 'reconcile' },
    });
  }

  async list({ status, limit = 100 } = {}) {
    return this.prisma.reconciliationIssue.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: limit });
  }
}
