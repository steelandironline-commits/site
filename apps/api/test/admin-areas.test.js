import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { disconnectPrisma } from '@autopix/core';
import { setupApp, resetDb, hasDb } from './helpers.js';
import { AREA_ENV, ADMIN_HOST, CNPJ_HOST, CPF_HOST, DEV_COOKIE, call, insertSession, makeAccount } from './authAreaHelpers.js';

// 4b · /api/admin. Em modo de áreas só uma sessão ADMIN de um administrador da plataforma passa.
// Qualquer outra coisa (empresa, pessoa, sem sessão, host CPF) recebe o mesmo 404 de rota inexistente.

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } };
const OVERVIEW = '/api/admin/overview';
const read = (app, host, auth = {}) => call(app, host, 'get', OVERVIEW, { origin: null, xrw: null, ...auth });
const cookieOf = (host, token) => ({ cookie: `${DEV_COOKIE[host]}=${token}` });

describe.skipIf(!hasDb)('admin · modo de áreas, admin dentro do host CNPJ (sem ADMIN_HOST)', () => {
  let ctx;
  let company;
  let person;
  let admin;
  let sessions;

  beforeAll(async () => {
    ctx = await setupApp(AREA_ENV);
    await resetDb(ctx.prisma);
    company = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    person = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    admin = await makeAccount(ctx.prisma, { accountType: 'PERSON', platformAdmin: true });
    sessions = {
      company: await insertSession(ctx.prisma, ctx.config, { userId: company.user.id, area: 'CNPJ' }),
      person: await insertSession(ctx.prisma, ctx.config, { userId: person.user.id, area: 'CPF' }),
      admin: await insertSession(ctx.prisma, ctx.config, { userId: admin.user.id, area: 'ADMIN' }),
      // O que o servidor nunca cria: sessão ADMIN para quem não é administrador.
      forged: await insertSession(ctx.prisma, ctx.config, { userId: company.user.id, area: 'ADMIN' }),
    };
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('sessão de empresa (não-admin) no host CNPJ responde 404', async () => {
    const res = await read(ctx.app, CNPJ_HOST, cookieOf(CNPJ_HOST, sessions.company.token));
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
  });

  it('sem sessão no host CNPJ também responde 404 (o admin não se anuncia com 401)', async () => {
    const res = await read(ctx.app, CNPJ_HOST);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
  });

  it('sessão ADMIN de administrador da plataforma no host CNPJ responde 200', async () => {
    const res = await read(ctx.app, CNPJ_HOST, cookieOf(CNPJ_HOST, sessions.admin.token));
    expect(res.status).toBe(200);
    expect(res.body.overview).toBeDefined();
    // E as demais rotas do back office também.
    for (const path of ['/api/admin/payments', '/api/admin/transactions', '/api/admin/disputes']) {
      const other = await call(ctx.app, CNPJ_HOST, 'get', path, { origin: null, xrw: null, ...cookieOf(CNPJ_HOST, sessions.admin.token) });
      expect(other.status, path).toBe(200);
    }
  });

  it('o bearer do administrador também passa (app nativo)', async () => {
    const res = await read(ctx.app, CNPJ_HOST, { bearer: sessions.admin.token });
    expect(res.status).toBe(200);
  });

  it('no host CPF responde 404, sem sessão e com sessão do CPF', async () => {
    for (const auth of [{}, cookieOf(CPF_HOST, sessions.person.token), { bearer: sessions.person.token }]) {
      const res = await read(ctx.app, CPF_HOST, auth);
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
    }
    // Escrita também.
    const post = await call(ctx.app, CPF_HOST, 'post', '/api/admin/disputes/x/review', { body: {}, ...cookieOf(CPF_HOST, sessions.person.token) });
    expect(post.status).toBe(404);
  });

  it('sessão ADMIN gravada para quem não é administrador é revogada e responde 404', async () => {
    const res = await read(ctx.app, CNPJ_HOST, cookieOf(CNPJ_HOST, sessions.forged.token));
    expect(res.status).toBe(404);
    expect(await ctx.prisma.session.count({ where: { id: sessions.forged.session.id } })).toBe(0);
  });

  it('o administrador não é aceito no host CPF (outra área), nem nas rotas do CPF', async () => {
    const res = await call(ctx.app, CPF_HOST, 'get', '/api/me', { origin: null, xrw: null, bearer: sessions.admin.token });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WRONG_AREA');
  });
});

describe.skipIf(!hasDb)('admin · modo de áreas, com ADMIN_HOST', () => {
  let ctx;
  let admin;
  let company;
  let sessions;

  beforeAll(async () => {
    ctx = await setupApp({ ...AREA_ENV, ADMIN_HOST });
    await resetDb(ctx.prisma);
    admin = await makeAccount(ctx.prisma, { accountType: 'PERSON', platformAdmin: true });
    company = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    sessions = {
      admin: await insertSession(ctx.prisma, ctx.config, { userId: admin.user.id, area: 'ADMIN' }),
      company: await insertSession(ctx.prisma, ctx.config, { userId: company.user.id, area: 'CNPJ' }),
    };
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('o host de admin atende o administrador, e a empresa não entra nele', async () => {
    expect((await read(ctx.app, ADMIN_HOST, cookieOf(ADMIN_HOST, sessions.admin.token))).status).toBe(200);
    const anonymous = await read(ctx.app, ADMIN_HOST);
    expect(anonymous.status).toBe(404);
    expect(anonymous.body).toEqual(NOT_FOUND);
    // A sessão de empresa não vale no host de admin (4a): 403 WRONG_AREA ao carregar a sessão, por cookie ou bearer.
    for (const auth of [cookieOf(ADMIN_HOST, sessions.company.token), { bearer: sessions.company.token }]) {
      const res = await read(ctx.app, ADMIN_HOST, auth);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('WRONG_AREA');
    }
  });

  it('o host CNPJ e o CPF não têm /api/admin: 404 sem sessão e com a sessão da própria área', async () => {
    for (const [host, auth] of [
      [CNPJ_HOST, {}],
      [CNPJ_HOST, cookieOf(CNPJ_HOST, sessions.company.token)],
      [CPF_HOST, {}],
    ]) {
      const res = await read(ctx.app, host, auth);
      expect(res.status, host).toBe(404);
      expect(res.body, host).toEqual(NOT_FOUND);
    }
  });

  it('o administrador não entra no host CNPJ quando existe ADMIN_HOST (403 ao carregar a sessão)', async () => {
    const res = await read(ctx.app, CNPJ_HOST, { bearer: sessions.admin.token });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WRONG_AREA');
  });

  it('o administrador roda as ações de administração no host de admin', async () => {
    const res = await call(ctx.app, ADMIN_HOST, 'get', '/api/actions', { origin: null, xrw: null, ...cookieOf(ADMIN_HOST, sessions.admin.token) });
    expect(res.status).toBe(200);
  });
});

describe.skipIf(!hasDb)('admin · modo legado, como antes das áreas', () => {
  let ctx;
  let sessions;

  beforeAll(async () => {
    ctx = await setupApp();
    await resetDb(ctx.prisma);
    const admin = await makeAccount(ctx.prisma, { accountType: 'PERSON', platformAdmin: true });
    const company = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    sessions = {
      admin: await insertSession(ctx.prisma, ctx.config, { userId: admin.user.id }),
      company: await insertSession(ctx.prisma, ctx.config, { userId: company.user.id }),
    };
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('sem sessão 401, empresa 403 e administrador 200, em qualquer host', async () => {
    for (const host of ['localhost:5173', 'x.up.railway.app', CPF_HOST]) {
      const cookie = (token) => ({ cookie: `ap_session=${token}` });
      expect((await read(ctx.app, host)).status, host).toBe(401);
      const company = await read(ctx.app, host, cookie(sessions.company.token));
      expect(company.status, host).toBe(403);
      expect(company.body.error.message).toBe('Acesso restrito à administração da plataforma.');
      expect((await read(ctx.app, host, cookie(sessions.admin.token))).status, host).toBe(200);
    }
  });
});
