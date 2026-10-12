import { getPrisma } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';

/**
 * Restricted financial back office (User.isPlatformAdmin only).
 * Read-mostly: admins can inspect everything and acknowledge/resolve
 * reconciliation issues with a note. There is NO endpoint to edit payment or
 * transaction states directly; money moves only through provider flows and
 * audited actions. Every admin write is audited.
 */
export class AdminService {
  constructor({ prisma = getPrisma(), audit, disputes, reconciliation } = {}) {
    this.prisma = prisma;
    this.audit = audit;
    this.disputes = disputes;
    this.reconciliation = reconciliation;
  }

  assert(user) {
    if (!user?.isPlatformAdmin) throw forbidden('Acesso restrito à administração da plataforma.');
  }

  async overview(user) {
    this.assert(user);
    const count = (model, where) => this.prisma[model].count({ where });
    const [pendingPayments, openIssues, failedEvents, refundsInFlight, openDisputes, payoutFailures] = await Promise.all([
      count('payment', { status: 'PENDING' }),
      count('reconciliationIssue', { status: { in: ['OPEN', 'ACKNOWLEDGED'] } }),
      count('paymentEvent', { processingStatus: { in: ['FAILED', 'FLAGGED'] } }),
      count('refund', { status: { in: ['REQUESTED', 'PROCESSING'] } }),
      count('transactionDispute', { status: { in: ['OPEN', 'UNDER_REVIEW', 'BUYER_RESPONSE', 'SELLER_RESPONSE'] } }),
      count('payout', { status: 'FAILED' }),
    ]);
    return { pendingPayments, openIssues, failedEvents, refundsInFlight, openDisputes, payoutFailures };
  }

  async payments(user, { status, provider, limit = 100 } = {}) {
    this.assert(user);
    return this.prisma.payment.findMany({
      where: { ...(status ? { status } : {}), ...(provider ? { provider } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      select: { id: true, kind: true, status: true, provider: true, amountCents: true, refundedCents: true, txid: true, isSandbox: true, companyId: true, transactionId: true, createdAt: true, paidAt: true, failureCode: true },
    });
  }

  async transactions(user, { status, limit = 100 } = {}) {
    this.assert(user);
    return this.prisma.marketplaceTransaction.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: Math.min(limit, 200) });
  }

  async providerEvents(user, { processingStatus, limit = 100 } = {}) {
    this.assert(user);
    return this.prisma.paymentEvent.findMany({
      where: processingStatus ? { processingStatus } : {},
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      select: { id: true, provider: true, providerEventId: true, providerPaymentId: true, type: true, status: true, processingStatus: true, payloadHash: true, error: true, createdAt: true, processedAt: true, paymentId: true },
    });
  }

  failedWebhooks(user, opts = {}) {
    return this.providerEvents(user, { ...opts, processingStatus: undefined }).then((rows) => rows.filter((r) => ['FAILED', 'FLAGGED'].includes(r.processingStatus)));
  }

  async issues(user, { status } = {}) {
    this.assert(user);
    return this.reconciliation.list({ status });
  }

  async refunds(user, { status } = {}) {
    this.assert(user);
    return this.prisma.refund.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async disputeList(user, { status } = {}) {
    this.assert(user);
    return this.disputes.list({ status });
  }

  async payoutFailures(user) {
    this.assert(user);
    return this.prisma.payout.findMany({ where: { status: 'FAILED' }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async auditLog(user, { companyId, transactionId, paymentId } = {}) {
    this.assert(user);
    return this.prisma.financialAuditLog.findMany({
      where: { ...(companyId ? { companyId } : {}), ...(transactionId ? { transactionId } : {}), ...(paymentId ? { paymentId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Acknowledge or resolve an issue — annotation only, never a money move. */
  async updateIssue(user, { id, status, note, ip }) {
    this.assert(user);
    if (!['ACKNOWLEDGED', 'RESOLVED'].includes(status)) throw badRequest('Status inválido.');
    if (status === 'RESOLVED' && (!note || note.trim().length < 10)) throw badRequest('Descreva a resolução (mínimo 10 caracteres).');
    const issue = await this.prisma.reconciliationIssue.findUnique({ where: { id } });
    if (!issue) throw notFound('Divergência não encontrada.');
    if (['RESOLVED', 'AUTO_REPAIRED'].includes(issue.status)) throw conflict('Divergência já encerrada.');
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.reconciliationIssue.update({
        where: { id },
        data: { status, resolutionNote: note?.trim() || issue.resolutionNote, ...(status === 'RESOLVED' ? { resolvedByUserId: user.id, resolvedAt: new Date() } : {}) },
      });
      await this.audit.log({ action: `RECONCILIATION_${status}`, source: 'ADMIN', userId: user.id, paymentId: issue.paymentId, ip, metadata: { issueId: id, kind: issue.kind } }, tx);
      return u;
    });
  }
}
