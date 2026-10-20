import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { disconnectPrisma, acceptedAreas, areaOfUser, hostAccepts, accountTypeForHost } from '@autopix/core';
import { cookieFor, sessionCookieName } from '../src/middleware/session.js';
import { PRODUCTION_ENV } from './areaHelpers.js';
import { setupApp, resetDb, testConfig, hasDb } from './helpers.js';
import { AREA_ENV, CNPJ_HOST, CPF_HOST, ADMIN_HOST, DEV_COOKIE, call, cookieValue, insertSession, makeAccount, setCookieOf } from './authAreaHelpers.js';

// Cookie de sessão por área (ARQUITETURA 6.1) e as regras de área (6.2): nomes, atributos e
// o que cada host aceita. A parte de cima não precisa de banco.

const legacy = () => testConfig();
const areasDev = (extra = {}) => testConfig({ ...AREA_ENV, ...extra });
const areasProd = (extra = {}) => testConfig({ ...PRODUCTION_ENV, ...AREA_ENV, ...extra });

const BASE_OPTIONS = { httpOnly: true, sameSite: 'lax', path: '/' };

describe('cookieFor', () => {
  it('modo legado: ap_session com os atributos de sempre, seja qual for a área', () => {
    for (const area of ['CNPJ', 'CPF', 'ADMIN', null, undefined]) {
      const dev = cookieFor(area, legacy());
      expect(dev.name).toBe('ap_session');
      expect(dev.options).toEqual({ ...BASE_OPTIONS, secure: false });
    }
    const prod = cookieFor('CPF', testConfig({ ...PRODUCTION_ENV }));
    expect(prod.name).toBe('ap_session');
    expect(prod.options).toEqual({ ...BASE_OPTIONS, secure: true });
    expect(cookieFor('CNPJ', legacy(), 5000).options).toEqual({ ...BASE_OPTIONS, secure: false, maxAge: 5000 });
  });

  it('modo de áreas em produção: __Host-ap_session, __Host-ap_session_cpf e __Host-ap_session_admin', () => {
    const cfg = areasProd({ ADMIN_HOST });
    expect(cookieFor('CNPJ', cfg).name).toBe('__Host-ap_session');
    expect(cookieFor('CPF', cfg).name).toBe('__Host-ap_session_cpf');
    expect(cookieFor('ADMIN', cfg).name).toBe('__Host-ap_session_admin');
    for (const area of ['CNPJ', 'CPF', 'ADMIN']) {
      const { options } = cookieFor(area, cfg, 1000);
      // __Host- exige Secure, Path=/ e nenhum Domain.
      expect(options).toEqual({ ...BASE_OPTIONS, secure: true, maxAge: 1000 });
      expect(Object.keys(options)).not.toContain('domain');
    }
  });

  it('modo de áreas em desenvolvimento (http): os mesmos nomes sem __Host- e sem Secure', () => {
    const cfg = areasDev();
    expect(cookieFor('CNPJ', cfg).name).toBe('ap_session');
    expect(cookieFor('CPF', cfg).name).toBe('ap_session_cpf');
    expect(cookieFor('ADMIN', cfg).name).toBe('ap_session_admin');
    for (const area of ['CNPJ', 'CPF', 'ADMIN']) {
      expect(cookieFor(area, cfg).options).toEqual({ ...BASE_OPTIONS, secure: false });
    }
  });

  it('os três nomes são diferentes entre si, em qualquer modo', () => {
    for (const cfg of [areasDev(), areasProd()]) {
      expect(new Set(['CNPJ', 'CPF', 'ADMIN'].map((a) => cookieFor(a, cfg).name)).size).toBe(3);
    }
  });

  it('modo de áreas: área desconhecida lança erro, nunca cai no nome legado', () => {
    for (const bad of [null, undefined, '', 'cnpj', 'OUTRA', 'toString', 7]) {
      expect(() => cookieFor(bad, areasDev()), String(bad)).toThrow(TypeError);
    }
  });

  it('config.session.cookieName segue sendo ap_session (o que muda é cookieFor)', () => {
    expect(legacy().session.cookieName).toBe('ap_session');
    expect(areasDev().session.cookieName).toBe('ap_session');
    expect(areasProd().session.cookieName).toBe('ap_session');
  });

  it('sessionCookieName: legado lê ap_session; áreas leem o cookie da área do host; sem área não lê nada', () => {
    expect(sessionCookieName({ area: null }, legacy())).toBe('ap_session');
    expect(sessionCookieName({ area: 'CPF' }, legacy())).toBe('ap_session');
    expect(sessionCookieName({ area: 'CNPJ' }, areasDev())).toBe('ap_session');
    expect(sessionCookieName({ area: 'CPF' }, areasDev())).toBe('ap_session_cpf');
    expect(sessionCookieName({ area: 'CPF' }, areasProd())).toBe('__Host-ap_session_cpf');
    expect(sessionCookieName({ area: null }, areasDev())).toBeNull();
    expect(sessionCookieName({}, areasDev())).toBeNull();
  });
});

describe('acceptedAreas e areaOfUser', () => {
  it('modo legado: todo host aceita todas as áreas, inclusive sem área', () => {
    for (const host of ['CNPJ', 'CPF', 'ADMIN', null, undefined]) {
      expect(acceptedAreas(host, legacy())).toEqual(['CNPJ', 'CPF', 'ADMIN']);
    }
  });

  it('modo de áreas: CNPJ -> [CNPJ, ADMIN] sem ADMIN_HOST; CPF -> [CPF]; ADMIN -> [ADMIN]', () => {
    const cfg = areasDev();
    expect(acceptedAreas('CNPJ', cfg)).toEqual(['CNPJ', 'ADMIN']);
    expect(acceptedAreas('CPF', cfg)).toEqual(['CPF']);
    expect(acceptedAreas('ADMIN', cfg)).toEqual(['ADMIN']);
  });

  it('modo de áreas com ADMIN_HOST: o host CNPJ deixa de aceitar ADMIN', () => {
    const cfg = areasDev({ ADMIN_HOST });
    expect(acceptedAreas('CNPJ', cfg)).toEqual(['CNPJ']);
    expect(acceptedAreas('CPF', cfg)).toEqual(['CPF']);
    expect(acceptedAreas('ADMIN', cfg)).toEqual(['ADMIN']);
  });

  it('modo de áreas: host sem área ou desconhecido não aceita nada (falha fechada)', () => {
    for (const host of [null, undefined, '', 'cnpj', 'OUTRA']) {
      expect(acceptedAreas(host, areasDev()), String(host)).toEqual([]);
      expect(hostAccepts(host, 'CNPJ', areasDev())).toBe(false);
    }
  });

  it('hostAccepts cruza host e área', () => {
    const cfg = areasDev();
    expect(hostAccepts('CPF', 'CPF', cfg)).toBe(true);
    expect(hostAccepts('CPF', 'CNPJ', cfg)).toBe(false);
    expect(hostAccepts('CNPJ', 'CPF', cfg)).toBe(false);
    expect(hostAccepts('CNPJ', 'ADMIN', cfg)).toBe(true);
    expect(hostAccepts('CPF', 'ADMIN', cfg)).toBe(false);
  });

  it('areaOfUser: admin é ADMIN mesmo com empresa PERSON; senão COMPANY -> CNPJ e PERSON -> CPF', () => {
    expect(areaOfUser({ isPlatformAdmin: true, company: { accountType: 'PERSON' } })).toBe('ADMIN');
    expect(areaOfUser({ isPlatformAdmin: true, company: { accountType: 'COMPANY' } })).toBe('ADMIN');
    expect(areaOfUser({ isPlatformAdmin: false, company: { accountType: 'COMPANY' } })).toBe('CNPJ');
    expect(areaOfUser({ isPlatformAdmin: false, company: { accountType: 'PERSON' } })).toBe('CPF');
    expect(areaOfUser({ company: { accountType: 'PERSON' } })).toBe('CPF');
  });

  it('areaOfUser falha fechado sem empresa, sem tipo ou sem usuário', () => {
    expect(() => areaOfUser({ isPlatformAdmin: false })).toThrow(TypeError);
    expect(() => areaOfUser({ company: {} })).toThrow(TypeError);
    expect(() => areaOfUser({ company: { accountType: 'OUTRO' } })).toThrow(TypeError);
    expect(() => areaOfUser(null)).toThrow(TypeError);
  });

  it('accountTypeForHost: CNPJ -> COMPANY, CPF -> PERSON, o resto não tem cadastro', () => {
    expect(accountTypeForHost('CNPJ')).toBe('COMPANY');
    expect(accountTypeForHost('CPF')).toBe('PERSON');
    for (const host of ['ADMIN', null, undefined, 'cnpj']) expect(accountTypeForHost(host)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
describe.skipIf(!hasDb)('cookie gravado no login · modo legado', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('o login grava ap_session HttpOnly, SameSite=Lax, Path=/, sem Domain, e guarda a área na sessão', async () => {
    const cnpj = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    const cpf = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    const admin = await makeAccount(ctx.prisma, { accountType: 'PERSON', platformAdmin: true });
    for (const [account, area] of [[cnpj, 'CNPJ'], [cpf, 'CPF'], [admin, 'ADMIN']]) {
      for (const host of ['localhost:5173', 'cpf.temcnpj.com.br', 'x.up.railway.app']) {
        const res = await call(ctx.app, host, 'post', '/api/auth/login', { body: { email: account.email, password: account.password }, origin: 'http://localhost:5173' });
        expect(res.status, `${area} ${host}`).toBe(200);
        const header = setCookieOf(res, 'ap_session');
        expect(header, host).toBeDefined();
        expect(header).toMatch(/; HttpOnly/i);
        expect(header).toMatch(/; SameSite=Lax/i);
        expect(header).toMatch(/; Path=\//);
        expect(header).not.toMatch(/Domain=/i);
        expect(header).not.toMatch(/; Secure/i); // ambiente de teste: http
        expect(setCookieOf(res, 'ap_session_cpf')).toBeUndefined();
      }
      const rows = await ctx.prisma.session.findMany({ where: { userId: account.user.id } });
      expect(rows.length).toBe(3);
      expect(new Set(rows.map((r) => r.area))).toEqual(new Set([area]));
    }
  });

  it('sessão antiga, sem área, continua valendo no modo legado (cookie e bearer)', async () => {
    const { user } = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    const { token } = await insertSession(ctx.prisma, ctx.config, { userId: user.id, area: null });
    const viaCookie = await call(ctx.app, 'localhost:5173', 'get', '/api/me', { cookie: `ap_session=${token}`, origin: null, xrw: null });
    expect(viaCookie.status).toBe(200);
    expect(viaCookie.body.user.id).toBe(user.id);
    const viaBearer = await call(ctx.app, 'x.up.railway.app', 'get', '/api/me', { bearer: token, origin: null, xrw: null });
    expect(viaBearer.status).toBe(200);
    // E a linha continua como estava: a coluna não é preenchida às escondidas.
    expect((await ctx.prisma.session.findFirst({ where: { userId: user.id } })).area).toBeNull();
  });

  it('desafio de WhatsApp, token de ativação e token de reset também gravam a área', async () => {
    const acc = await makeAccount(ctx.prisma, { accountType: 'PERSON', whatsapp: true });
    const login = await call(ctx.app, 'localhost:5173', 'post', '/api/auth/login', { body: { email: acc.email, password: acc.password }, origin: 'http://localhost:5173' });
    expect(login.body.mfaRequired).toBe(true);
    expect((await ctx.prisma.loginChallenge.findUnique({ where: { id: login.body.challengeId } })).area).toBe('CPF');

    const { token: activation } = await ctx.services.auth.issueActivation(acc.user.id);
    expect(activation).toBeTruthy();
    expect((await ctx.prisma.activationToken.findFirst({ where: { userId: acc.user.id } })).area).toBe('CPF');

    const reset = await ctx.services.auth.requestPasswordReset(acc.email);
    expect(reset.sent).toBe(true);
    expect((await ctx.prisma.passwordResetToken.findFirst({ where: { userId: acc.user.id } })).area).toBe('CPF');
    // O link continua sendo o de APP_URL, com o mesmo formato de antes.
    expect(ctx.email.outbox.at(-1).text).toContain(`http://localhost:5173/reset-password/${reset.token}`);
  });
});

// ---------------------------------------------------------------------------------------------
describe.skipIf(!hasDb)('cookie gravado no login · modo de áreas', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp(AREA_ENV);
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('CNPJ grava ap_session e CPF grava ap_session_cpf, host-only e sem prefixo em http', async () => {
    const cnpj = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    const cpf = await makeAccount(ctx.prisma, { accountType: 'PERSON' });

    const a = await call(ctx.app, CNPJ_HOST, 'post', '/api/auth/login', { body: { email: cnpj.email, password: cnpj.password } });
    expect(a.status).toBe(200);
    expect(setCookieOf(a, 'ap_session')).toMatch(/; HttpOnly.*; SameSite=Lax|; SameSite=Lax.*; HttpOnly/i);
    expect(setCookieOf(a, 'ap_session_cpf')).toBeUndefined();

    const b = await call(ctx.app, CPF_HOST, 'post', '/api/auth/login', { body: { email: cpf.email, password: cpf.password } });
    expect(b.status).toBe(200);
    const header = setCookieOf(b, 'ap_session_cpf');
    expect(header).toBeDefined();
    expect(header).toMatch(/; HttpOnly/i);
    expect(header).toMatch(/; SameSite=Lax/i);
    expect(header).toMatch(/; Path=\//);
    expect(header).not.toMatch(/Domain=/i);
    expect(setCookieOf(b, 'ap_session')).toBeUndefined();

    expect((await ctx.prisma.session.findFirst({ where: { userId: cnpj.user.id } })).area).toBe('CNPJ');
    expect((await ctx.prisma.session.findFirst({ where: { userId: cpf.user.id } })).area).toBe('CPF');
  });

  it('admin sem ADMIN_HOST entra pelo host CNPJ, no cookie do CNPJ, com a sessão na área ADMIN', async () => {
    const admin = await makeAccount(ctx.prisma, { accountType: 'PERSON', platformAdmin: true });
    const ok = await call(ctx.app, CNPJ_HOST, 'post', '/api/auth/login', { body: { email: admin.email, password: admin.password } });
    expect(ok.status).toBe(200);
    expect(setCookieOf(ok, 'ap_session')).toBeDefined();
    expect((await ctx.prisma.session.findFirst({ where: { userId: admin.user.id } })).area).toBe('ADMIN');
    const me = await call(ctx.app, CNPJ_HOST, 'get', '/api/me', { cookie: `ap_session=${cookieValue(setCookieOf(ok, 'ap_session'))}`, origin: null, xrw: null });
    expect(me.status).toBe(200);
    // No host CPF o admin é uma conta de outra área: responde como senha errada.
    const cpfHost = await call(ctx.app, CPF_HOST, 'post', '/api/auth/login', { body: { email: admin.email, password: admin.password } });
    expect(cpfHost.status).toBe(401);
  });

  it('o logout apaga o cookie da área do host', async () => {
    const cpf = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    const login = await call(ctx.app, CPF_HOST, 'post', '/api/auth/login', { body: { email: cpf.email, password: cpf.password } });
    const cookie = `${DEV_COOKIE[CPF_HOST]}=${cookieValue(setCookieOf(login, DEV_COOKIE[CPF_HOST]))}`;
    const out = await call(ctx.app, CPF_HOST, 'post', '/api/auth/logout', { cookie });
    expect(out.status).toBe(200);
    expect(setCookieOf(out, 'ap_session_cpf')).toMatch(/^ap_session_cpf=;/);
    expect(await ctx.prisma.session.count({ where: { userId: cpf.user.id } })).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe.skipIf(!hasDb)('cookie gravado no login · modo de áreas em produção', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp({ ...PRODUCTION_ENV, DATABASE_URL: process.env.DATABASE_URL, ...AREA_ENV });
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('usa __Host-, com Secure, Path=/ e sem Domain, um nome por área', async () => {
    const cnpj = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    const cpf = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    for (const [host, account, name] of [[CNPJ_HOST, cnpj, '__Host-ap_session'], [CPF_HOST, cpf, '__Host-ap_session_cpf']]) {
      const res = await call(ctx.app, host, 'post', '/api/auth/login', {
        body: { email: account.email, password: account.password },
        origin: `https://${host}`,
      });
      expect(res.status, host).toBe(200);
      const header = setCookieOf(res, name);
      expect(header, host).toBeDefined();
      expect(header).toMatch(/; Path=\//);
      expect(header).toMatch(/; HttpOnly/i);
      expect(header).toMatch(/; Secure/i);
      expect(header).toMatch(/; SameSite=Lax/i);
      expect(header).not.toMatch(/Domain=/i);
      // Nenhum cookie com o nome sem prefixo nem o da outra área.
      expect((res.headers['set-cookie'] || []).length).toBe(1);
    }
  });
});
