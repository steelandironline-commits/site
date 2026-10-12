import { getPrisma } from '../db.js';
import { badRequest } from '../errors.js';

/** Default rules: fixed 2% on every contract between the parties; legacy subscriptions are 100% TemPix revenue. */
export const DEFAULT_COMMISSION_RULES = [
  { name: 'Padrão TemPix 2%', transactionType: null, rateBps: 200, priority: 0 },
  { name: 'Assinatura TemPix', transactionType: 'SUBSCRIPTION', rateBps: 10000, priority: 10 },
];

/**
 * CommissionService — provider-independent. Commission is never hardcoded in
 * provider code; it comes from CommissionRule rows (most specific wins:
 * company+type > company > type > global, then priority).
 */
export class CommissionService {
  constructor({ prisma = getPrisma() } = {}) {
    this.prisma = prisma;
  }

  async ensureDefaults() {
    const count = await this.prisma.commissionRule.count();
    if (count) return;
    await this.prisma.commissionRule.createMany({ data: DEFAULT_COMMISSION_RULES });
  }

  async ruleFor({ transactionType, companyId }) {
    const rules = await this.prisma.commissionRule.findMany({
      where: {
        active: true,
        OR: [{ transactionType }, { transactionType: null }],
        AND: [{ OR: [{ companyId }, { companyId: null }] }],
      },
    });
    const score = (r) => (r.companyId ? 2 : 0) + (r.transactionType ? 1 : 0);
    rules.sort((a, b) => score(b) - score(a) || b.priority - a.priority);
    return rules[0] || null;
  }

  /** Pure calculation (cents, round half up), with min/max clamps. */
  static compute(grossCents, rule) {
    if (!Number.isInteger(grossCents) || grossCents <= 0) throw badRequest('Valor inválido.');
    const pct = Math.floor((grossCents * rule.rateBps + 5000) / 10000);
    let commission = pct + (rule.fixedAmountCents || 0);
    if (rule.minimumCents != null) commission = Math.max(commission, rule.minimumCents);
    if (rule.maximumCents != null) commission = Math.min(commission, rule.maximumCents);
    commission = Math.min(commission, grossCents);
    return { grossCents, commissionCents: commission, sellerNetCents: grossCents - commission, rateBps: rule.rateBps };
  }

  async quote({ transactionType, companyId, grossCents }) {
    await this.ensureDefaults();
    const rule = await this.ruleFor({ transactionType, companyId });
    if (!rule) throw badRequest('Nenhuma regra de comissão ativa.');
    return { ...CommissionService.compute(grossCents, rule), ruleId: rule.id, ruleName: rule.name, currency: rule.currency };
  }

  /**
   * Admin-only (via UPDATE_COMMISSION_RULE: platform admin + step-up). Rules
   * apply to NEW transactions; existing ones keep their snapshot.
   */
  async upsert({ id, ...data }, { user, audit, ip }) {
    if (data.minimumCents != null && data.maximumCents != null && data.minimumCents > data.maximumCents) throw badRequest('Mínimo maior que o máximo.');
    return this.prisma.$transaction(async (tx) => {
      const before = id ? await tx.commissionRule.findUnique({ where: { id } }) : null;
      if (id && !before) throw badRequest('Regra não encontrada.');
      const rule = id ? await tx.commissionRule.update({ where: { id }, data }) : await tx.commissionRule.create({ data });
      await audit.log({ action: id ? 'COMMISSION_RULE_UPDATED' : 'COMMISSION_RULE_CREATED', source: 'ADMIN', userId: user.id, ip, metadata: { ruleId: rule.id, before: before ? { rateBps: before.rateBps, active: before.active } : null, after: { rateBps: rule.rateBps, active: rule.active } } }, tx);
      return rule;
    });
  }

  async list() {
    return this.prisma.commissionRule.findMany({ orderBy: [{ active: 'desc' }, { priority: 'desc' }, { createdAt: 'asc' }] });
  }
}
