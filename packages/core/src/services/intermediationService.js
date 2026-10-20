import {
  BUYER_NEEDS,
  OPERATION_TYPES,
  capabilitySummary,
  labelOf,
  matchBuyerSupplier,
  normalizeOperationalProfile,
  profileCompleteness,
  profileSides,
} from '@autopix/shared';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { notFound } from '../errors.js';
import { accountTypeForHost } from '../security/area.js';

const MAX_CANDIDATES = 500;
const MAX_RESULTS = 12;
const OPEN_DEALS = ['AWAITING_PAYMENT', 'PAID', 'PROTECTED', 'READY_TO_RELEASE', 'DISPUTED'];

/** Public, anonymous description of a counterpart: what it is and where. */
function describe(company, profile) {
  const type = profile.types[0] ? labelOf(OPERATION_TYPES, profile.types[0]) : 'Empresa';
  const place = company.city ? `${company.city}${company.state ? `/${company.state}` : ''}` : null;
  return [type, place].filter(Boolean).join(' · ');
}

function needText(request) {
  if (!request) return null;
  const parts = [labelOf(BUYER_NEEDS, request.need)];
  if (request.minCapacityTons) parts.push(`${request.minCapacityTons} t`);
  if (request.requiresOperator) parts.push('com operador');
  if (request.location) parts.push(request.location);
  return parts.join(' · ');
}

/**
 * Intermediation overview for one company: its operational capabilities and
 * the buyers / suppliers whose real profiles are compatible. Counterparts are
 * shown anonymously (type and city only); contact happens through TemPix.
 */
export class IntermediationService {
  constructor({ prisma = getPrisma(), config = getConfig() } = {}) {
    this.prisma = prisma;
    this.config = config;
  }

  /**
   * Area mode (ARQUITETURA 6.6): the counterparts are only accounts of the caller's own area
   * (COMPANY for CNPJ, PERSON for CPF), and the caller must be of that area too. `area` comes from
   * the caller, never from global state; missing or unknown is an error. Legacy mode: no filter.
   */
  #accountTypeOf(area) {
    if (!this.config?.areas?.enabled) return null;
    const accountType = accountTypeForHost(area);
    if (!accountType) throw new TypeError(`IntermediationService: área inválida: ${String(area)}`);
    return accountType;
  }

  async overview(companyId, { area } = {}) {
    const areaType = this.#accountTypeOf(area);
    const me = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!me || (areaType && me.accountType !== areaType)) throw notFound('Empresa não encontrada.');
    const profile = normalizeOperationalProfile(me.operationalProfile);
    const sides = profileSides(profile);
    const self = { profile, city: me.city, state: me.state, serviceLocations: me.serviceLocations };

    const others = await this.prisma.company.findMany({
      where: {
        id: { not: companyId },
        ...(areaType ? { accountType: areaType } : {}),
        onboardingCompletedAt: { not: null },
        operationalProfileUpdatedAt: { not: null },
        users: { some: { status: 'ACTIVE' } },
      },
      select: { id: true, city: true, state: true, serviceLocations: true, operationalProfile: true },
      orderBy: { operationalProfileUpdatedAt: 'desc' },
      take: MAX_CANDIDATES,
    });

    const suppliers = [];
    const buyers = [];
    for (const o of others) {
      const op = normalizeOperationalProfile(o.operationalProfile);
      const other = { profile: op, city: o.city, state: o.state, serviceLocations: o.serviceLocations };
      const theirSides = profileSides(op);
      if (sides.buys && theirSides.supplies) {
        const m = matchBuyerSupplier(self, other);
        if (m.compatible) suppliers.push({ label: describe(o, op), score: m.score, reasons: m.reasons.slice(0, 3), need: needText(m.request) });
      }
      if (sides.supplies && theirSides.buys) {
        const m = matchBuyerSupplier(other, self);
        if (m.compatible) buyers.push({ label: describe(o, op), score: m.score, reasons: m.reasons.slice(0, 3), need: needText(m.request) });
      }
    }
    const top = (list) => list.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);

    const [opportunities, freight, workforce, deals] = await Promise.all([
      this.prisma.opportunity.count({ where: { companyId } }),
      this.prisma.freightRequest.count({ where: { companyId } }),
      this.prisma.workforceDemand.count({ where: { companyId } }),
      this.prisma.marketplaceTransaction.count({ where: { OR: [{ sellerCompanyId: companyId }, { buyerCompanyId: companyId }], status: { in: OPEN_DEALS } } }),
    ]);

    return {
      completeness: profileCompleteness(profile, { accountType: me.accountType, company: me }),
      hasProfile: Boolean(me.operationalProfileUpdatedAt),
      sides,
      capabilities: capabilitySummary(profile, me),
      counts: {
        opportunitiesReceived: opportunities,
        demandsPublished: freight + workforce,
        contractsInProgress: deals,
        equipmentOffered: profile.equipment.filter((e) => e.usage !== 'uso_interno').reduce((n, e) => n + (e.quantity ?? 1), 0),
        equipmentDemands: profile.buyer.requests.length || profile.buyer.needs.length,
        compatibleSuppliers: suppliers.length,
        compatibleBuyers: buyers.length,
      },
      suppliers: top(suppliers),
      buyers: top(buyers),
    };
  }
}
