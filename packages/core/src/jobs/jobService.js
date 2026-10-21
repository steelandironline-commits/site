import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  TRANSVERSAL_JOB_AREAS,
  canSeeJob,
  daysSincePosted,
  daysUntilDeadline,
  deadlineLabel,
  formatPhone,
  isJobArea,
  isTransversalJobArea,
  jobAreaName,
  mailtoLink,
  postedLabel,
  readJobSearch,
  salaryLabel,
  scoreLevelLabel,
  transversalCargo,
  transversalCargoTerms,
  whatsappLink,
} from '@autopix/shared';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { badRequest, notFound } from '../errors.js';
import { logger } from '../logger.js';
import { AdzunaAdapter, ADZUNA_QUERIES } from './adzunaAdapter.js';
import { DemoJobSource } from './demoSource.js';
import { FeedAdapter } from './feedAdapter.js';
import { DEFAULT_SLEEP, JobSourceError } from './http.js';
import { buildJobRecord } from './normalize.js';

export const JOBS_SYNC_KEY = 'jobs-sync';
/** Vagas publicadas há mais tempo que isto saem do banco a cada sincronização. */
export const JOB_RETENTION_DAYS = 60;

const DAY = 24 * 60 * 60 * 1000;
const UPSERT_BATCH = 200; // linhas por INSERT (23 parâmetros cada, longe do limite de 65 535)
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const EXCERPT_LENGTH = 320;
const SCAN_ROUNDS = 5;

// Datas são ligadas como instantes (AT TIME ZONE 'UTC' grava o relógio UTC, como o Prisma, seja qual for o fuso do banco).
const utc = (d) => Prisma.sql`${d}::timestamptz AT TIME ZONE 'UTC'`;

const SOURCE_NAMES = { ADZUNA: 'Adzuna', FEED: 'Feed de vagas', DEMO: 'Demonstração' };

function encodeCursor(row) {
  return Buffer.from(JSON.stringify({ t: row.postedAt.toISOString(), id: row.id })).toString('base64url');
}

function decodeCursor(cursor) {
  try {
    const { t, id } = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    const at = new Date(t);
    if (typeof id !== 'string' || id.length > 64 || Number.isNaN(at.getTime())) throw new Error('bad');
    return { postedAt: at, id };
  } catch {
    throw badRequest('Cursor inválido.');
  }
}

const num = (decimal) => (decimal === null || decimal === undefined ? null : Number(decimal));

/**
 * Vagas de emprego da área CPF. O worker sincroniza as fontes (Adzuna, feeds, demonstração) para a tabela JobListing;
 * a API lista só o que cada pessoa pode ver (área do perfil mais as vagas transversais, packages/shared jobs/visibility).
 */
export class JobService {
  constructor({ prisma = getPrisma(), config = getConfig(), adapters, now = () => new Date(), sleep = DEFAULT_SLEEP, fetchImpl } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.now = now;
    this.sleep = sleep;
    this.fetchImpl = fetchImpl;
    this.explicitAdapters = adapters;
  }

  // ------------------------------------------------------------------ fontes

  /**
   * Fontes ativas. Com DEMO_MODE ligado, SÓ a demonstração (nenhuma chamada de rede). Fora dele, nada de demonstração:
   * Adzuna com as duas chaves, e os feeds de JOB_FEEDS, e só com JOBS_SYNC_ENABLED.
   */
  adapters() {
    if (this.explicitAdapters) return this.explicitAdapters;
    const { jobs, demoMode } = this.config;
    if (demoMode) return [new DemoJobSource()];
    if (!jobs?.syncEnabled) return [];
    const list = [];
    const http = { fetchImpl: this.fetchImpl ?? globalThis.fetch, sleep: this.sleep };
    if (jobs.adzuna.enabled) list.push(new AdzunaAdapter({ appId: jobs.adzuna.appId, appKey: jobs.adzuna.appKey, ...http }));
    if (jobs.feeds.length) list.push(new FeedAdapter({ feeds: jobs.feeds, ...http }));
    return list;
  }

  /** O worker avisa quais fontes tem (o servidor web não recebe as chaves): a API lê daqui "fonte não configurada". */
  async announce() {
    const sources = this.adapters().map((a) => a.name);
    await this.#ensureState();
    const row = await this.prisma.syncState.findUnique({ where: { key: JOBS_SYNC_KEY } });
    await this.prisma.syncState.update({ where: { key: JOBS_SYNC_KEY }, data: { stats: { ...(row?.stats ?? {}), sources } } });
    return sources;
  }

  async #ensureState() {
    await this.prisma.syncState.upsert({ where: { key: JOBS_SYNC_KEY }, update: {}, create: { key: JOBS_SYNC_KEY } });
  }

  /** Pega o contrato de sincronização; só um processo varre por vez (web com worker embutido + worker). */
  async #claim(leaseMs) {
    const now = this.now();
    await this.#ensureState();
    const got = await this.prisma.syncState.updateMany({
      where: { key: JOBS_SYNC_KEY, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
      data: { leaseUntil: new Date(now.getTime() + leaseMs), lastStartedAt: now },
    });
    return got.count === 1;
  }

  // ------------------------------------------------------------------ sincronização

  /**
   * Uma rodada de sincronização: busca nas fontes, grava em lote (upsert por fonte + id externo), apaga o que passou da
   * retenção e solta o contrato. Erro de uma fonte (429, rede) interrompe a rodada, guarda o motivo e devolve
   * `{ error, status }` para o worker recuar; o que já foi gravado fica.
   */
  async sync({ leaseMs = 30 * 60 * 1000 } = {}) {
    const adapters = this.adapters();
    if (adapters.length === 0) return { skipped: 'sem fontes de vagas configuradas' };
    if (!(await this.#claim(leaseMs))) return { skipped: 'running elsewhere' };

    const started = this.now();
    const prev = (await this.prisma.syncState.findUnique({ where: { key: JOBS_SYNC_KEY } }))?.stats ?? {};
    const stats = { sources: adapters.map((a) => a.name), fetched: 0, upserted: 0, skipped: 0, requests: 0, purged: 0, errors: [], adzunaCursor: Number(prev.adzunaCursor) || 0 };
    let failure = null;

    try {
      for (const adapter of adapters) {
        try {
          if (adapter.name === 'DEMO') await this.#syncDemo(adapter, stats);
          else if (adapter.name === 'ADZUNA') await this.#syncAdzuna(adapter, stats);
          else if (adapter.name === 'FEED') await this.#syncFeeds(adapter, stats);
          else throw new TypeError(`fonte desconhecida: ${adapter.name}`);
        } catch (err) {
          failure ??= { source: adapter.name, status: err instanceof JobSourceError ? err.status : 0, message: err instanceof JobSourceError ? err.message : `${adapter.name}: erro inesperado` };
          // Os feeds já anotam cada feed que falhou; as outras fontes anotam aqui.
          if (!stats.errors.some((e) => e.startsWith(adapter.name))) stats.errors.push(`${failure.source} ${failure.status || 'erro'}`);
          if (!(err instanceof JobSourceError)) logger.error('jobs sync source failed', { source: adapter.name, err });
          // Em 429 o limite é da conta inteira: as outras fontes seguem, mas a rodada conta como falha.
        }
      }
      stats.purged = await this.purgeOld();
      stats.ms = this.now().getTime() - started.getTime();
      await this.prisma.syncState.update({
        where: { key: JOBS_SYNC_KEY },
        data: { leaseUntil: null, ...(failure ? { lastError: failure.message.slice(0, 200) } : { lastSuccessAt: this.now(), lastError: null }), stats },
      });
      logger.info(failure ? 'jobs sync finished with errors' : 'jobs synced', { ...stats, adzunaCursor: undefined });
      return failure ? { ...stats, error: failure.message, status: failure.status } : stats;
    } catch (err) {
      await this.prisma.syncState
        .update({ where: { key: JOBS_SYNC_KEY }, data: { leaseUntil: null, lastError: String(err.message).slice(0, 200), stats } })
        .catch(() => null);
      logger.error('jobs sync failed', { err });
      return { ...stats, error: 'falha ao sincronizar as vagas', status: 0 };
    }
  }

  async #syncDemo(adapter, stats) {
    const jobs = adapter.list(this.now());
    stats.fetched += jobs.length;
    stats.upserted += await this.#store('DEMO', jobs, stats);
  }

  /** Cada rodada faz `requestsPerRun` buscas e segue de onde a anterior parou (limite gratuito de pedidos da API). */
  async #syncAdzuna(adapter, stats) {
    const queries = adapter.queries?.length ? adapter.queries : ADZUNA_QUERIES;
    const budget = Math.max(1, Math.min(queries.length, this.config.jobs?.adzuna?.requestsPerRun ?? 6));
    let cursor = stats.adzunaCursor % queries.length;
    for (let i = 0; i < budget; i++) {
      const query = queries[cursor];
      stats.requests += 1;
      // Se a busca falhar, o cursor fica nela: a próxima rodada tenta de novo a mesma.
      const { jobs, received } = await adapter.fetchPage(query, 1);
      stats.fetched += received;
      stats.upserted += await this.#store('ADZUNA', jobs, stats);
      cursor = (cursor + 1) % queries.length;
      stats.adzunaCursor = cursor;
    }
  }

  async #syncFeeds(adapter, stats) {
    let failed = null;
    for (const feed of adapter.feeds) {
      stats.requests += 1;
      try {
        const { jobs, received } = await adapter.fetchFeed(feed);
        stats.fetched += received;
        stats.upserted += await this.#store('FEED', jobs, stats);
      } catch (err) {
        // Um feed fora do ar não derruba os outros; a falha é registrada ao fim.
        failed ??= err;
        stats.errors.push(`FEED ${err instanceof JobSourceError ? err.status || 'erro' : 'erro'}`);
      }
    }
    if (failed) throw failed;
  }

  /** Normaliza e grava um lote. Vaga que não serve (sem título, link ou data) é contada e descartada. */
  async #store(source, rawJobs, stats) {
    const now = this.now();
    const rows = [];
    for (const raw of rawJobs) {
      const row = buildJobRecord(raw, { source, now });
      if (row) rows.push(row);
      else stats.skipped += 1;
    }
    return this.upsertMany(rows, now);
  }

  /**
   * Grava as linhas com um INSERT ... ON CONFLICT por lote. Nova vaga entra; a conhecida (mesma fonte e mesmo id
   * externo) leva todos os campos novos, menos id e createdAt. Linhas repetidas no mesmo lote valem pela última.
   */
  async upsertMany(rows, stamp = this.now()) {
    const unique = [...new Map(rows.map((row) => [`${row.source}\u0000${row.externalId}`, row])).values()];
    for (let i = 0; i < unique.length; i += UPSERT_BATCH) {
      const values = Prisma.join(
        unique.slice(i, i + UPSERT_BATCH).map(
          (r) =>
            Prisma.sql`(${randomUUID()}, ${r.source}, ${r.externalId}, ${r.title}, ${r.company}, ${r.city}, ${r.state}, ${r.area}, ${r.salaryMin}::numeric, ${r.salaryMax}::numeric, ${r.salaryPeriod}, ${r.salaryText}, ${r.description}, ${r.contactWhatsapp}, ${r.contactEmail}, ${r.sourceUrl}, ${utc(r.postedAt)}, ${utc(r.expiresAt)}, ${r.scoreLevel}, ${r.scoreValue}::integer, ${JSON.stringify(r.scoreReasons)}::jsonb, ${utc(stamp)}, ${utc(stamp)})`,
        ),
      );
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO "JobListing" ("id", "source", "externalId", "title", "company", "city", "state", "area", "salaryMin", "salaryMax", "salaryPeriod", "salaryText", "description", "contactWhatsapp", "contactEmail", "sourceUrl", "postedAt", "expiresAt", "scoreLevel", "scoreValue", "scoreReasons", "fetchedAt", "createdAt")
        VALUES ${values}
        ON CONFLICT ("source", "externalId") DO UPDATE SET
          "title" = EXCLUDED."title",
          "company" = EXCLUDED."company",
          "city" = EXCLUDED."city",
          "state" = EXCLUDED."state",
          "area" = EXCLUDED."area",
          "salaryMin" = EXCLUDED."salaryMin",
          "salaryMax" = EXCLUDED."salaryMax",
          "salaryPeriod" = EXCLUDED."salaryPeriod",
          "salaryText" = EXCLUDED."salaryText",
          "description" = EXCLUDED."description",
          "contactWhatsapp" = EXCLUDED."contactWhatsapp",
          "contactEmail" = EXCLUDED."contactEmail",
          "sourceUrl" = EXCLUDED."sourceUrl",
          "postedAt" = EXCLUDED."postedAt",
          "expiresAt" = EXCLUDED."expiresAt",
          "scoreLevel" = EXCLUDED."scoreLevel",
          "scoreValue" = EXCLUDED."scoreValue",
          "scoreReasons" = EXCLUDED."scoreReasons",
          "fetchedAt" = EXCLUDED."fetchedAt"
      `);
    }
    return unique.length;
  }

  /** Retenção: apaga só vagas (JobListing) publicadas há mais de 60 dias. Não toca em nenhuma outra tabela. */
  async purgeOld() {
    const cutoff = new Date(this.now().getTime() - JOB_RETENTION_DAYS * DAY);
    const { count } = await this.prisma.jobListing.deleteMany({ where: { postedAt: { lt: cutoff } } });
    return count;
  }

  // ------------------------------------------------------------------ leitura (API)

  /** O perfil de busca da pessoa. Conta que não é de pessoa física recebe o 404 de rota inexistente. */
  async #person(userId) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { company: { select: { accountType: true, operationalProfile: true } } } });
    if (!user?.company || user.company.accountType !== 'PERSON') throw notFound('Rota não encontrada.');
    return readJobSearch(user.company.operationalProfile);
  }

  /** Situação da fonte para a página: há fonte configurada? quando foi a última sincronização boa? */
  async #sourceStatus() {
    const state = await this.prisma.syncState.findUnique({ where: { key: JOBS_SYNC_KEY } });
    const sources = Array.isArray(state?.stats?.sources) ? state.stats.sources : [];
    return { configured: sources.length > 0, demo: Boolean(this.config.demoMode), lastSuccessAt: state?.lastSuccessAt ?? null };
  }

  /** Filtro comum: o que a pessoa pode ver, mais demonstração só em modo demo e prazo ainda aberto. */
  #visibleWhere(person) {
    const now = this.now();
    const visibility = [{ area: { in: [...TRANSVERSAL_JOB_AREAS] } }];
    if (person.workArea) {
      visibility.push({ area: person.workArea });
      const cargo = transversalCargo(person.jobTitle);
      if (cargo) for (const term of transversalCargoTerms(cargo)) visibility.push({ title: { contains: term, mode: 'insensitive' } });
    }
    const and = [{ OR: visibility }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }];
    if (!this.config.demoMode) and.push({ source: { not: 'DEMO' } });
    return and;
  }

  /**
   * Lista as vagas visíveis para a pessoa, da mais nova para a mais antiga.
   * @param {string} userId
   * @param {{ q?: string, area?: string, limit?: number, cursor?: string }} [params]
   */
  async list(userId, { q, area, limit = DEFAULT_LIMIT, cursor } = {}) {
    const person = await this.#person(userId);
    if (area !== undefined && area !== null && area !== '') {
      if (!isJobArea(area)) throw badRequest('Área inválida.');
      if (!isTransversalJobArea(area) && area !== person.workArea) throw badRequest('Escolha a sua área ou a de logística.');
    }
    const take = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const and = this.#visibleWhere(person);
    if (area) and.push({ area });
    for (const word of String(q ?? '').trim().split(/\s+/).filter((w) => w.length >= 2).slice(0, 6)) {
      and.push({ OR: [{ title: { contains: word, mode: 'insensitive' } }, { company: { contains: word, mode: 'insensitive' } }, { description: { contains: word, mode: 'insensitive' } }] });
    }

    // O banco traz um superconjunto (área, transversal e termos do cargo); canSeeJob decide, para a regra ser uma só.
    let after = cursor ? decodeCursor(cursor) : null;
    const visible = [];
    for (let round = 0; round < SCAN_ROUNDS && visible.length < take + 1; round++) {
      const rows = await this.prisma.jobListing.findMany({
        where: { AND: [...and, ...(after ? [{ OR: [{ postedAt: { lt: after.postedAt } }, { postedAt: after.postedAt, id: { lt: after.id } }] }] : [])] },
        orderBy: [{ postedAt: 'desc' }, { id: 'desc' }],
        take: (take + 1) * 2,
      });
      for (const row of rows) if (canSeeJob(row, person)) visible.push(row);
      if (rows.length < (take + 1) * 2) break;
      after = { postedAt: rows.at(-1).postedAt, id: rows.at(-1).id };
    }
    const page = visible.slice(0, take);
    return {
      items: page.map((row) => this.toView(row, person)),
      nextCursor: visible.length > take ? encodeCursor(page.at(-1)) : null,
      profile: this.#profileView(person),
      source: await this.#sourceStatus(),
    };
  }

  /** Uma vaga, com a descrição completa. Vaga que a pessoa não pode ver responde 404, igual a uma que não existe. */
  async get(userId, id) {
    const person = await this.#person(userId);
    const row = await this.prisma.jobListing.findFirst({ where: { AND: [{ id: String(id) }, ...this.#visibleWhere(person)] } });
    if (!row || !canSeeJob(row, person)) throw notFound('Vaga não encontrada.');
    return { item: this.toView(row, person, { full: true }), profile: this.#profileView(person), source: await this.#sourceStatus() };
  }

  #profileView(person) {
    return { workArea: person.workArea, workAreaName: person.workArea ? jobAreaName(person.workArea) : null, jobTitle: person.jobTitle, contactPreference: person.contactPreference, needsArea: !person.workArea };
  }

  /** A linha do banco como a API a entrega: números, textos prontos e links; nada além dos campos da vaga. */
  toView(row, person, { full = false } = {}) {
    const now = this.now();
    const postedDays = daysSincePosted(row.postedAt, now);
    const deadlineDays = daysUntilDeadline(row.expiresAt, now);
    const salary = row.salaryMin === null && row.salaryMax === null ? null : { min: num(row.salaryMin), max: num(row.salaryMax), period: row.salaryPeriod ?? 'MES' };
    const intro = `Olá! Vi a vaga de ${row.title}${row.company ? ` na ${row.company}` : ''} e tenho interesse.`;
    const whatsappUrl = row.contactWhatsapp ? whatsappLink(row.contactWhatsapp, intro) : null;
    const emailUrl = row.contactEmail ? mailtoLink(row.contactEmail, { subject: `Vaga: ${row.title}`.slice(0, 120), body: intro }) : null;
    const order = person?.contactPreference === 'EMAIL' ? ['EMAIL', 'WHATSAPP'] : ['WHATSAPP', 'EMAIL'];
    const description = row.description ?? '';
    return {
      id: row.id,
      source: row.source,
      sourceName: SOURCE_NAMES[row.source] ?? row.source,
      title: row.title,
      company: row.company ?? null,
      city: row.city ?? null,
      state: row.state ?? null,
      area: { slug: row.area, name: jobAreaName(row.area) ?? row.area },
      salary: salary && { ...salary, label: salaryLabel(salary) },
      salaryLabel: salaryLabel(salary),
      postedAt: row.postedAt,
      expiresAt: row.expiresAt ?? null,
      postedDays,
      deadlineDays,
      postedLabel: postedLabel(postedDays),
      deadlineLabel: deadlineLabel(deadlineDays),
      contact: {
        whatsapp: whatsappUrl ? { number: row.contactWhatsapp, display: formatPhone(row.contactWhatsapp), url: whatsappUrl } : null,
        email: emailUrl ? { address: row.contactEmail, url: emailUrl } : null,
        order,
        preferred: person?.contactPreference ?? null,
      },
      score: { value: row.scoreValue, level: row.scoreLevel, label: scoreLevelLabel(row.scoreLevel), reasons: Array.isArray(row.scoreReasons) ? row.scoreReasons : [] },
      ...(full ? { description } : { excerpt: description.length > EXCERPT_LENGTH ? `${description.slice(0, EXCERPT_LENGTH).trimEnd()}…` : description }),
      descriptionTruncated: description.length > EXCERPT_LENGTH,
      sourceUrl: row.sourceUrl,
    };
  }
}
