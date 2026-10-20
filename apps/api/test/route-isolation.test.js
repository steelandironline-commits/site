import { it, expect, beforeAll, afterAll } from 'vitest';
import { isAnyArea } from '@autopix/areas';
import { disconnectPrisma } from '@autopix/core';
import { mountsOf } from '../src/middleware/area.js';
import { setupApp, resetDb } from './helpers.js';
import { AREA_ENV, ADMIN_HOST, CNPJ_HOST, CPF_HOST, DEV_COOKIE, call, insertSession, makeAccount } from './authAreaHelpers.js';
import { describeDb, foreignTo, leaks } from './isolation/support.js';

// 4b · isolamento de rota. A lista de montagens vem do próprio app (mountsOf), não de uma
// lista escrita à mão: rota nova entra no teste sozinha. Em cada host, toda montagem que não
// declara a área daquele host responde 404 ANTES de autenticar, com ou sem sessão. Os auxiliares
// (foreignTo, leaks, describeDb) são os da suíte de isolamento (isolation/support.js), a mesma que `npm run test:isolation` roda:
// sem banco de teste o grupo aparece como PULADO com o motivo (e falha no CI), em vez de falhar na preparação.

const HOST_OF = { CNPJ: CNPJ_HOST, CPF: CPF_HOST, ADMIN: ADMIN_HOST };

describeDb('isolamento de rota · modo de áreas, admin dentro do host CNPJ', () => {
  let ctx;
  let mounts;
  let cnpj;
  let cpf;
  let admin;
  let cnpjSession;
  let cpfSession;
  let adminSession;

  beforeAll(async () => {
    ctx = await setupApp(AREA_ENV);
    await resetDb(ctx.prisma);
    mounts = mountsOf(ctx.app);
    cnpj = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    cpf = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    admin = await makeAccount(ctx.prisma, { accountType: 'PERSON', platformAdmin: true });
    cnpjSession = await insertSession(ctx.prisma, ctx.config, { userId: cnpj.user.id, area: 'CNPJ' });
    cpfSession = await insertSession(ctx.prisma, ctx.config, { userId: cpf.user.id, area: 'CPF' });
    adminSession = await insertSession(ctx.prisma, ctx.config, { userId: admin.user.id, area: 'ADMIN' });
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('a lista de montagens vem do app e tem montagens só do CNPJ', () => {
    expect(mounts.length).toBeGreaterThan(25);
    expect(foreignTo(mounts, 'CPF').length).toBeGreaterThan(10);
    expect(foreignTo(mounts, 'CPF').map((m) => m.path)).toEqual(expect.arrayContaining(['/api/company', '/api/pay', '/api/team', '/api/payments', '/api/intermediation', '/api/admin']));
  });

  it('do host CPF, toda rota só do CNPJ responde 404, sem sessão', async () => {
    expect(await leaks(ctx.app, CPF_HOST, foreignTo(mounts, 'CPF'))).toEqual([]);
  });

  it('do host CPF, toda rota só do CNPJ responde 404, com sessão do CPF (cookie)', async () => {
    const cookie = `${DEV_COOKIE[CPF_HOST]}=${cpfSession.token}`;
    expect(await leaks(ctx.app, CPF_HOST, foreignTo(mounts, 'CPF'), { cookie })).toEqual([]);
  });

  it('do host CPF, toda rota só do CNPJ responde 404, com sessão do CPF (bearer)', async () => {
    expect(await leaks(ctx.app, CPF_HOST, foreignTo(mounts, 'CPF'), { bearer: cpfSession.token })).toEqual([]);
  });

  it('do host CNPJ, toda rota só do CPF responde 404 (hoje só /api/profile; a lista é a do app)', async () => {
    const foreign = foreignTo(mounts, 'CNPJ');
    expect(foreign.map((m) => m.path)).toEqual(['/api/profile']); // /api/session, /api/auth, etc. existem no CNPJ
    for (const auth of [{}, { cookie: `${DEV_COOKIE[CNPJ_HOST]}=${cnpjSession.token}` }, { cookie: `${DEV_COOKIE[CNPJ_HOST]}=${adminSession.token}` }]) {
      expect(await leaks(ctx.app, CNPJ_HOST, foreign, auth)).toEqual([]);
    }
  });

  it('o 404 vale para a rota que o host não tem e é igual ao de uma rota que não existe', async () => {
    const unknown = await call(ctx.app, CPF_HOST, 'get', '/api/nao-existe');
    const foreign = await call(ctx.app, CPF_HOST, 'get', '/api/company');
    expect(foreign.status).toBe(unknown.status);
    expect(foreign.body).toEqual(unknown.body);
    expect(foreign.headers['content-type']).toBe(unknown.headers['content-type']);
  });

  it('as montagens do host respondem normalmente (a guarda não bloqueia a área certa)', async () => {
    const cases = [
      [CNPJ_HOST, '/api/company', 401],
      [CNPJ_HOST, '/api/social/posts', 401],
      [CNPJ_HOST, '/api/pay/summary', 401],
      [CPF_HOST, '/api/social/posts', 401],
      [CPF_HOST, '/api/profile', 401],
      [CPF_HOST, '/api/dashboard', 401],
      [CPF_HOST, '/api/activity', 401],
      [CPF_HOST, '/api/events', 401],
      [CPF_HOST, '/api/actions', 401],
      [CPF_HOST, '/api/onboarding', 401],
      [CNPJ_HOST, '/api/session', 200],
      [CPF_HOST, '/api/session', 200],
      [CNPJ_HOST, '/api/health', 200],
      [CPF_HOST, '/api/health', 200],
      [CPF_HOST, '/api/config', 200],
    ];
    for (const [host, path, status] of cases) {
      const res = await call(ctx.app, host, 'get', path, { origin: null, xrw: null });
      expect(res.status, `${host}${path}`).toBe(status);
    }
  });

  it('a infraestrutura responde em qualquer host, inclusive host desconhecido', async () => {
    for (const host of [CNPJ_HOST, CPF_HOST, 'x.up.railway.app', 'temcpf.com.br']) {
      expect((await call(ctx.app, host, 'get', '/api/health', { origin: null, xrw: null })).status, host).toBe(200);
      expect((await call(ctx.app, host, 'get', '/api/webhooks/whatsapp', { origin: null, xrw: null })).status, host).toBe(403);
    }
  });
});

describeDb('isolamento de rota · modo de áreas, com ADMIN_HOST', () => {
  let ctx;
  let mounts;
  let adminSession;
  let cnpjSession;

  beforeAll(async () => {
    ctx = await setupApp({ ...AREA_ENV, ADMIN_HOST });
    await resetDb(ctx.prisma);
    mounts = mountsOf(ctx.app);
    const admin = await makeAccount(ctx.prisma, { accountType: 'PERSON', platformAdmin: true });
    const cnpj = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    adminSession = await insertSession(ctx.prisma, ctx.config, { userId: admin.user.id, area: 'ADMIN' });
    cnpjSession = await insertSession(ctx.prisma, ctx.config, { userId: cnpj.user.id, area: 'CNPJ' });
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('/api/admin só existe no host de admin', () => {
    const admin = mounts.find((m) => m.path === '/api/admin');
    expect(admin.areas).toEqual(['ADMIN']);
  });

  it('no host de admin, só as montagens de conta, de ação e de administração existem', async () => {
    const own = mounts.filter((m) => isAnyArea(m.areas) || m.areas.includes('ADMIN')).map((m) => m.path);
    expect(own.sort()).toEqual(['/api/actions', '/api/admin', '/api/auth', '/api/challenges', '/api/health', '/api/me', '/api/session', '/api/webhooks', '/api/webhooks'].sort());
    const cookie = `${DEV_COOKIE[ADMIN_HOST]}=${adminSession.token}`;
    for (const auth of [{}, { cookie }]) {
      expect(await leaks(ctx.app, ADMIN_HOST, foreignTo(mounts, 'ADMIN'), auth)).toEqual([]);
    }
  });

  it('no host CNPJ e no CPF, /api/admin responde 404 também com a sessão certa de cada um', async () => {
    const admin = mounts.filter((m) => m.path === '/api/admin');
    expect(await leaks(ctx.app, CNPJ_HOST, admin)).toEqual([]);
    expect(await leaks(ctx.app, CNPJ_HOST, admin, { cookie: `${DEV_COOKIE[CNPJ_HOST]}=${cnpjSession.token}` })).toEqual([]);
    expect(await leaks(ctx.app, CPF_HOST, admin)).toEqual([]);
  });

  it('cada host de área só tem as suas montagens', async () => {
    for (const area of ['CNPJ', 'CPF']) {
      expect(await leaks(ctx.app, HOST_OF[area], foreignTo(mounts, area))).toEqual([]);
    }
  });
});
