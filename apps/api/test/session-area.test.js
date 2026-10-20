import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { disconnectPrisma } from '@autopix/core';
import { setupApp, resetDb, hasDb, testCpf } from './helpers.js';
import { AREA_ENV, ADMIN_HOST, CNPJ_HOST, CPF_HOST, DEV_COOKIE, call, cookiePair, insertSession, makeAccount, setCookieOf } from './authAreaHelpers.js';

// 4c · item J (lacuna da 4b, ARQUITETURA 6.5). /api/me e /api/session dizem a área da sessão
// (CNPJ, CPF ou ADMIN) para o app montar o menu. No modo legado devolvem `area: null` e o resto
// da resposta é o de sempre.

describe.skipIf(!hasDb)('/api/me e /api/session · área da sessão · modo de áreas', () => {
  let ctx;
  let cookie;

  const get = (host, who, path) => call(ctx.app, host, 'get', path, { cookie: `${DEV_COOKIE[host]}=${cookie[who]}`, origin: null, xrw: null });

  beforeAll(async () => {
    ctx = await setupApp({ ...AREA_ENV, DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
    const company = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    const person = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    const admin = await makeAccount(ctx.prisma, { accountType: 'PERSON', platformAdmin: true });
    const tok = async (a, area) => (await insertSession(ctx.prisma, ctx.config, { userId: a.user.id, area })).token;
    cookie = { company: await tok(company, 'CNPJ'), person: await tok(person, 'CPF'), admin: await tok(admin, 'ADMIN') };
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('a sessão do CNPJ, a do CPF e a do admin dizem a própria área nas duas respostas', async () => {
    for (const [host, who, area] of [[CNPJ_HOST, 'company', 'CNPJ'], [CPF_HOST, 'person', 'CPF'], [CNPJ_HOST, 'admin', 'ADMIN']]) {
      const me = await get(host, who, '/api/me');
      expect(me.status, `${who} /api/me`).toBe(200);
      expect(me.body.area, `${who} /api/me`).toBe(area);
      const session = await get(host, who, '/api/session');
      expect(session.status, `${who} /api/session`).toBe(200);
      expect(session.body.session.area, `${who} /api/session`).toBe(area);
    }
  });

  it('o resto da resposta é o de sempre', async () => {
    const me = await get(CPF_HOST, 'person', '/api/me');
    expect(Object.keys(me.body).sort()).toEqual(['area', 'company', 'demoMode', 'scope', 'subscription', 'user']);
    expect(me.body.scope).toBe('FULL');
    expect(me.body.user).toMatchObject({ role: 'OWNER', isPlatformAdmin: false });
  });

  it('sem sessão, /api/session segue devolvendo { session: null }', async () => {
    const res = await call(ctx.app, CNPJ_HOST, 'get', '/api/session', { origin: null, xrw: null });
    expect(res.body).toEqual({ session: null });
  });

  it('a sessão de cadastro também diz a área do host em que foi aberta', async () => {
    const start = await call(ctx.app, CPF_HOST, 'post', '/api/onboarding/start', {
      body: { accountType: 'PERSON', name: 'João Pereira', email: `joao-${Date.now()}@area.example`, document: testCpf() },
    });
    const sessionCookie = cookiePair(setCookieOf(start, DEV_COOKIE[CPF_HOST]));
    const me = await call(ctx.app, CPF_HOST, 'get', '/api/me', { cookie: sessionCookie, origin: null, xrw: null });
    expect(me.body).toMatchObject({ scope: 'ONBOARDING', area: 'CPF' });
  });
});

describe.skipIf(!hasDb)('/api/me e /api/session · área da sessão · host de admin', () => {
  let ctx;
  let cookie;

  beforeAll(async () => {
    ctx = await setupApp({ ...AREA_ENV, ADMIN_HOST, DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
    const admin = await makeAccount(ctx.prisma, { accountType: 'PERSON', platformAdmin: true });
    cookie = `${DEV_COOKIE[ADMIN_HOST]}=${(await insertSession(ctx.prisma, ctx.config, { userId: admin.user.id, area: 'ADMIN' })).token}`;
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('o host de admin devolve ADMIN', async () => {
    expect((await call(ctx.app, ADMIN_HOST, 'get', '/api/me', { cookie, origin: null, xrw: null })).body.area).toBe('ADMIN');
    expect((await call(ctx.app, ADMIN_HOST, 'get', '/api/session', { cookie, origin: null, xrw: null })).body.session.area).toBe('ADMIN');
  });
});

describe.skipIf(!hasDb)('/api/me e /api/session · modo legado', () => {
  let ctx;
  let cookie;

  beforeAll(async () => {
    ctx = await setupApp({ DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
    const person = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    cookie = `ap_session=${(await insertSession(ctx.prisma, ctx.config, { userId: person.user.id })).token}`;
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('devolve area: null e o resto de sempre', async () => {
    const me = await call(ctx.app, 'localhost:5173', 'get', '/api/me', { cookie, origin: null, xrw: null });
    expect(me.status).toBe(200);
    expect(me.body.area).toBeNull();
    const { area, ...rest } = me.body;
    expect(Object.keys(rest).sort()).toEqual(['company', 'demoMode', 'scope', 'subscription', 'user']);
    const session = await call(ctx.app, 'localhost:5173', 'get', '/api/session', { cookie, origin: null, xrw: null });
    expect(session.body.session.area).toBeNull();
  });
});
