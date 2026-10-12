import { formatCents } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { badRequest, conflict, forbidden } from '../errors.js';
import { FinancialError } from '../payments/errors.js';
import { logger } from '../logger.js';

const OPEN_DISPUTE = { in: ['OPEN', 'UNDER_REVIEW', 'BUYER_RESPONSE', 'SELLER_RESPONSE'] };

/**
 * ProtectedPaymentService — "Pagamento protegido".
 *
 * Active ONLY when the configured provider reports `protectedFlow` plus a
 * real money-movement capability (`payout` or `split`). AutoPix never holds
 * funds in an ordinary bank account as unofficial escrow: the money stays
 * with the financial partner and moves only through its authorized flow.
 *
 * Release requires: buyer confirmation of completion → RELEASE_PAYMENT via
 * ActionEngine (sensitive, step-up challenge, web/app session only) → provider
 * call with an idempotency key. GPS, WhatsApp buttons, frontend state and LLM
 * output are never sufficient.
 */
export class ProtectedPaymentService {
  constructor({ prisma = getPrisma(), config = getConfig(), events, audit, transactions } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.events = events;
    this.audit = audit;
    this.transactions = transactions;
  }

  status() {
    const { capabilities: c, reasons, provider, label } = this.transactions.capabilities();
    const enabled = Boolean(c.protectedFlow && (c.payout || c.split));
    return {
      enabled,
      provider,
      label,
      mechanism: enabled ? (c.split ? 'split' : 'payout') : null,
      reason: enabled ? null : reasons.protectedFlow || reasons.payout || 'O parceiro financeiro atual não oferece pagamento protegido.',
    };
  }

  /** Buyer confirms the service/delivery was completed. Never moves money. */
  async confirmCompletion({ user, company, id, source = 'WEB', ip }) {
    const t = await this.transactions.load(id, company.id);
    if (this.transactions.roleOf(t, company.id) !== 'BUYER') throw forbidden('Apenas o cliente confirma a conclusão.');
    if (!['PAID', 'PROTECTED'].includes(t.status)) throw conflict('Esta transação não aguarda confirmação.');
    if (!t.sellerCompletedAt) throw conflict('O prestador ainda não informou a conclusão.');
    if (t.buyerConfirmedAt) return t;
    if (await this.prisma.transactionDispute.count({ where: { transactionId: t.id, status: OPEN_DISPUTE } })) throw conflict('Há uma disputa aberta.');

    return this.prisma.$transaction(async (tx) => {
      const next = t.protectedFlow ? 'READY_TO_RELEASE' : t.status;
      const moved = await tx.marketplaceTransaction.updateMany({
        where: { id: t.id, status: t.status, buyerConfirmedAt: null },
        data: { buyerConfirmedAt: new Date(), status: next },
      });
      if (moved.count !== 1) throw conflict('Transação alterada por outra operação. Atualize a página.');
      const u = await tx.marketplaceTransaction.findUnique({ where: { id: t.id } });
      await this.transactions.timeline(t.id, { type: 'BUYER_CONFIRMED', actorUserId: user.id }, tx);
      if (t.protectedFlow) {
        await this.transactions.timeline(t.id, { type: 'READY_TO_RELEASE' }, tx);
        await this.transactions.publishBoth(
          u,
          { type: 'PROTECTED_PAYMENT_RELEASE_REQUESTED', userId: user.id, payload: { amountCents: t.sellerNetAmount, link: `/app/pay/transactions/${t.id}`, stage: 'READY_TO_RELEASE' } },
          tx,
          {
            sellerActivity: { type: 'PAYMENT', title: 'Cliente confirmou a conclusão', description: `${t.description} · aguardando liberação`, source: 'AutoPix Pay', severity: 'SUCCESS' },
            buyerActivity: { type: 'PAYMENT', title: 'Pagamento pronto para liberação. Confirme no AutoPix.', description: t.description, source: 'AutoPix Pay', severity: 'WARNING' },
          },
        );
      } else {
        await this.transactions.publishBoth(u, { type: 'SERVICE_CONFIRMED', userId: user.id, payload: { link: `/app/pay/transactions/${t.id}` } }, tx, {
          sellerActivity: { type: 'PAYMENT', title: 'Cliente confirmou a conclusão', description: t.description, source: 'AutoPix Pay', severity: 'SUCCESS' },
          buyerActivity: null,
        });
      }
      await this.audit.log({ action: 'COMPLETION_CONFIRMED', source, userId: user.id, companyId: company.id, transactionId: t.id, ip }, tx);
      return u;
    });
  }

  /**
   * Execute the release through the provider. Only reachable through the
   * RELEASE_PAYMENT action after a confirmed SensitiveActionChallenge.
   */
  async release({ user, company, id, source = 'WEB', ip, isPlatformAdmin = false }) {
    const st = this.status();
    if (!st.enabled) throw new FinancialError('PROTECTED_FLOW_NOT_SUPPORTED', { detail: st.reason });
    const t = isPlatformAdmin
      ? await this.prisma.marketplaceTransaction.findUnique({ where: { id }, include: { payment: true } })
      : await this.transactions.load(id, company.id);
    if (!t) throw badRequest('Transação não encontrada.');
    if (!isPlatformAdmin && this.transactions.roleOf(t, company.id) !== 'BUYER') throw forbidden('Apenas o cliente libera o pagamento.');
    if (!t.protectedFlow) throw conflict('Esta transação não usa pagamento protegido.');
    if (t.status !== 'READY_TO_RELEASE' || !t.buyerConfirmedAt) throw conflict('A conclusão precisa ser confirmada antes da liberação.');
    if (t.payment?.status !== 'CONFIRMED') throw conflict('Pagamento não confirmado pelo parceiro financeiro.');
    if (await this.prisma.transactionDispute.count({ where: { transactionId: t.id, status: OPEN_DISPUTE } })) throw conflict('Há uma disputa aberta.');

    const seller = await this.prisma.company.findUnique({ where: { id: t.sellerCompanyId } });
    if (st.mechanism === 'payout' && !seller.payoutPixKey) throw badRequest('O prestador ainda não cadastrou a chave Pix de recebimento.');

    // Atomic reservation: exactly one release attempt at a time.
    const reserved = await this.prisma.marketplaceTransaction.updateMany({
      where: { id: t.id, status: 'READY_TO_RELEASE', NOT: { settlementStatus: 'RELEASING' } },
      data: { settlementStatus: 'RELEASING' },
    });
    if (reserved.count !== 1) throw conflict('A liberação já está em andamento.');

    const idempotencyKey = `release-${t.id}`; // stable: a retry can never pay twice
    const provider = this.transactions.provider();
    await this.prisma.payout.upsert({
      where: { idempotencyKey },
      create: { transactionId: t.id, amountCents: t.sellerNetAmount, idempotencyKey, status: 'REQUESTED' },
      update: { status: 'REQUESTED', error: null },
    });
    await this.audit.log({ action: 'RELEASE_REQUESTED_TO_PROVIDER', source, userId: user.id, companyId: company.id, transactionId: t.id, paymentId: t.payment.id, ip, metadata: { mechanism: st.mechanism, amountCents: t.sellerNetAmount, idempotencyKey } });

    let result;
    try {
      if (st.mechanism === 'split') {
        const allocations = [
          { beneficiaryType: 'SELLER', beneficiaryReference: t.sellerCompanyId, grossShare: t.grossAmount - t.commissionAmount, netShare: t.sellerNetAmount },
          { beneficiaryType: 'PLATFORM', beneficiaryReference: 'autopix', grossShare: t.commissionAmount, netShare: t.commissionAmount },
        ];
        result = { split: await provider.createSplit({ payment: t.payment, allocations, idempotencyKey }), allocations };
      } else {
        result = {
          payout: await provider.createPayout({
            amountCents: t.sellerNetAmount,
            beneficiary: { pixKey: seller.payoutPixKey, pixKeyType: seller.payoutPixKeyType, name: seller.name, document: seller.cnpj },
            idempotencyKey,
            description: `AutoPix Pay ${t.id.slice(-8)}`,
          }),
        };
      }
    } catch (err) {
      const code = err instanceof FinancialError ? err.code : 'PROVIDER_UNAVAILABLE';
      logger.warn('release failed at provider', { transactionId: t.id, code });
      await this.prisma.$transaction(async (tx) => {
        await tx.marketplaceTransaction.update({ where: { id: t.id }, data: { settlementStatus: 'RELEASE_FAILED' } });
        await tx.payout.update({ where: { idempotencyKey }, data: { status: 'FAILED', error: code } });
        if (err.retryable || code === 'PROVIDER_UNAVAILABLE') {
          // Outcome unknown at the provider — flag for reconciliation, never assume.
          await tx.reconciliationIssue.create({
            data: { paymentId: t.payment.id, kind: 'PAYOUT_FAILED', localStatus: 'READY_TO_RELEASE', providerStatus: code, details: { transactionId: t.id, idempotencyKey } },
          });
        }
        await this.audit.log({ action: 'RELEASE_FAILED', source, userId: user.id, companyId: company.id, transactionId: t.id, paymentId: t.payment.id, metadata: { code } }, tx);
      });
      throw err instanceof FinancialError ? err : new FinancialError('PROVIDER_UNAVAILABLE');
    }

    return this.prisma.$transaction(async (tx) => {
      const completed = result.payout?.status === 'COMPLETED';
      const settlementStatus = result.split ? 'SPLIT_PROCESSING' : completed ? 'PAYOUT_COMPLETED' : 'PAYOUT_PROCESSING';
      const u = await tx.marketplaceTransaction.update({ where: { id: t.id }, data: { status: 'RELEASED', releasedAt: new Date(), settlementStatus } });
      await tx.payout.update({
        where: { idempotencyKey },
        data: {
          status: result.split ? 'PROCESSING' : completed ? 'COMPLETED' : 'PROCESSING',
          providerPayoutId: result.payout?.providerPayoutId || result.split?.providerSplitId || null,
          completedAt: completed ? new Date() : null,
        },
      });
      if (result.split) {
        await tx.paymentAllocation.createMany({
          data: result.allocations.map((a, i) => ({ paymentId: t.payment.id, ...a, providerAllocationId: result.split.allocations?.[i]?.providerAllocationId ?? null, status: 'PROCESSING' })),
        });
      }
      await this.transactions.timeline(t.id, { type: 'RELEASED', actorUserId: user.id, metadata: { mechanism: st.mechanism } }, tx);
      const link = `/app/pay/transactions/${t.id}`;
      await this.transactions.publishBoth(u, { type: 'PROTECTED_PAYMENT_RELEASED', userId: user.id, payload: { amountCents: t.sellerNetAmount, link } }, tx, {
        sellerActivity: { type: 'PAYMENT', title: `Pagamento liberado · ${formatCents(t.sellerNetAmount)}`, description: `${t.description} · processado pelo parceiro financeiro`, source: 'AutoPix Pay', severity: 'SUCCESS' },
        buyerActivity: { type: 'PAYMENT', title: 'Pagamento liberado ao prestador', description: t.description, source: 'AutoPix Pay' },
      });
      if (result.split) {
        await this.events.publish({ type: 'SPLIT_PROCESSED', companyId: t.sellerCompanyId, aggregateType: 'transaction', aggregateId: t.id, payload: { commissionCents: t.commissionAmount, netCents: t.sellerNetAmount, link } }, tx);
      } else {
        await this.events.publish({ type: 'PAYOUT_CREATED', companyId: t.sellerCompanyId, aggregateType: 'transaction', aggregateId: t.id, payload: { amountCents: t.sellerNetAmount, link } }, tx);
        if (completed) await this.events.publish({ type: 'PAYOUT_CONFIRMED', companyId: t.sellerCompanyId, aggregateType: 'transaction', aggregateId: t.id, payload: { amountCents: t.sellerNetAmount, link } }, tx);
      }
      await this.audit.log(
        { action: 'PAYMENT_RELEASED', source, userId: user.id, companyId: company.id, transactionId: t.id, paymentId: t.payment.id, ip, metadata: { mechanism: st.mechanism, netCents: t.sellerNetAmount, commissionCents: t.commissionAmount, idempotencyKey } },
        tx,
      );
      return u;
    });
  }
}
