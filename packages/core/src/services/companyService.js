import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { badRequest, notFound } from '../errors.js';
import { ActivityService } from './activityService.js';
import { JobQueue } from '../engine/jobQueue.js';

export const COMPANY_FIELDS = [
  'name',
  'cnpj',
  'website',
  'instagram',
  'phone',
  'city',
  'state',
  'serviceLocations',
  'serviceRadiusKm',
  'description',
  'products',
  'services',
  'idealCustomer',
  'averageTicket',
  'minimumDeal',
  'preferredIndustries',
  'excludedIndustries',
  'keywords',
  'operationalProfile',
];

// Fields whose change alters what the agents search for.
const SEARCH_FIELDS = new Set([
  'serviceLocations',
  'serviceRadiusKm',
  'city',
  'state',
  'products',
  'services',
  'idealCustomer',
  'averageTicket',
  'minimumDeal',
  'preferredIndustries',
  'excludedIndustries',
  'keywords',
  'description',
  'operationalProfile',
]);

export function pickCompanyFields(data) {
  const out = {};
  for (const key of COMPANY_FIELDS) if (data[key] !== undefined) out[key] = data[key];
  // The operational profile is stored whole (already validated) with its timestamp.
  if (out.operationalProfile) out.operationalProfileUpdatedAt = new Date();
  return out;
}

export class CompanyService {
  constructor({ prisma = getPrisma(), config = getConfig() } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.activity = new ActivityService({ prisma });
    this.queue = new JobQueue({ prisma });
  }

  async get(companyId) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw notFound('Empresa não encontrada.');
    return company;
  }

  /**
   * Update the profile. Changes to search-relevant fields bump
   * searchConfigVersion and queue a fresh search with the new configuration.
   */
  async update(companyId, data, { userId } = {}) {
    const current = await this.get(companyId);
    const patch = pickCompanyFields(data);
    if ('cnpj' in patch && current.cnpj && patch.cnpj !== current.cnpj) {
      throw badRequest('O CNPJ é o login da empresa e não pode ser alterado.');
    }
    if (current.accountType === 'PERSON') delete patch.cnpj;
    const changed = Object.keys(patch).filter((k) => k !== 'operationalProfileUpdatedAt' && JSON.stringify(patch[k]) !== JSON.stringify(current[k]));
    if (!changed.includes('operationalProfile')) delete patch.operationalProfileUpdatedAt;
    if (!changed.length) return { company: current, changed: [], searchRequeued: false };

    const affectsSearch = changed.some((k) => SEARCH_FIELDS.has(k));
    const company = await this.prisma.company.update({
      where: { id: companyId },
      data: { ...patch, ...(affectsSearch ? { searchConfigVersion: { increment: 1 } } : {}) },
    });

    let searchRequeued = false;
    if (affectsSearch) {
      const sub = await this.prisma.subscription.findUnique({ where: { companyId } });
      if (sub?.status === 'ACTIVE') {
        await this.queue.enqueue(companyId, {
          trigger: 'PROFILE_UPDATE',
          runAt: new Date(Date.now() + 15_000),
          isDemo: this.config.demoMode,
          configVersion: company.searchConfigVersion,
        });
        searchRequeued = true;
      }
    }
    await this.activity.record({
      companyId,
      userId,
      type: 'SYSTEM',
      title: 'Perfil comercial atualizado',
      description: affectsSearch
        ? 'Os agentes vão usar a nova configuração na próxima busca.'
        : 'Dados cadastrais atualizados.',
      source: 'company',
      metadata: { changed },
    });
    return { company, changed, searchRequeued };
  }
}
