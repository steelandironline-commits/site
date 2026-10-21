import { maskCpf, readJobSearch } from '@autopix/shared';
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
  'postalCode',
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

/**
 * Perfil da pessoa física (área CPF, /api/profile): o subconjunto de COMPANY_FIELDS que uma pessoa
 * preenche no cadastro. Nada de empresa passa por aqui: sem CNPJ, produtos, cliente ideal, ticket,
 * setores, palavras-chave, chave Pix de repasse, agentes, assinatura ou equipe.
 */
export const PROFILE_FIELDS = Object.freeze(['name', 'phone', 'postalCode', 'city', 'state', 'serviceRadiusKm', 'description', 'services', 'operationalProfile']);

/**
 * O que a pessoa informa para receber vagas (área de atuação, cargo procurado, contato preferido). Fica no perfil
 * operacional já existente (JSON, chave `jobSearch`), sem coluna nova: ver `readJobSearch` em packages/shared.
 */
export const JOB_SEARCH_FIELDS = Object.freeze(['workArea', 'jobTitle', 'contactPreference']);

/** O perfil que o cliente recebe: só PROFILE_FIELDS (mais o CPF mascarado). */
export function toProfile(company, loginId = null) {
  return {
    name: company.name,
    phone: company.phone ?? null,
    postalCode: company.postalCode ?? null,
    city: company.city ?? null,
    state: company.state ?? null,
    serviceRadiusKm: company.serviceRadiusKm ?? null,
    description: company.description ?? null,
    services: company.services ?? [],
    operationalProfile: company.operationalProfile ?? null,
    ...readJobSearch(company.operationalProfile),
    cpfMasked: loginId ? maskCpf(loginId) : '',
  };
}

export function pickCompanyFields(data) {
  const out = {};
  for (const key of COMPANY_FIELDS) if (data[key] !== undefined) out[key] = data[key];
  // The operational profile is stored whole (already validated) with its timestamp.
  if (out.operationalProfile) out.operationalProfileUpdatedAt = new Date();
  return out;
}

/**
 * Perfil operacional a gravar. `incoming` é o perfil enviado (já validado: a chave `jobSearch` não passa por ele),
 * `stored` o que está no banco e `jobPatch` os campos de vaga enviados. A busca de vagas guardada é sempre mantida
 * (a tela do perfil operacional não a conhece e não a devolve) e recebe o `jobPatch`. `undefined`: nada a gravar.
 */
export function withJobSearch(stored, incoming, jobPatch) {
  const storedObject = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : null;
  if (incoming === undefined && Object.keys(jobPatch).length === 0) return undefined;
  const next = { ...readJobSearch(storedObject), ...jobPatch };
  const hasJobSearch = Object.values(next).some((value) => value !== null);
  // Nada a gravar: só campos de vaga vazios sobre um perfil que nunca teve busca de vagas.
  if (incoming === undefined && !hasJobSearch && !storedObject?.jobSearch) return undefined;
  const { jobSearch: _old, ...rest } = incoming ?? storedObject ?? {};
  return hasJobSearch ? { ...rest, jobSearch: next } : rest;
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
   *
   * `search: false` (the person profile has no search) skips the bump and the queue.
   * `wording` replaces the activity text, which is written for a company by default.
   */
  async update(companyId, data, { userId, search = true, wording } = {}) {
    const current = await this.get(companyId);
    const patch = pickCompanyFields(data);
    if ('cnpj' in patch && current.cnpj && patch.cnpj !== current.cnpj) {
      throw badRequest('O CNPJ é o login da empresa e não pode ser alterado.');
    }
    if (current.accountType === 'PERSON') delete patch.cnpj;
    const changed = Object.keys(patch).filter((k) => k !== 'operationalProfileUpdatedAt' && JSON.stringify(patch[k]) !== JSON.stringify(current[k]));
    if (!changed.includes('operationalProfile')) delete patch.operationalProfileUpdatedAt;
    if (!changed.length) return { company: current, changed: [], searchRequeued: false };

    const affectsSearch = search && changed.some((k) => SEARCH_FIELDS.has(k));
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
      title: wording?.title ?? 'Perfil comercial atualizado',
      description:
        wording?.description ?? (affectsSearch ? 'Os agentes vão usar a nova configuração na próxima busca.' : 'Dados cadastrais atualizados.'),
      source: 'company',
      metadata: { changed },
    });
    return { company, changed, searchRequeued };
  }

  /**
   * Profile of a PERSON account (area CPF). Any other account type answers "not found": the
   * route does not exist for a company, so it must not read one (also in legacy mode).
   */
  async getProfile(userId) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { company: true } });
    if (!user?.company || user.company.accountType !== 'PERSON') throw notFound('Rota não encontrada.');
    return toProfile(user.company, user.loginId);
  }

  /**
   * Updates the profile of a PERSON account with the same rule as `update` (same patch, same
   * change detection, same activity record), limited to PROFILE_FIELDS and without a search.
   */
  async updateProfile(userId, data) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { company: true } });
    if (!user?.company || user.company.accountType !== 'PERSON') throw notFound('Rota não encontrada.');
    const picked = {};
    for (const key of PROFILE_FIELDS) if (data?.[key] !== undefined) picked[key] = data[key];
    const jobPatch = {};
    for (const key of JOB_SEARCH_FIELDS) if (data?.[key] !== undefined) jobPatch[key] = data[key];
    const operationalProfile = withJobSearch(user.company.operationalProfile, picked.operationalProfile, jobPatch);
    if (operationalProfile !== undefined) picked.operationalProfile = operationalProfile;
    const { company, changed } = await this.update(user.companyId, picked, {
      userId,
      search: false,
      wording: { title: 'Perfil atualizado', description: 'Dados do perfil atualizados.' },
    });
    return { profile: toProfile(company, user.loginId), changed };
  }
}
