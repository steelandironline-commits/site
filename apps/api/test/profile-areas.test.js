import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { disconnectPrisma } from '@autopix/core';
import { API_MOUNTS } from '@autopix/areas';
import { setupApp, resetDb, hasDb } from './helpers.js';
import { AREA_ENV, CNPJ_HOST, CPF_HOST, DEV_COOKIE, call, insertSession, makeAccount } from './authAreaHelpers.js';

// ETAPA 5 · GET/PUT /api/profile: a tela "Meu perfil" da área CPF. A rota só existe no host CPF
// (404 antes de autenticar nos outros), lê e grava o perfil da conta PERSON com a regra de
// CompanyService e não devolve nada de empresa (cobrança, comissão, equipe, chave Pix de repasse).

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } };

/** Campos de empresa que nunca podem aparecer no perfil de uma pessoa. */
const COMPANY_KEYS = [
  'cnpj',
  'website',
  'instagram',
  'products',
  'idealCustomer',
  'averageTicket',
  'minimumDeal',
  'preferredIndustries',
  'excludedIndustries',
  'keywords',
  'serviceLocations',
  'agentsPaused',
  'payoutPixKey',
  'payoutPixKeyType',
  'payoutPixKeyLast4',
  'searchConfigVersion',
  'accountType',
  'subscription',
  'billing',
  'commission',
  'team',
  'members',
  'plan',
  'id',
  'companyId',
];

/** Todas as chaves de um objeto JSON, em qualquer profundidade. */
function keysDeep(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysDeep(v, out);
    }
  }
  return out;
}

describe('manifesto · /api/profile', () => {
  it('é uma montagem só do CPF', () => {
    expect(API_MOUNTS.find((m) => m.path === '/api/profile')?.areas).toEqual(['CPF']);
  });
});

describe.skipIf(!hasDb)('/api/profile · modo de áreas', () => {
  let ctx;
  let person;
  let company;
  let personToken;
  let companyToken;

  const asPerson = { cookie: undefined, origin: null, xrw: null };
  const get = (host, cookie, path = '/api/profile') => call(ctx.app, host, 'get', path, { cookie, origin: null, xrw: null });
  const put = (host, cookie, body) => call(ctx.app, host, 'put', '/api/profile', { cookie, body });

  beforeAll(async () => {
    ctx = await setupApp({ ...AREA_ENV, DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
    person = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    company = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    personToken = (await insertSession(ctx.prisma, ctx.config, { userId: person.user.id, area: 'CPF' })).token;
    companyToken = (await insertSession(ctx.prisma, ctx.config, { userId: company.user.id, area: 'CNPJ' })).token;
    asPerson.cookie = `${DEV_COOKIE[CPF_HOST]}=${personToken}`;
    // Dados de empresa que o perfil nunca pode mostrar, gravados direto na conta da pessoa.
    await ctx.prisma.company.update({
      where: { id: person.company.id },
      data: {
        phone: '(47) 99999-0000',
        postalCode: '89201000',
        city: 'Joinville',
        state: 'PR',
        serviceRadiusKm: 80,
        description: 'Eletricista residencial.',
        services: ['Eletricista'],
        payoutPixKey: 'segredo@pix.example',
        payoutPixKeyType: 'EMAIL',
        products: ['Peças'],
        website: 'https://empresa.example',
      },
    });
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('no host CPF, a pessoa lê o próprio perfil', async () => {
    const res = await get(CPF_HOST, asPerson.cookie);
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({
      name: person.company.name,
      phone: '(47) 99999-0000',
      postalCode: '89201000',
      city: 'Joinville',
      state: 'PR',
      serviceRadiusKm: 80,
      description: 'Eletricista residencial.',
      services: ['Eletricista'],
    });
    expect(res.body.profile.cpfMasked).toMatch(/^\*\*\*\.\d{3}\.\d{3}-\*\*$/);
  });

  it('o perfil devolvido não tem campo de empresa: cobrança, comissão, equipe, chave de repasse', async () => {
    const res = await get(CPF_HOST, asPerson.cookie);
    expect(Object.keys(res.body)).toEqual(['profile']);
    expect(Object.keys(res.body.profile).sort()).toEqual(
      ['cpfMasked', 'city', 'description', 'name', 'operationalProfile', 'phone', 'postalCode', 'serviceRadiusKm', 'services', 'state'].sort(),
    );
    const keys = keysDeep(res.body);
    for (const key of COMPANY_KEYS) expect(keys.has(key), key).toBe(false);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('segredo@pix.example');
    expect(text).not.toContain('empresa.example');
    expect(text).not.toContain(person.document); // o CPF inteiro nunca vai: só mascarado
  });

  it('PUT grava só o perfil da pessoa, com a regra de CompanyService, e responde o perfil novo', async () => {
    const before = await ctx.prisma.company.findUnique({ where: { id: person.company.id } });
    const res = await put(CPF_HOST, asPerson.cookie, {
      name: '  Maria da Silva  ',
      services: ['Eletricista', 'Eletricista', 'Pintor'],
      city: 'Blumenau',
      state: 'sc',
      description: '',
      operationalProfile: { types: ['profissional_autonomo'], objectives: ['encontrar_obras'] },
    });
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ name: 'Maria da Silva', services: ['Eletricista', 'Pintor'], city: 'Blumenau', state: 'SC', description: null });
    expect(res.body.profile.operationalProfile.types).toEqual(['profissional_autonomo']);
    expect(res.body.changed).toEqual(expect.arrayContaining(['name', 'services', 'city', 'state', 'description', 'operationalProfile']));
    expect(Object.keys(res.body).sort()).toEqual(['changed', 'profile']);
    expect(keysDeep(res.body.profile).has('payoutPixKey')).toBe(false);

    const after = await ctx.prisma.company.findUnique({ where: { id: person.company.id } });
    expect(after.name).toBe('Maria da Silva');
    expect(after.operationalProfileUpdatedAt).toBeInstanceOf(Date);
    // A pessoa não tem busca de oportunidades: nada foi enfileirado nem a versão da busca mudou.
    expect(after.searchConfigVersion).toBe(before.searchConfigVersion);
    expect(await ctx.prisma.searchJob.count({ where: { companyId: person.company.id } })).toBe(0);
    // O registro de atividade usa texto de pessoa, não o de perfil comercial.
    const event = await ctx.prisma.activityEvent.findFirst({ where: { companyId: person.company.id }, orderBy: { createdAt: 'desc' } });
    expect(event.title).toBe('Perfil atualizado');
    expect(event.description).toBe('Dados do perfil atualizados.');

    const reread = await get(CPF_HOST, asPerson.cookie);
    expect(reread.body.profile.name).toBe('Maria da Silva');
  });

  it('PUT ignora todo campo de empresa que venha no corpo: nada de CNPJ, chave Pix, produtos nem site', async () => {
    const res = await put(CPF_HOST, asPerson.cookie, {
      phone: '(47) 98888-7777',
      cnpj: '11.222.333/0001-81',
      payoutPixKey: 'ladrao@pix.example',
      payoutPixKeyType: 'EMAIL',
      products: ['Peças usinadas'],
      website: 'https://outro.example',
      idealCustomer: 'Indústrias',
      agentsPaused: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.changed).toEqual(['phone']);
    const row = await ctx.prisma.company.findUnique({ where: { id: person.company.id } });
    expect(row.phone).toBe('(47) 98888-7777');
    expect(row.cnpj).toBeNull();
    expect(row.payoutPixKey).toBe('segredo@pix.example');
    expect(row.products).toEqual(['Peças']);
    expect(row.website).toBe('https://empresa.example');
    expect(row.idealCustomer).toBeNull();
    expect(row.agentsPaused).toBe(false);
  });

  it('PUT valida com as regras de sempre e responde 400 com os campos', async () => {
    const res = await put(CPF_HOST, asPerson.cookie, { name: 'a', postalCode: '123', serviceRadiusKm: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.name).toBe('Informe seu nome');
    expect(res.body.error.fields.postalCode).toBe('Informe o CEP com 8 números');
    expect(res.body.error.fields.serviceRadiusKm).toBeTruthy();
    const bad = await put(CPF_HOST, asPerson.cookie, { operationalProfile: { types: ['nao-existe'] } });
    expect(bad.status).toBe(400);
  });

  it('sem sessão, no host CPF, responde 401; com a sessão do CNPJ no host CPF, a sessão é recusada', async () => {
    expect((await get(CPF_HOST, undefined)).status).toBe(401);
    expect((await put(CPF_HOST, undefined, { phone: '1' })).status).toBe(401);
    const wrong = await get(CPF_HOST, `${DEV_COOKIE[CPF_HOST]}=${companyToken}`);
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.code).toBe('WRONG_AREA');
  });

  it('no host CNPJ a rota não existe: 404 antes de autenticar, sem sessão e com qualquer sessão', async () => {
    const cookies = [undefined, `${DEV_COOKIE[CNPJ_HOST]}=${companyToken}`];
    for (const cookie of cookies) {
      for (const sub of ['/api/profile', '/api/profile/qualquer']) {
        const g = await get(CNPJ_HOST, cookie, sub);
        expect(g.status, `GET ${sub} ${cookie ?? 'sem sessão'}`).toBe(404);
        expect(g.body).toEqual(NOT_FOUND);
        const p = await put(CNPJ_HOST, cookie, { phone: '1' });
        expect(p.status, `PUT ${cookie ?? 'sem sessão'}`).toBe(404);
        expect(p.body).toEqual(NOT_FOUND);
      }
    }
    // E é a mesma resposta de uma rota que não existe em lugar nenhum.
    const unknown = await get(CNPJ_HOST, undefined, '/api/nao-existe');
    expect(unknown.body).toEqual(NOT_FOUND);
    // A sessão da pessoa no host CNPJ é recusada antes de qualquer rota (403 de área errada), sem abrir o perfil.
    const wrong = await get(CNPJ_HOST, `${DEV_COOKIE[CNPJ_HOST]}=${personToken}`);
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.code).toBe('WRONG_AREA');
    expect(JSON.stringify(wrong.body)).not.toContain('profile');
  });

  it('um host desconhecido também responde 404', async () => {
    const res = await get('x.up.railway.app', `${DEV_COOKIE[CPF_HOST]}=${personToken}`);
    expect(res.status).toBe(404);
  });
});

describe.skipIf(!hasDb)('/api/profile · modo legado', () => {
  let ctx;
  let person;
  let company;
  let tokens;

  const get = (token) => call(ctx.app, 'localhost:5173', 'get', '/api/profile', { cookie: token ? `ap_session=${token}` : undefined, origin: null, xrw: null });

  beforeAll(async () => {
    ctx = await setupApp({});
    await resetDb(ctx.prisma);
    person = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    company = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    tokens = {
      person: (await insertSession(ctx.prisma, ctx.config, { userId: person.user.id, area: 'CPF' })).token,
      company: (await insertSession(ctx.prisma, ctx.config, { userId: company.user.id, area: 'CNPJ' })).token,
    };
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('sem áreas ligadas, a conta de empresa não lê nem grava perfil de pessoa: 404 igual ao de rota inexistente', async () => {
    const res = await get(tokens.company);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
    const put = await call(ctx.app, 'localhost:5173', 'put', '/api/profile', { cookie: `ap_session=${tokens.company}`, body: { name: 'Hacker' } });
    expect(put.status).toBe(404);
    expect((await ctx.prisma.company.findUnique({ where: { id: company.company.id } })).name).toBe(company.company.name);
  });

  it('a conta de pessoa lê o próprio perfil e o anônimo recebe 401', async () => {
    expect((await get(tokens.person)).status).toBe(200);
    expect((await get(undefined)).status).toBe(401);
  });
});
