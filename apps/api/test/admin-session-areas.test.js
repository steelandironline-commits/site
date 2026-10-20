import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { isAnyArea } from '@autopix/areas';
import { disconnectPrisma } from '@autopix/core';
import { mountsOf } from '../src/middleware/area.js';
import { setupApp, resetDb, hasDb } from './helpers.js';
import { AREA_ENV, ADMIN_HOST, CNPJ_HOST, DEV_COOKIE, call, insertSession, makeAccount } from './authAreaHelpers.js';

// 4c · item D. Sem ADMIN_HOST a administração vive no host CNPJ (Q6), e a sessão ADMIN era aceita
// em toda montagem do CNPJ como se fosse de cliente (feed social, transação de qualquer empresa em
// /api/pay). No host CNPJ, a sessão ADMIN só alcança as montagens que declaram a área ADMIN:
// /api/session, /api/auth, /api/me, /api/actions, /api/challenges e /api/admin.

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } };
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

describe.skipIf(!hasDb)('sessão ADMIN no host CNPJ, sem ADMIN_HOST', () => {
  let ctx;
  let mounts;
  let cookie; // sessão ADMIN
  let customerCookie;
  let transactionId;

  const as = (c, method, path, extra = {}) => call(ctx.app, CNPJ_HOST, method, path, { cookie: c, body: method === 'get' ? undefined : {}, ...extra });

  beforeAll(async () => {
    ctx = await setupApp({ ...AREA_ENV, DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
    mounts = mountsOf(ctx.app);
    const admin = await makeAccount(ctx.prisma, { accountType: 'PERSON', platformAdmin: true });
    const seller = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    cookie = `${DEV_COOKIE[CNPJ_HOST]}=${(await insertSession(ctx.prisma, ctx.config, { userId: admin.user.id, area: 'ADMIN' })).token}`;
    customerCookie = `${DEV_COOKIE[CNPJ_HOST]}=${(await insertSession(ctx.prisma, ctx.config, { userId: seller.user.id, area: 'CNPJ' })).token}`;
    const t = await ctx.services.transactions.create({ user: seller.user, company: seller.company, grossCents: 100000, description: 'Serviço de outra empresa' });
    transactionId = t.id;
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('feed social e Pagamentos respondem 404 à sessão ADMIN, inclusive a transação de outra empresa', async () => {
    for (const path of ['/api/social/posts', '/api/pay/summary', `/api/pay/transactions/${transactionId}`, '/api/pay/transactions']) {
      const res = await as(cookie, 'get', path, { origin: null, xrw: null });
      expect(res.status, path).toBe(404);
      expect(res.body, path).toEqual(NOT_FOUND);
    }
    // A mesma rota responde à sessão de cliente.
    expect((await as(customerCookie, 'get', '/api/social/posts', { origin: null, xrw: null })).status).toBe(200);
    expect((await as(customerCookie, 'get', `/api/pay/transactions/${transactionId}`, { origin: null, xrw: null })).status).toBe(200);
  });

  it('toda montagem sem a área ADMIN responde 404 neutro à sessão ADMIN, em todo método', async () => {
    const closed = mounts.filter((m) => !isAnyArea(m.areas) && !m.areas.includes('ADMIN'));
    expect(closed.map((m) => m.path)).toEqual(expect.arrayContaining(['/api/social', '/api/pay', '/api/company', '/api/dashboard', '/api/activity', '/api/onboarding']));
    const leaks = [];
    for (const mount of closed) {
      for (const method of METHODS) {
        for (const sub of ['', '/qualquer']) {
          const res = await as(cookie, method, `${mount.path}${sub}`);
          if (res.status !== 404 || JSON.stringify(res.body) !== JSON.stringify(NOT_FOUND)) leaks.push(`${method.toUpperCase()} ${mount.path}${sub} -> ${res.status}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it('as seis montagens da administração continuam abertas à sessão ADMIN', async () => {
    expect(mounts.filter((m) => m.areas.includes('ADMIN')).map((m) => m.path).sort()).toEqual(['/api/actions', '/api/admin', '/api/auth', '/api/challenges', '/api/me', '/api/session']);
    const ok = async (path) => (await as(cookie, 'get', path, { origin: null, xrw: null })).status;
    expect(await ok('/api/session')).toBe(200);
    expect(await ok('/api/me')).toBe(200);
    expect(await ok('/api/actions')).toBe(200);
    expect(await ok('/api/admin/overview')).toBe(200);
  });

  it('a infraestrutura e quem não tem sessão ADMIN não mudam', async () => {
    expect((await call(ctx.app, CNPJ_HOST, 'get', '/api/health', { cookie, origin: null, xrw: null })).status).toBe(200);
    expect((await call(ctx.app, CNPJ_HOST, 'get', '/api/pay/summary', { origin: null, xrw: null })).status).toBe(401);
    expect((await as(customerCookie, 'get', '/api/pay/summary', { origin: null, xrw: null })).status).toBe(200);
    // O cliente continua sem a administração.
    expect((await as(customerCookie, 'get', '/api/admin/overview', { origin: null, xrw: null })).status).toBe(404);
  });
});

describe.skipIf(!hasDb)('sessão ADMIN no host de admin, com ADMIN_HOST', () => {
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

  it('o host de admin segue servindo as suas montagens à sessão ADMIN', async () => {
    for (const path of ['/api/session', '/api/me', '/api/actions', '/api/admin/overview']) {
      const res = await call(ctx.app, ADMIN_HOST, 'get', path, { cookie, origin: null, xrw: null });
      expect(res.status, path).toBe(200);
    }
  });
});
