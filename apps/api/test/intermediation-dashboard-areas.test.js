import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { disconnectPrisma } from '@autopix/core';
import { setupApp, resetDb, hasDb } from './helpers.js';
import { AREA_ENV, CNPJ_HOST, CPF_HOST, DEV_COOKIE, call, insertSession, makeAccount } from './authAreaHelpers.js';

// 4b · intermediação e painel por área. O CNPJ só cruza com empresas (COMPANY); o CPF não recebe
// nenhum indicador de empresa.

const SUPPLIER = {
  types: ['guindastes_munck'],
  objectives: ['oferecer_equipamentos', 'encontrar_compradores'],
  heavy: { rental: true, seeksBuyers: true },
  equipment: [{ type: 'munck', capacityTons: 12, operator: 'com', rental: true, usage: 'oferece', regions: ['Campinas'] }],
};
const BUYER = {
  types: ['construtora_contratante'],
  objectives: ['contratar_equipamentos'],
  buyer: { needs: ['munck'], requests: [{ need: 'munck', minCapacityTons: 12, requiresOperator: true, location: 'Campinas', durationDays: 5 }] },
};

/** Perfil gravado direto no banco (o cadastro de pessoa não aceita todos os tipos; o filtro não depende disso). */
async function withProfile(prisma, account, profile) {
  await prisma.company.update({
    where: { id: account.company.id },
    data: { city: 'Campinas', state: 'SP', operationalProfile: profile, operationalProfileUpdatedAt: new Date() },
  });
  return account;
}

async function seed(ctx) {
  await resetDb(ctx.prisma);
  const buyer = await withProfile(ctx.prisma, await makeAccount(ctx.prisma, { accountType: 'COMPANY' }), BUYER);
  const supplier = await withProfile(ctx.prisma, await makeAccount(ctx.prisma, { accountType: 'COMPANY' }), SUPPLIER);
  const personSupplier = await withProfile(ctx.prisma, await makeAccount(ctx.prisma, { accountType: 'PERSON' }), SUPPLIER);
  const personBuyer = await withProfile(ctx.prisma, await makeAccount(ctx.prisma, { accountType: 'PERSON' }), BUYER);
  return { buyer, supplier, personSupplier, personBuyer };
}

describe.skipIf(!hasDb)('intermediação por área · modo de áreas', () => {
  let ctx;
  let a;

  beforeAll(async () => {
    ctx = await setupApp(AREA_ENV);
    a = await seed(ctx);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('candidatos PERSON não aparecem para o CNPJ (só empresas, nos dois sentidos)', async () => {
    const buyerSession = await insertSession(ctx.prisma, ctx.config, { userId: a.buyer.user.id, area: 'CNPJ' });
    const res = await call(ctx.app, CNPJ_HOST, 'get', '/api/intermediation', { origin: null, xrw: null, cookie: `${DEV_COOKIE[CNPJ_HOST]}=${buyerSession.token}` });
    expect(res.status).toBe(200);
    expect(res.body.suppliers).toHaveLength(1);
    expect(res.body.counts.compatibleSuppliers).toBe(1);

    const supplierSession = await insertSession(ctx.prisma, ctx.config, { userId: a.supplier.user.id, area: 'CNPJ' });
    const back = await call(ctx.app, CNPJ_HOST, 'get', '/api/intermediation', { origin: null, xrw: null, cookie: `${DEV_COOKIE[CNPJ_HOST]}=${supplierSession.token}` });
    expect(back.body.buyers).toHaveLength(1); // o comprador empresa; o comprador PERSON fica de fora
    expect(back.body.counts.compatibleBuyers).toBe(1);
  });

  it('a rota nem existe no host CPF', async () => {
    const session = await insertSession(ctx.prisma, ctx.config, { userId: a.personBuyer.user.id, area: 'CPF' });
    const res = await call(ctx.app, CPF_HOST, 'get', '/api/intermediation', { origin: null, xrw: null, cookie: `${DEV_COOKIE[CPF_HOST]}=${session.token}` });
    expect(res.status).toBe(404);
  });

  it('o serviço, por área: o CPF cruza só com pessoas, o CNPJ só com empresas', async () => {
    const forPerson = await ctx.services.intermediation.overview(a.personBuyer.company.id, { area: 'CPF' });
    expect(forPerson.counts.compatibleSuppliers).toBe(1); // o fornecedor PERSON, nunca a empresa
    const forCompany = await ctx.services.intermediation.overview(a.buyer.company.id, { area: 'CNPJ' });
    expect(forCompany.counts.compatibleSuppliers).toBe(1);
    // Os dois fornecedores têm o mesmo rótulo e cidade: o que muda é quem entra na conta.
    expect(forPerson.suppliers).toHaveLength(1);
  });

  it('o serviço falha fechado: sem área, com área inválida ou com a empresa de outra área', async () => {
    const { intermediation } = ctx.services;
    await expect(intermediation.overview(a.buyer.company.id)).rejects.toThrow(TypeError);
    await expect(intermediation.overview(a.buyer.company.id, { area: 'ADMIN' })).rejects.toThrow(TypeError);
    // Pessoa pedindo como CNPJ, empresa pedindo como CPF: a empresa "não existe" naquela área.
    await expect(intermediation.overview(a.personBuyer.company.id, { area: 'CNPJ' })).rejects.toMatchObject({ status: 404 });
    await expect(intermediation.overview(a.buyer.company.id, { area: 'CPF' })).rejects.toMatchObject({ status: 404 });
  });
});

describe.skipIf(!hasDb)('painel por área · modo de áreas', () => {
  let ctx;
  let a;
  let sessions;

  beforeAll(async () => {
    ctx = await setupApp(AREA_ENV);
    a = await seed(ctx);
    sessions = {
      company: (await insertSession(ctx.prisma, ctx.config, { userId: a.buyer.user.id, area: 'CNPJ' })).token,
      person: (await insertSession(ctx.prisma, ctx.config, { userId: a.personBuyer.user.id, area: 'CPF' })).token,
    };
    // Uma oportunidade da empresa e uma do CPF (que o CPF não deveria ter, mas o painel não pode mostrar).
    for (const account of [a.buyer, a.personBuyer]) {
      await ctx.prisma.opportunity.create({
        data: { companyId: account.company.id, targetKey: `alvo-${account.company.id}`, targetCompanyName: 'Alvo', score: 90, confidence: 0.8, priority: 'HIGH', status: 'NEW', signal: 'x', estimatedMinValue: 1000, estimatedMaxValue: 5000 },
      });
    }
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  const dashboard = (host, token) => call(ctx.app, host, 'get', '/api/dashboard', { origin: null, xrw: null, cookie: `${DEV_COOKIE[host]}=${token}` });

  it('o CNPJ recebe os indicadores da empresa', async () => {
    const res = await dashboard(CNPJ_HOST, sessions.company);
    expect(res.status).toBe(200);
    expect(res.body.metrics).toMatchObject({ opportunities: 1, highPriority: 1, potentialValue: 5000 });
    expect(res.body.pipeline).toEqual({ NEW: 1 });
  });

  it('o CPF não recebe nada de empresa, nem mesmo o que estiver gravado para a conta', async () => {
    const res = await dashboard(CPF_HOST, sessions.person);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ metrics: {}, pipeline: {}, flow: {}, latestJob: null });
    expect(res.text).not.toMatch(/opportunit|potential|companiesAnalyzed|highPriority/i);
  });

  it('o serviço falha fechado sem área ou com área inválida', async () => {
    const { dashboard: service } = ctx.services;
    await expect(service.overview(a.buyer.company.id)).rejects.toThrow(TypeError);
    await expect(service.overview(a.buyer.company.id, { area: 'ADMIN' })).rejects.toThrow(TypeError);
    expect((await service.overview(a.buyer.company.id, { area: 'CNPJ' })).metrics.opportunities).toBe(1);
    expect(await service.overview(a.personBuyer.company.id, { area: 'CPF' })).toEqual({ metrics: {}, pipeline: {}, flow: {}, latestJob: null });
  });
});

describe.skipIf(!hasDb)('intermediação e painel · modo legado, como antes das áreas', () => {
  let ctx;
  let a;

  beforeAll(async () => {
    ctx = await setupApp();
    a = await seed(ctx);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('o comprador vê fornecedores de empresa e de pessoa, sem filtro de área', async () => {
    const { token } = await insertSession(ctx.prisma, ctx.config, { userId: a.buyer.user.id });
    const res = await call(ctx.app, 'localhost:5173', 'get', '/api/intermediation', { origin: null, xrw: null, cookie: `ap_session=${token}` });
    expect(res.status).toBe(200);
    expect(res.body.suppliers).toHaveLength(2);
    expect(res.body.counts.compatibleSuppliers).toBe(2);
    // O serviço ignora a área no modo legado.
    expect((await ctx.services.intermediation.overview(a.buyer.company.id)).counts.compatibleSuppliers).toBe(2);
    expect((await ctx.services.intermediation.overview(a.buyer.company.id, { area: 'CPF' })).counts.compatibleSuppliers).toBe(2);
  });

  it('o painel da conta de pessoa traz a mesma estrutura de sempre', async () => {
    const { token } = await insertSession(ctx.prisma, ctx.config, { userId: a.personBuyer.user.id });
    const res = await call(ctx.app, 'localhost:5173', 'get', '/api/dashboard', { origin: null, xrw: null, cookie: `ap_session=${token}` });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.metrics).sort()).toEqual(['companiesAnalyzed', 'highPriority', 'newLast24h', 'opportunities', 'potentialMinValue', 'potentialValue', 'won', 'wonValue']);
    expect(res.body.metrics.opportunities).toBe(0);
  });
});
