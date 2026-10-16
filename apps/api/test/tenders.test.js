import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { disconnectPrisma, getPrisma, TenderService } from '@autopix/core';
import { setupApp, resetDb, client, hasDb, createActiveUser } from './helpers.js';

const now = Date.now();
const iso = (h) => new Date(now + h * 3600e3).toISOString().slice(0, 19);
const item = (seq, over = {}) => ({
  numeroControlePNCP: `82765488000102-1-${String(seq).padStart(6, '0')}/2026`,
  orgaoEntidade: { cnpj: '82765488000102', razaoSocial: 'MUNICIPIO DE TAIO', esferaId: 'M' },
  unidadeOrgao: { ufSigla: 'SC', municipioNome: 'Taió', codigoIbge: '4217808' },
  objetoCompra: `Manutenção predial lote ${seq}`,
  anoCompra: 2026,
  sequencialCompra: seq,
  modalidadeNome: 'Pregão - Eletrônico',
  situacaoCompraId: 1,
  valorTotalEstimado: 1000 * seq,
  dataAberturaProposta: iso(-48),
  dataEncerramentoProposta: iso(24 * 10),
  ...over,
});

function fakeClient(pages) {
  return { openPage: async (p) => ({ items: pages[p - 1] || [], totalPages: pages.length, total: pages.flat().length }) };
}

describe.skipIf(!hasDb)('licitações (PNCP)', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp();
  });
  beforeEach(async () => {
    await resetDb(getPrisma());
    await getPrisma().publicTender.deleteMany();
    await getPrisma().syncState.deleteMany();
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('syncs the open notices, keeps them updated, and marks the ones that leave the open list', async () => {
    const prisma = getPrisma();
    const pages = [
      [item(1), item(2, { dataEncerramentoProposta: iso(20) })],
      [item(3, { unidadeOrgao: { ufSigla: 'SP', municipioNome: 'Santos' }, objetoCompra: 'Fornecimento de aço CA-50' })],
    ];
    const svc = new TenderService({ prisma, client: fakeClient(pages) });
    expect(await svc.syncOpen({ delayMs: 0 })).toMatchObject({ pages: 2, upserted: 3, unlisted: 0 });
    expect(await prisma.publicTender.count()).toBe(3);

    // Next sweep: #2 gone (suspended at the source), #1 updated.
    const next = new TenderService({ prisma, client: fakeClient([[item(1, { objetoCompra: 'Manutenção predial (retificado)' })], [item(3)]]) });
    expect(await next.syncOpen({ delayMs: 0 })).toMatchObject({ upserted: 2, unlisted: 1 });
    expect((await prisma.publicTender.findUnique({ where: { externalId: item(1).numeroControlePNCP } })).object).toBe('Manutenção predial (retificado)');
    expect((await prisma.publicTender.findUnique({ where: { externalId: item(2).numeroControlePNCP } })).leftOpenListAt).toBeTruthy();
    expect(await prisma.syncState.findUnique({ where: { key: 'pncp-open' } })).toMatchObject({ leaseUntil: null, lastError: null });
  });

  it('only one process sweeps at a time, and a failed sweep marks nothing', async () => {
    const prisma = getPrisma();
    await prisma.syncState.create({ data: { key: 'pncp-open', leaseUntil: new Date(now + 60_000) } });
    expect(await new TenderService({ prisma, client: fakeClient([[item(1)]]) }).syncOpen({ delayMs: 0 })).toMatchObject({ skipped: expect.any(String) });
    await prisma.syncState.update({ where: { key: 'pncp-open' }, data: { leaseUntil: null } });
    await new TenderService({ prisma, client: fakeClient([[item(1)]]) }).syncOpen({ delayMs: 0 });
    // A partial sweep (page limit) does not mark the ones it did not reach.
    await prisma.publicTender.updateMany({ data: { lastSeenAt: new Date(now - 3600e3) } });
    expect(await new TenderService({ prisma, client: fakeClient([[item(9)], [item(10)]]) }).syncOpen({ delayMs: 0, maxPages: 1 })).toMatchObject({ complete: false, unlisted: 0 });
    expect((await prisma.publicTender.findUnique({ where: { externalId: item(1).numeroControlePNCP } })).leftOpenListAt).toBeNull();
    const broken = { openPage: async () => { throw new Error('PNCP 503'); } };
    expect(await new TenderService({ prisma, client: broken }).syncOpen({ delayMs: 0 })).toMatchObject({ error: 'PNCP 503' });
    expect((await prisma.publicTender.findFirst()).leftOpenListAt).toBeNull();
  });

  it('lists them for a signed-in company with filters and the situation of each one', async () => {
    const prisma = getPrisma();
    await new TenderService({
      prisma,
      client: fakeClient([[item(1), item(2, { dataEncerramentoProposta: iso(20) }), item(4, { situacaoCompraId: 2 }), item(5, { dataAberturaProposta: iso(30) })], [item(3, { unidadeOrgao: { ufSigla: 'SP', municipioNome: 'Santos' }, objetoCompra: 'Fornecimento de aço CA-50' })]]),
    }).syncOpen({ delayMs: 0 });

    expect((await client(ctx.app).get('/api/tenders')).status).toBe(401);
    const { c } = await createActiveUser(ctx.app);

    const open = await c.get('/api/tenders?state=SC');
    expect(open.status).toBe(200);
    // Revoked and not-yet-open are out; the one closing first comes first.
    expect(open.body.items.map((t) => t.object)).toEqual(['Manutenção predial lote 2', 'Manutenção predial lote 1']);
    expect(open.body.items[0].status).toMatchObject({ code: 'CLOSING', label: 'Prazo acabando' });
    expect(open.body.items[1]).toMatchObject({ city: 'Taió', estimatedCents: 100000, status: { code: 'OPEN' } });
    expect(open.body.sync.lastSuccessAt).toBeTruthy();

    expect((await c.get('/api/tenders?status=closing')).body.total).toBe(1);
    expect((await c.get('/api/tenders?status=soon')).body.items[0].status.code).toBe('SOON');
    expect((await c.get('/api/tenders?status=all&state=SC')).body.total).toBe(4);
    expect((await c.get('/api/tenders?q=aço')).body.items.map((t) => t.city)).toEqual(['Santos']);
    expect((await c.get('/api/tenders?state=SC&city=taió')).body.total).toBe(2);
    expect((await c.get('/api/tenders/cities?state=SC')).body.cities).toEqual([{ city: 'Taió', count: 2 }]);
    expect((await c.get('/api/tenders?status=whatever')).status).toBe(400);
  });
});
