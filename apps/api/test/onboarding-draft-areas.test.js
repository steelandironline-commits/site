import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { disconnectPrisma } from '@autopix/core';
import { setupApp, resetDb, hasDb, testCnpj, testCpf } from './helpers.js';
import { AREA_ENV, CNPJ_HOST, CPF_HOST, DEV_COOKIE, call, cookiePair, setCookieOf } from './authAreaHelpers.js';

// 4c · item H. Comparando os dois hosts, o cadastro em andamento de um e-mail respondia diferente:
// no host da área do rascunho ele era reiniciado (201, e o rascunho de quem o abriu era apagado), no
// outro host respondia "em andamento". Dava para descobrir a área do rascunho, e qualquer um que
// soubesse o e-mail o reiniciava. Agora, no modo de áreas, um rascunho só é reiniciado pela sessão
// de cadastro que é dele; para qualquer outra pessoa a resposta é a mesma mensagem neutra, nos dois
// hosts, sem citar área.

const GIVEAWAYS = /CNPJ|CPF|empresa|pessoa|jur[ií]dica|f[ií]sica|colaborador/i;
const IN_PROGRESS = /Já existe um cadastro em andamento com este e-mail/;
const CNPJ_COOKIE = DEV_COOKIE[CNPJ_HOST];
const CPF_COOKIE = DEV_COOKIE[CPF_HOST];

const company = (extra = {}) => ({ accountType: 'COMPANY', name: 'Bia Lima', email: `bia-${Date.now()}-${Math.random()}@area.example`, companyName: 'Construtora Lima', document: testCnpj(), ...extra });
const person = (extra = {}) => ({ accountType: 'PERSON', name: 'João Pereira', email: `joao-${Date.now()}-${Math.random()}@area.example`, document: testCpf(), ...extra });

/** O que um sondador enxerga de uma resposta: tudo menos o que muda a cada pedido. */
const seen = (res) => ({ status: res.status, body: res.body, setCookie: res.headers['set-cookie'] ?? null, type: res.headers['content-type'] });

describe.skipIf(!hasDb)('cadastro em andamento · mesma resposta nos dois hosts · modo de áreas', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp({ ...AREA_ENV, DEMO_MODE: 'false' });
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  const start = (host, body, cookie) => call(ctx.app, host, 'post', '/api/onboarding/start', { body, cookie });
  const check = (host, body, cookie) => call(ctx.app, host, 'post', '/api/onboarding/check', { body, cookie });

  it('rascunho do CNPJ: sem a sessão dele, os dois hosts respondem igual e o rascunho fica como estava', async () => {
    const email = `rascunho-pj-${Date.now()}@area.example`;
    const draft = await start(CNPJ_HOST, company({ email }));
    expect(draft.status).toBe(201);
    const before = await ctx.prisma.user.findUnique({ where: { email }, include: { company: true } });

    const here = await start(CNPJ_HOST, company({ email }));
    const there = await start(CPF_HOST, person({ email }));
    expect(here.status).toBe(409);
    expect(seen(here)).toEqual(seen(there));
    expect(here.body.error.message).toMatch(IN_PROGRESS);
    expect(here.body.error.message).not.toMatch(GIVEAWAYS);
    expect(here.headers['set-cookie']).toBeUndefined();

    const after = await ctx.prisma.user.findUnique({ where: { email }, include: { company: true } });
    expect(after).toMatchObject({ id: before.id, name: before.name, loginId: before.loginId });
    expect(after.company).toMatchObject({ accountType: 'COMPANY', cnpj: before.company.cnpj, name: before.company.name });
    expect(await ctx.prisma.session.count({ where: { userId: before.id } })).toBe(1);
  });

  it('rascunho do CPF: o mesmo, nos dois sentidos', async () => {
    const email = `rascunho-pf-${Date.now()}@area.example`;
    expect((await start(CPF_HOST, person({ email }))).status).toBe(201);
    const here = await start(CPF_HOST, person({ email }));
    const there = await start(CNPJ_HOST, company({ email }));
    expect(here.status).toBe(409);
    expect(seen(here)).toEqual(seen(there));
    expect(here.body.error.message).not.toMatch(GIVEAWAYS);
    const kept = await ctx.prisma.user.findUnique({ where: { email }, include: { company: true } });
    expect(kept.company.accountType).toBe('PERSON');
    expect(await ctx.prisma.session.count({ where: { userId: kept.id } })).toBe(1);
  });

  it('a verificação do primeiro passo também responde igual nos dois hosts', async () => {
    const email = `rascunho-chk-${Date.now()}@area.example`;
    expect((await start(CNPJ_HOST, company({ email }))).status).toBe(201);
    const here = await check(CNPJ_HOST, { accountType: 'COMPANY', email, document: testCnpj() });
    const there = await check(CPF_HOST, { accountType: 'PERSON', email, document: testCpf() });
    expect(here.status).toBe(200);
    expect(seen(here)).toEqual(seen(there));
    expect(here.body).toMatchObject({ available: false });
    expect(here.body.taken.email).toMatch(IN_PROGRESS);
    expect(here.body.taken.email).not.toMatch(GIVEAWAYS);
  });

  it('quem tem a sessão de cadastro do rascunho continua podendo reiniciá-lo e verificá-lo', async () => {
    const email = `rascunho-dono-${Date.now()}@area.example`;
    const draft = await start(CNPJ_HOST, company({ email }));
    const cookie = cookiePair(setCookieOf(draft, CNPJ_COOKIE));
    const before = await ctx.prisma.user.findUnique({ where: { email } });

    expect((await check(CNPJ_HOST, { accountType: 'COMPANY', email, document: testCnpj() }, cookie)).body).toMatchObject({ available: true });
    const own = await start(CNPJ_HOST, company({ email, name: 'Bia Corrigida' }), cookie);
    expect(own.status).toBe(201);
    expect(setCookieOf(own, CNPJ_COOKIE)).toBeDefined();
    const after = await ctx.prisma.user.findUnique({ where: { email } });
    expect(after).toMatchObject({ id: before.id, name: 'Bia Corrigida' });
    // A sessão antiga caiu (o reinício revoga as de antes) e a nova vale.
    expect((await call(ctx.app, CNPJ_HOST, 'get', '/api/onboarding', { cookie, origin: null, xrw: null })).status).toBe(401);
    expect((await call(ctx.app, CNPJ_HOST, 'get', '/api/onboarding', { cookie: cookiePair(setCookieOf(own, CNPJ_COOKIE)), origin: null, xrw: null })).status).toBe(200);
  });

  it('a sessão de cadastro de outro rascunho não serve de chave', async () => {
    const mine = await start(CNPJ_HOST, company());
    const mineCookie = cookiePair(setCookieOf(mine, CNPJ_COOKIE));
    const email = `rascunho-alheio-${Date.now()}@area.example`;
    expect((await start(CNPJ_HOST, company({ email }))).status).toBe(201);
    const res = await start(CNPJ_HOST, company({ email }), mineCookie);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(IN_PROGRESS);
  });

  it('e-mail de conta ativa continua dando a mensagem de sempre, em qualquer host', async () => {
    const { makeAccount } = await import('./authAreaHelpers.js');
    const acc = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    for (const [host, body] of [[CNPJ_HOST, company({ email: acc.email })], [CPF_HOST, person({ email: acc.email })]]) {
      const res = await start(host, body);
      expect(res.status, host).toBe(409);
      expect(res.body.error.message).toBe('Já existe um cadastro com este e-mail. Use outro e-mail ou entre com a sua conta.');
    }
  });
});

describe.skipIf(!hasDb)('cadastro em andamento · modo legado, o reinício por e-mail de sempre', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp({ DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('um rascunho sem cobrança é reiniciado só com o e-mail, como antes', async () => {
    const email = `legado-${Date.now()}@area.example`;
    const host = 'localhost:5173';
    const first = await call(ctx.app, host, 'post', '/api/onboarding/start', { body: company({ email }) });
    expect(first.status).toBe(201);
    const again = await call(ctx.app, host, 'post', '/api/onboarding/start', { body: company({ email, name: 'Outra Pessoa' }) });
    expect(again.status).toBe(201);
    expect((await ctx.prisma.user.findUnique({ where: { email } })).name).toBe('Outra Pessoa');
  });
});
