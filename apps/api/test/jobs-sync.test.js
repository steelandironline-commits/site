import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { AdzunaAdapter, DemoJobSource, FeedAdapter, JobService, JOB_RETENTION_DAYS, disconnectPrisma, getPrisma } from '@autopix/core';
import { loadConfig } from '@autopix/core';
import { setupApp, resetDb, hasDb } from './helpers.js';
import { makeAccount } from './authAreaHelpers.js';
import { NOW, jobRow } from './jobsHelpers.js';

// Vagas · sincronização do worker: gravação em lote (upsert), contrato no SyncState, recuo em 429, retenção de 60 dias
// e vagas de demonstração só com DEMO_MODE. Fontes com fetch falso: nada sai para a rede.

const DAY = 24 * 60 * 60 * 1000;
const ok = (body) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(body) });
const fail = (status, headers = {}) => ({ ok: false, status, headers: { get: (h) => headers[h.toLowerCase()] ?? null }, text: async () => '' });

const result = (id, over = {}) => ({
  id: String(id),
  title: `Soldador ${id}`,
  description: 'Soldagem de estruturas. Salário: R$ 3.000 por mês.',
  created: new Date(NOW.getTime() - DAY).toISOString(),
  redirect_url: `https://www.adzuna.com.br/land/ad/${id}`,
  company: { display_name: 'Metalúrgica Alfa' },
  location: { display_name: 'Joinville, Santa Catarina', area: ['Brasil', 'Santa Catarina', 'Joinville'] },
  ...over,
});

describe.skipIf(!hasDb)('vagas · sincronização', () => {
  let prisma;
  let config;

  const service = (adapters, extra = {}) => new JobService({ prisma, config, adapters, now: () => NOW, sleep: async () => {}, ...extra });
  const adzuna = (fetchImpl, queries = ['soldador']) => new AdzunaAdapter({ appId: 'id', appKey: 'chave-secreta', fetchImpl, sleep: async () => {}, queries });
  const state = () => prisma.syncState.findUnique({ where: { key: 'jobs-sync' } });

  beforeAll(async () => {
    await setupApp({ DEMO_MODE: 'false' });
    prisma = getPrisma();
    config = loadConfig({ NODE_ENV: 'test', DEMO_MODE: 'false' });
  });
  beforeEach(async () => {
    await prisma.jobListing.deleteMany();
    await prisma.syncState.deleteMany();
  });
  afterAll(async () => {
    await prisma.jobListing.deleteMany();
    await prisma.syncState.deleteMany();
    await disconnectPrisma();
  });

  it('a tabela existe com a chave única (fonte, id externo) e os índices de área e de data', async () => {
    const cols = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'JobListing'`;
    expect(cols.map((c) => c.column_name)).toEqual(
      expect.arrayContaining(['id', 'source', 'externalId', 'title', 'company', 'city', 'state', 'area', 'salaryMin', 'salaryMax', 'salaryText', 'description', 'contactWhatsapp', 'contactEmail', 'sourceUrl', 'postedAt', 'expiresAt', 'scoreLevel', 'scoreValue', 'scoreReasons', 'fetchedAt', 'createdAt']),
    );
    const idx = await prisma.$queryRaw`SELECT indexname FROM pg_indexes WHERE tablename = 'JobListing'`;
    expect(idx.map((i) => i.indexname)).toEqual(expect.arrayContaining(['JobListing_source_externalId_key', 'JobListing_area_idx', 'JobListing_postedAt_idx']));
    await service([]).upsertMany([jobRow({ source: 'FEED' })], NOW);
    const row = await prisma.jobListing.findFirst();
    await expect(prisma.jobListing.create({ data: { ...row, id: 'outro-id' } })).rejects.toThrow(/Unique constraint/);
  });

  it('Adzuna: grava as vagas em lote, com área, salário, score e sem prazo inventado', async () => {
    const fetchImpl = async () => ok({ results: [result(1), result(2, { title: 'Eletricista de Painel', description: 'Pague a taxa de inscrição. Renda extra.' }), result(3, { redirect_url: 'javascript:x' })] });
    const stats = await service([adzuna(fetchImpl)]).sync();
    expect(stats).toMatchObject({ sources: ['ADZUNA'], fetched: 3, upserted: 2, skipped: 0, requests: 1, errors: [] });
    const rows = await prisma.jobListing.findMany({ orderBy: { externalId: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ source: 'ADZUNA', externalId: '1', area: 'metalurgia', city: 'Joinville', state: 'SC', company: 'Metalúrgica Alfa', expiresAt: null, scoreLevel: 'VERIFIQUE' });
    expect(Number(rows[0].salaryMin)).toBe(3000);
    expect(rows[0].salaryText).toBe('R$ 3.000 por mês');
    expect(rows[1]).toMatchObject({ area: 'eletrica', scoreLevel: 'ATENCAO' });
    expect(rows[1].scoreReasons.map((r) => r.code)).toEqual(expect.arrayContaining(['PAYMENT_REQUEST', 'EASY_MONEY']));
    expect(await state()).toMatchObject({ leaseUntil: null, lastError: null });
    expect((await state()).lastSuccessAt).toBeInstanceOf(Date);
  });

  it('upsert: a vaga conhecida é atualizada (não duplicada) e mantém o createdAt', async () => {
    const svc = service([adzuna(async () => ok({ results: [result(1)] }))]);
    await svc.sync();
    const before = await prisma.jobListing.findFirst();
    const next = service([adzuna(async () => ok({ results: [result(1, { title: 'Soldador (atualizado)' }), result(1, { title: 'Soldador (última listagem)' })] }))], { now: () => new Date(NOW.getTime() + 3600e3) });
    await next.sync();
    const rows = await prisma.jobListing.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Soldador (última listagem)');
    expect(rows[0].id).toBe(before.id);
    expect(rows[0].createdAt).toEqual(before.createdAt);
    expect(rows[0].fetchedAt.getTime()).toBeGreaterThan(before.fetchedAt.getTime());
  });

  it('o mesmo id em fontes diferentes são vagas diferentes', async () => {
    const svc = service([]);
    await svc.upsertMany([jobRow({ source: 'FEED', externalId: 'x' }), jobRow({ source: 'ADZUNA', externalId: 'x' })].map((r) => ({ ...r, externalId: 'x' })), NOW);
    expect(await prisma.jobListing.count()).toBe(2);
  });

  it('grava muitas vagas de uma vez, em mais de um lote', async () => {
    const svc = service([]);
    const rows = Array.from({ length: 450 }, (_, i) => jobRow({ externalId: `lote-${i}`, title: `Pedreiro ${i}` }));
    expect(await svc.upsertMany(rows, NOW)).toBe(450);
    expect(await prisma.jobListing.count()).toBe(450);
  });

  it('lease: dois sincronismos não rodam ao mesmo tempo', async () => {
    await prisma.syncState.create({ data: { key: 'jobs-sync', leaseUntil: new Date(NOW.getTime() + 60_000) } });
    let called = 0;
    const svc = service([adzuna(async () => (called++, ok({ results: [result(1)] })))]);
    expect(await svc.sync()).toEqual({ skipped: 'running elsewhere' });
    expect(called).toBe(0);
    expect(await prisma.jobListing.count()).toBe(0);
    // Lease vencido: quem chega depois assume.
    await prisma.syncState.update({ where: { key: 'jobs-sync' }, data: { leaseUntil: new Date(NOW.getTime() - 1) } });
    expect(await svc.sync()).toMatchObject({ upserted: 1 });
    expect(called).toBe(1);
  });

  it('lease: dois processos que chegam juntos, só um sincroniza', async () => {
    let called = 0;
    const slow = async () => {
      called += 1;
      await new Promise((r) => setTimeout(r, 50));
      return ok({ results: [result(1)] });
    };
    const [a, b] = await Promise.all([service([adzuna(slow)]).sync(), service([adzuna(slow)]).sync()]);
    expect([a, b].filter((r) => r.skipped).length).toBe(1);
    expect(called).toBe(1);
    expect(await prisma.jobListing.count()).toBe(1);
  });

  it('429 sem fim: devolve o erro com status 429, solta o lease, guarda o motivo e não apaga nada', async () => {
    await service([]).upsertMany([jobRow({ title: 'Vaga que já existia' })], NOW);
    const r = await service([adzuna(async () => fail(429, { 'retry-after': '1' }))]).sync();
    expect(r).toMatchObject({ status: 429, error: expect.stringContaining('429') });
    expect(await prisma.jobListing.count()).toBe(1);
    const s = await state();
    expect(s.leaseUntil).toBeNull();
    expect(s.lastError).toContain('429');
    expect(s.lastError).not.toContain('chave-secreta');
    expect(s.lastSuccessAt).toBeNull();
  });

  it('o que foi gravado antes do 429 fica, e a próxima rodada recomeça da busca que falhou', async () => {
    const queries = ['soldador', 'eletricista', 'motorista'];
    let n = 0;
    const flaky = async () => {
      n += 1;
      if (n >= 2) return fail(429);
      return ok({ results: [result(n * 100)] });
    };
    const svc = service([adzuna(flaky, queries)]);
    const first = await svc.sync();
    expect(first).toMatchObject({ status: 429, upserted: 1, adzunaCursor: 1 });
    expect(n).toBe(4); // 1 pedido bom, 3 tentativas na busca que falhou
    expect(await prisma.jobListing.count()).toBe(1);
    // próxima rodada: começa na busca 2 (a que falhou), faz as 3 do orçamento
    const calls = [];
    const healthy = async (url) => (calls.push(new URL(url).searchParams.get('what')), ok({ results: [] }));
    const second = await service([adzuna(healthy, queries)]).sync();
    expect(second.error).toBeUndefined();
    expect(calls).toEqual(['eletricista', 'motorista', 'soldador']);
  });

  it('cada rodada respeita o orçamento de pedidos e segue de onde parou', async () => {
    const queries = Array.from({ length: 10 }, (_, i) => `busca-${i}`);
    const cfg = loadConfig({ NODE_ENV: 'test', DEMO_MODE: 'false', JOBS_ADZUNA_REQUESTS_PER_RUN: '4' });
    const seen = [];
    const fetchImpl = async (url) => (seen.push(new URL(url).searchParams.get('what')), ok({ results: [] }));
    const mk = () => new JobService({ prisma, config: cfg, adapters: [adzuna(fetchImpl, queries)], now: () => NOW });
    const a = await mk().sync();
    const b = await mk().sync();
    const c = await mk().sync();
    expect(seen).toEqual([...queries.slice(0, 4), ...queries.slice(4, 8), ...queries.slice(8), ...queries.slice(0, 2)]);
    expect([a.requests, b.requests, c.requests]).toEqual([4, 4, 4]);
    expect(c.adzunaCursor).toBe(2);
  });

  it('feeds: um feed fora do ar não derruba os outros; a rodada é marcada com erro', async () => {
    const feeds = [{ url: 'https://um.example/f.json' }, { url: 'https://dois.example/f.json' }];
    const fetchImpl = async (url) => (String(url).startsWith('https://um') ? fail(404) : ok([{ id: 'a', title: 'Cozinheiro', url: 'https://dois.example/a', date: NOW.toISOString() }]));
    const r = await service([new FeedAdapter({ feeds, fetchImpl, sleep: async () => {} })]).sync();
    expect(r).toMatchObject({ upserted: 1, status: 404, errors: ['FEED 404'] });
    expect(await prisma.jobListing.count()).toBe(1);
    expect((await prisma.jobListing.findFirst()).source).toBe('FEED');
  });

  it('retenção: apaga só as vagas publicadas há mais de 60 dias e nenhum outro dado', async () => {
    const person = await makeAccount(prisma, { accountType: 'PERSON' });
    const before = { users: await prisma.user.count(), companies: await prisma.company.count(), sync: await prisma.syncState.count() };
    await service([]).upsertMany(
      [
        jobRow({ title: 'Velha', daysAgo: JOB_RETENTION_DAYS + 1 }),
        jobRow({ title: 'No limite', daysAgo: JOB_RETENTION_DAYS - 1 }),
        jobRow({ title: 'Nova', daysAgo: 1 }),
        jobRow({ title: 'Velha de demonstração', daysAgo: 90, source: 'DEMO' }),
      ],
      NOW,
    );
    // jobRow limita a data ao "agora"; as antigas já estão no passado
    const r = await service([adzuna(async () => ok({ results: [] }))]).sync();
    expect(r.purged).toBe(2);
    expect((await prisma.jobListing.findMany({ orderBy: { title: 'asc' } })).map((j) => j.title)).toEqual(['No limite', 'Nova']);
    expect(await prisma.user.count()).toBe(before.users);
    expect(await prisma.company.count()).toBe(before.companies);
    expect(await prisma.user.findUnique({ where: { id: person.user.id } })).toBeTruthy();
    expect(await prisma.syncState.count()).toBe(before.sync + 1); // só a linha do próprio sincronismo
  });

  it('DEMO_MODE=true: grava 8 a 12 vagas "(DEMO)", fonte DEMO, sem chamar rede; repetir não duplica', async () => {
    const demo = new JobService({ prisma, config: loadConfig({ NODE_ENV: 'test', DEMO_MODE: 'true', JOBS_SYNC_ENABLED: 'true', ADZUNA_APP_ID: 'a', ADZUNA_APP_KEY: 'b' }), now: () => NOW, fetchImpl: async () => { throw new Error('rede proibida'); } });
    const first = await demo.sync();
    expect(first).toMatchObject({ sources: ['DEMO'], requests: 0, errors: [] });
    const count = await prisma.jobListing.count();
    expect(count).toBeGreaterThanOrEqual(8);
    expect(count).toBeLessThanOrEqual(12);
    const rows = await prisma.jobListing.findMany();
    for (const row of rows) {
      expect(row.source).toBe('DEMO');
      expect(row.title.startsWith('(DEMO) ')).toBe(true);
      expect(row.company.startsWith('(DEMO) ')).toBe(true);
    }
    await demo.sync();
    expect(await prisma.jobListing.count()).toBe(count);
  });

  it('DEMO_MODE=false: a demonstração nunca roda; sem fontes, nada acontece', async () => {
    expect(await service(undefined).sync()).toEqual({ skipped: 'sem fontes de vagas configuradas' });
    expect(await prisma.jobListing.count()).toBe(0);
    expect(await prisma.syncState.count()).toBe(0);
    const withKeys = new JobService({ prisma, config: loadConfig({ NODE_ENV: 'test', DEMO_MODE: 'false', JOBS_SYNC_ENABLED: 'true', ADZUNA_APP_ID: 'a', ADZUNA_APP_KEY: 'b' }), now: () => NOW, fetchImpl: async () => ok({ results: [result(7)] }), sleep: async () => {} });
    expect((await withKeys.sync()).sources).toEqual(['ADZUNA']);
    expect(await prisma.jobListing.count({ where: { source: 'DEMO' } })).toBe(0);
  });

  it('o worker avisa quais fontes tem (a API lê daí "fonte não configurada")', async () => {
    const disabled = new JobService({ prisma, config: loadConfig({ NODE_ENV: 'test', DEMO_MODE: 'false' }) });
    expect(await disabled.announce()).toEqual([]);
    expect((await state()).stats.sources).toEqual([]);
    const enabled = new JobService({ prisma, config: loadConfig({ NODE_ENV: 'test', DEMO_MODE: 'false', JOBS_SYNC_ENABLED: 'true', JOB_FEEDS: '["https://a.example/f.json"]' }) });
    expect(await enabled.announce()).toEqual(['FEED']);
    expect((await state()).stats.sources).toEqual(['FEED']);
    // e o sincronismo seguinte não perde a lista
    await service([adzuna(async () => ok({ results: [] }))]).sync();
    expect((await state()).stats.sources).toEqual(['ADZUNA']);
  });
});
