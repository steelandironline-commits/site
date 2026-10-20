import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { disconnectPrisma } from '@autopix/core';
import { setupApp, resetDb, hasDb, testCpf } from './helpers.js';
import { AREA_ENV, CNPJ_HOST, DEV_COOKIE, call, insertSession, makeAccount } from './authAreaHelpers.js';

// 4c · item G. O convite de colaborador responde "este e-mail/CPF já tem cadastro", então serve para
// sondar contas (inclusive as da outra área, por causa da unicidade global, Q2). Ele passa a usar o
// mesmo limitador do onboarding/check (30 pedidos em 15 minutos), em /api/team e em
// /api/actions/INVITE_COLLABORATOR.

const LIMIT = 30;

describe.skipIf(!hasDb)('convite de colaborador · mesmo limitador do onboarding/check', () => {
  let owner;
  let cookie;
  let ctx;

  const invite = (via) =>
    via === 'team'
      ? call(ctx.app, CNPJ_HOST, 'post', '/api/team', { cookie, body: { name: 'Sondagem', email: owner.email, cpf: testCpf() } })
      : call(ctx.app, CNPJ_HOST, 'post', '/api/actions/INVITE_COLLABORATOR', { cookie, body: { input: { name: 'Sondagem', email: owner.email, cpf: testCpf() } } });

  /** Um app novo por teste: o limitador é criado junto com o app, então cada teste começa do zero. */
  async function freshApp() {
    process.env.TEST_RATE_LIMIT = '1';
    ctx = await setupApp({ ...AREA_ENV, DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
    owner = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    cookie = `${DEV_COOKIE[CNPJ_HOST]}=${(await insertSession(ctx.prisma, ctx.config, { userId: owner.user.id, area: 'CNPJ' })).token}`;
  }

  afterAll(async () => {
    delete process.env.TEST_RATE_LIMIT;
    await disconnectPrisma();
  });

  it('o e-mail que já tem cadastro continua dando 409; depois de 30 pedidos o limitador responde 429', async () => {
    await freshApp();
    const first = await invite('team');
    expect(first.status).toBe(409);
    expect(first.body.error.message).toMatch(/e-mail/);
    for (let i = 1; i < LIMIT; i += 1) expect((await invite('team')).status).not.toBe(429);
    const blocked = await invite('team');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatchObject({ code: 'RATE_LIMITED', message: 'Muitas verificações. Aguarde alguns minutos.' });
  });

  it('o mesmo vale pela ação, e a ação não é um caminho para fugir do limite', async () => {
    await freshApp();
    for (let i = 0; i < LIMIT; i += 1) expect((await invite('action')).status).not.toBe(429);
    expect((await invite('action')).status).toBe(429);
    // A rota e a ação dividem o mesmo contador.
    expect((await invite('team')).status).toBe(429);
  });

  it('o limitador é o do onboarding/check: o contador é um só', async () => {
    await freshApp();
    // 29 verificações de cadastro (CPF) e 1 convite esgotam o limite; o convite seguinte é barrado.
    for (let i = 0; i < LIMIT - 1; i += 1) {
      const res = await call(ctx.app, CNPJ_HOST, 'post', '/api/onboarding/check', { body: { accountType: 'COMPANY', email: `x${i}@area.example`, document: '11222333000181' } });
      expect(res.status).toBe(200);
    }
    expect((await invite('team')).status).toBe(409);
    expect((await invite('team')).status).toBe(429);
  });

  it('outras ações da mesma sessão não entram nessa conta', async () => {
    await freshApp();
    for (let i = 0; i < LIMIT + 5; i += 1) {
      const res = await call(ctx.app, CNPJ_HOST, 'post', '/api/actions/LIST_TODAY_OPPORTUNITIES', { cookie, body: { input: {} } });
      expect(res.status).toBe(200);
    }
  });
});
