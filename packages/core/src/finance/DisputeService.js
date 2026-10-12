import { formatCents } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';

export const OPEN_DISPUTE_STATUSES = ['OPEN', 'UNDER_REVIEW', 'BUYER_RESPONSE', 'SELLER_RESPONSE'];
const DISPUTABLE = ['PAID', 'PROTECTED', 'READY_TO_RELEASE'];

/**
 * Deterministic evidence summarizer. An LLM-backed summarizer can implement
 * the same interface — it may SUMMARIZE, never decide.
 */
export class EvidenceSummarizer {
  summarize({ transaction, dispute, timeline, trip }) {
    const facts = [
      `Valor: ${formatCents(transaction.grossAmount)} (${transaction.type}).`,
      transaction.sellerCompletedAt ? `Prestador informou conclusão em ${transaction.sellerCompletedAt.toLocaleString('pt-BR')}.` : 'Prestador não informou conclusão.',
      transaction.buyerConfirmedAt ? `Cliente confirmou a conclusão em ${transaction.buyerConfirmedAt.toLocaleString('pt-BR')}.` : 'Cliente não confirmou a conclusão.',
    ];
    if (trip) facts.push(`Transporte: ${trip.tripStatus}${trip.arrived ? ' (chegada ao destino registrada por geolocalização)' : ''}.`);
    const messages = dispute.metadata?.messages || [];
    facts.push(`${messages.length} manifestação(ões) registradas; ${timeline.length} eventos na linha do tempo.`);
    return {
      generatedBy: 'deterministic-v1',
      facts,
      reason: dispute.reason,
      note: 'Resumo automático das evidências. A decisão é sempre humana.',
    };
  }
}

/**
 * DisputeService — freezes release, collects both sides, and is resolved
 * ONLY by a platform administrator (human). AI may summarize evidence.
 */
export class DisputeService {
  constructor({ prisma = getPrisma(), events, audit, transactions, refunds, summarizer = new EvidenceSummarizer() } = {}) {
    this.prisma = prisma;
    this.events = events;
    this.audit = audit;
    this.transactions = transactions;
    this.refunds = refunds;
    this.summarizer = summarizer;
  }

  async open({ user, company, id, reason, description, source = 'WEB', ip }) {
    const t = await this.transactions.load(id, company.id);
    const role = this.transactions.roleOf(t, company.id);
    if (!t.buyerCompanyId) throw conflict('Disputas exigem cliente cadastrado no TemPix.');
    if (!DISPUTABLE.includes(t.status)) throw conflict('Esta transação não pode ser disputada agora.');
    return this.prisma.$transaction(async (tx) => {
      // Freeze: atomic move to DISPUTED, remembering where we came from.
      const moved = await tx.marketplaceTransaction.updateMany({ where: { id: t.id, status: t.status, NOT: { settlementStatus: 'RELEASING' } }, data: { status: 'DISPUTED' } });
      if (moved.count !== 1) throw conflict('Transação alterada por outra operação. Atualize a página.');
      const d = await tx.transactionDispute.create({
        data: { transactionId: t.id, openedByUserId: user.id, reason, description: description || null, metadata: { previousStatus: t.status, openedBy: role, messages: [] } },
      });
      await this.transactions.timeline(t.id, { type: 'DISPUTED', actorUserId: user.id, metadata: { disputeId: d.id } }, tx);
      await this.transactions.publishBoth({ ...t, status: 'DISPUTED' }, { type: 'DISPUTE_OPENED', userId: user.id, payload: { disputeId: d.id, link: `/app/pay/transactions/${t.id}` } }, tx, {
        sellerActivity: { type: 'PAYMENT', title: 'Disputa aberta — liberação congelada', description: `${t.description}: ${reason}`, source: 'TemPix Pay', severity: 'WARNING' },
        buyerActivity: { type: 'PAYMENT', title: 'Disputa aberta — liberação congelada', description: `${t.description}: ${reason}`, source: 'TemPix Pay', severity: 'WARNING' },
      });
      await this.audit.log({ action: 'DISPUTE_OPENED', source, userId: user.id, companyId: company.id, transactionId: t.id, paymentId: t.payment?.id, ip, metadata: { disputeId: d.id, previousStatus: t.status } }, tx);
      return d;
    });
  }

  async #loadForParty(disputeId, companyId) {
    const d = await this.prisma.transactionDispute.findUnique({ where: { id: disputeId }, include: { transaction: true } });
    if (!d) throw notFound('Disputa não encontrada.');
    const role = this.transactions.roleOf(d.transaction, companyId);
    if (!role) throw notFound('Disputa não encontrada.');
    return { d, role };
  }

  async respond({ user, company, disputeId, message, source = 'WEB' }) {
    const { d, role } = await this.#loadForParty(disputeId, company.id);
    if (!OPEN_DISPUTE_STATUSES.includes(d.status)) throw conflict('Disputa encerrada.');
    const messages = [...(d.metadata?.messages || []), { role, userId: user.id, message, at: new Date().toISOString() }].slice(-50);
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.transactionDispute.update({
        where: { id: d.id },
        data: { status: role === 'BUYER' ? 'BUYER_RESPONSE' : 'SELLER_RESPONSE', metadata: { ...d.metadata, messages } },
      });
      await this.transactions.timeline(d.transactionId, { type: 'DISPUTE_RESPONSE', title: role === 'BUYER' ? 'Cliente respondeu à disputa' : 'Prestador respondeu à disputa', actorUserId: user.id }, tx);
      await this.transactions.publishBoth(d.transaction, { type: 'DISPUTE_UPDATED', userId: user.id, payload: { disputeId: d.id, link: `/app/pay/transactions/${d.transactionId}` } }, tx, { sellerActivity: null, buyerActivity: null });
      await this.audit.log({ action: 'DISPUTE_RESPONSE', source, userId: user.id, companyId: company.id, transactionId: d.transactionId, metadata: { disputeId: d.id, role } }, tx);
      return u;
    });
  }

  /** Evidence summary for the human reviewer (stored on the dispute). */
  async summarize(disputeId) {
    const d = await this.prisma.transactionDispute.findUnique({ where: { id: disputeId }, include: { transaction: { include: { timeline: true } } } });
    if (!d) throw notFound('Disputa não encontrada.');
    let trip = null;
    if (d.transaction.referenceType === 'freightMatch') {
      const m = await this.prisma.freightMatch.findUnique({ where: { id: d.transaction.referenceId }, include: { tripEvents: { where: { type: 'DRIVER_ARRIVED_DESTINATION' }, take: 1 } } });
      if (m) trip = { tripStatus: m.tripStatus, arrived: m.tripEvents.length > 0 };
    }
    const summary = await this.summarizer.summarize({ transaction: d.transaction, dispute: d, timeline: d.transaction.timeline, trip });
    await this.prisma.transactionDispute.update({ where: { id: d.id }, data: { metadata: { ...d.metadata, summary } } });
    return summary;
  }

  async startReview({ admin, disputeId }) {
    const d = await this.prisma.transactionDispute.findUnique({ where: { id: disputeId } });
    if (!d) throw notFound('Disputa não encontrada.');
    if (!OPEN_DISPUTE_STATUSES.includes(d.status)) throw conflict('Disputa encerrada.');
    const u = await this.prisma.transactionDispute.update({ where: { id: d.id }, data: { status: 'UNDER_REVIEW' } });
    await this.audit.log({ action: 'DISPUTE_UNDER_REVIEW', source: 'ADMIN', userId: admin.id, transactionId: d.transactionId, metadata: { disputeId: d.id } });
    return u;
  }

  /**
   * Human resolution (platform admin, step-up confirmed).
   * outcome BUYER → refund via RefundService (completes only on provider confirmation);
   * outcome SELLER → back to the release path (still needs the normal release);
   * outcome CANCEL → dispute withdrawn, previous state restored.
   */
  async resolve({ admin, disputeId, outcome, note, refundAmountCents, ip }) {
    if (!admin?.isPlatformAdmin) throw forbidden();
    if (!note || note.trim().length < 10) throw badRequest('Descreva a decisão (mínimo 10 caracteres).');
    const d = await this.prisma.transactionDispute.findUnique({ where: { id: disputeId }, include: { transaction: { include: { payment: true } } } });
    if (!d) throw notFound('Disputa não encontrada.');
    if (!OPEN_DISPUTE_STATUSES.includes(d.status)) throw conflict('Disputa já resolvida.');
    const t = d.transaction;
    const previous = d.metadata?.previousStatus || 'PAID';
    const status = { BUYER: 'RESOLVED_BUYER', SELLER: 'RESOLVED_SELLER', CANCEL: 'CANCELLED' }[outcome];
    if (!status) throw badRequest('Decisão inválida.');
    let restore = previous;
    if (outcome === 'SELLER') restore = t.protectedFlow ? 'READY_TO_RELEASE' : 'PAID';

    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.transactionDispute.updateMany({ where: { id: d.id, status: { in: OPEN_DISPUTE_STATUSES } }, data: { status, resolvedByUserId: admin.id, resolutionNote: note.trim(), resolvedAt: new Date() } });
      if (moved.count !== 1) throw conflict('Disputa já resolvida.');
      await tx.marketplaceTransaction.update({
        where: { id: t.id },
        data: { status: restore, ...(outcome === 'SELLER' && !t.buyerConfirmedAt ? { buyerConfirmedAt: new Date(), sellerCompletedAt: t.sellerCompletedAt || new Date() } : {}) },
      });
      await this.transactions.timeline(t.id, { type: 'DISPUTE_RESOLVED', title: { BUYER: 'Disputa resolvida a favor do cliente', SELLER: 'Disputa resolvida a favor do prestador', CANCEL: 'Disputa encerrada' }[outcome], actorUserId: admin.id }, tx);
      await this.transactions.publishBoth({ ...t, status: restore }, { type: 'DISPUTE_RESOLVED', userId: admin.id, payload: { disputeId: d.id, outcome, link: `/app/pay/transactions/${t.id}` } }, tx, {
        sellerActivity: { type: 'PAYMENT', title: 'Disputa resolvida', description: t.description, source: 'TemPix Pay' },
        buyerActivity: { type: 'PAYMENT', title: 'Disputa resolvida', description: t.description, source: 'TemPix Pay' },
      });
      await this.audit.log({ action: 'DISPUTE_RESOLVED', source: 'ADMIN', userId: admin.id, companyId: t.sellerCompanyId, transactionId: t.id, paymentId: t.payment?.id, ip, metadata: { disputeId: d.id, outcome, previousStatus: previous } }, tx);
    });

    let refund = null;
    if (outcome === 'BUYER') {
      refund = await this.refunds.request({ user: admin, company: null, transactionId: t.id, amountCents: refundAmountCents ?? undefined, reason: `Disputa ${d.id}`, source: 'ADMIN', ip, isPlatformAdmin: true, viaDispute: true });
    }
    return { dispute: await this.prisma.transactionDispute.findUnique({ where: { id: d.id } }), refund };
  }

  async list({ status, limit = 100 } = {}) {
    return this.prisma.transactionDispute.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { transaction: { select: { id: true, description: true, grossAmount: true, status: true, sellerCompanyId: true, buyerCompanyId: true } } },
    });
  }
}
