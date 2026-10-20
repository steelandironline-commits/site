import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isAnyArea } from '@autopix/areas';
import { disconnectPrisma } from '@autopix/core';
import { mountsOf } from '../../src/middleware/area.js';
import { areaApp } from '../areaHelpers.js';
import { setupApp, resetDb, STRONG_PASSWORD, testCpf } from '../helpers.js';
import { AREA_ENV, CNPJ_HOST, CPF_HOST, DEV_COOKIE, call, cookieValue, insertSession, makeAccount, setCookieOf } from '../authAreaHelpers.js';
import { describeDb, nonEmpty } from './support.js';

// ISOLAMENTO · item c (PLANO_DIVISAO, ETAPA 7, item 1): token com área CPF é rejeitado na API do CNPJ,
// e o contrário. O token é opaco (32 bytes aleatórios); a área é a coluna Session.area, gravada no
// banco, que o cliente não altera. A regra é host == sessão == dono: a sessão só vale se a área dela
// for aceita pelo host E for a área do dono (a empresa do usuário, ou ADMIN para o admin da plataforma).
//
// 1. a tabela inteira (host x área da sessão x dono), no cookie e no bearer;
// 2. tokens de verdade (login de verdade) postos em toda montagem do outro host;
// 3. a área vem do banco: mudá-la lá muda a decisão, e a sessão de cadastro também não atravessa.

const HOSTS = [CNPJ_HOST, CPF_HOST];
const MOUNTS = nonEmpty('montagens do app.js (mountsOf)', mountsOf(areaApp(AREA_ENV).app));
const GUARDED = nonEmpty('montagens com área', MOUNTS.filter((m) => !isAnyArea(m.areas)));

/**
 * A tabela. Escrita por extenso de propósito: se fosse calculada pelas mesmas funções do servidor,
 * o teste concordaria com qualquer erro delas. Sem ADMIN_HOST, o admin entra pelo host CNPJ.
 * O servidor confere primeiro a sessão contra o dono, depois o host contra a sessão:
 *   401  a área gravada na sessão não é a área do dono: sessão forjada ou velha, é REVOGADA (linha apagada), em qualquer host
 *   403  a sessão é do dono, mas o host não aceita a área dela: WRONG_AREA, a linha fica
 *   200  host, sessão e dono concordam
 */
const TABLE = [
  // host CNPJ aceita as áreas CNPJ e ADMIN
  { host: CNPJ_HOST, sessionArea: 'CNPJ', owner: 'COMPANY', expect: 200 },
  { host: CNPJ_HOST, sessionArea: 'CNPJ', owner: 'PERSON', expect: 401 },
  { host: CNPJ_HOST, sessionArea: 'CNPJ', owner: 'ADMIN', expect: 401 },
  { host: CNPJ_HOST, sessionArea: 'ADMIN', owner: 'ADMIN', expect: 200 },
  { host: CNPJ_HOST, sessionArea: 'ADMIN', owner: 'COMPANY', expect: 401 },
  { host: CNPJ_HOST, sessionArea: 'ADMIN', owner: 'PERSON', expect: 401 },
  { host: CNPJ_HOST, sessionArea: 'CPF', owner: 'PERSON', expect: 403 },
  { host: CNPJ_HOST, sessionArea: 'CPF', owner: 'COMPANY', expect: 401 },
  { host: CNPJ_HOST, sessionArea: 'CPF', owner: 'ADMIN', expect: 401 },
  // host CPF aceita só a área CPF
  { host: CPF_HOST, sessionArea: 'CPF', owner: 'PERSON', expect: 200 },
  { host: CPF_HOST, sessionArea: 'CPF', owner: 'COMPANY', expect: 401 },
  { host: CPF_HOST, sessionArea: 'CPF', owner: 'ADMIN', expect: 401 },
  { host: CPF_HOST, sessionArea: 'CNPJ', owner: 'COMPANY', expect: 403 },
  { host: CPF_HOST, sessionArea: 'CNPJ', owner: 'PERSON', expect: 401 },
  { host: CPF_HOST, sessionArea: 'CNPJ', owner: 'ADMIN', expect: 401 },
  { host: CPF_HOST, sessionArea: 'ADMIN', owner: 'ADMIN', expect: 403 },
  { host: CPF_HOST, sessionArea: 'ADMIN', owner: 'COMPANY', expect: 401 },
  { host: CPF_HOST, sessionArea: 'ADMIN', owner: 'PERSON', expect: 401 },
];

describeDb('c · token com área gravada no banco · host == sessão == dono', () => {
  let ctx;
  let owner;

  beforeAll(async () => {
    ctx = await setupApp(AREA_ENV);
    await resetDb(ctx.prisma);
    owner = {
      COMPANY: await makeAccount(ctx.prisma, { accountType: 'COMPANY' }),
      PERSON: await makeAccount(ctx.prisma, { accountType: 'PERSON' }),
      ADMIN: await makeAccount(ctx.prisma, { accountType: 'PERSON', platformAdmin: true }),
    };
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  const me = (host, auth) => call(ctx.app, host, 'get', '/api/me', { origin: null, xrw: null, ...auth });
  const asCookie = (host, token) => ({ cookie: `${DEV_COOKIE[host]}=${token}` });
  const asBearer = (token) => ({ bearer: token });

  it('a tabela cobre os dois hosts, as três áreas de sessão e os três tipos de dono', () => {
    expect(TABLE.length).toBe(2 * 3 * 3);
    expect(new Set(TABLE.map((row) => `${row.host}|${row.sessionArea}|${row.owner}`)).size).toBe(TABLE.length);
    // Só as combinações em que as três coisas concordam valem.
    expect(TABLE.filter((row) => row.expect === 200).map((row) => `${row.host}|${row.sessionArea}|${row.owner}`).sort()).toEqual([`${CNPJ_HOST}|ADMIN|ADMIN`, `${CNPJ_HOST}|CNPJ|COMPANY`, `${CPF_HOST}|CPF|PERSON`].sort());
  });

  for (const row of TABLE) {
    for (const via of ['cookie', 'bearer']) {
      it(`${row.host} · sessão ${row.sessionArea} de dono ${row.owner} · ${via} -> ${row.expect}${row.expect === 403 ? ' WRONG_AREA' : ''}`, async () => {
        const { token, session } = await insertSession(ctx.prisma, ctx.config, { userId: owner[row.owner].user.id, area: row.sessionArea });
        const res = await me(row.host, via === 'cookie' ? asCookie(row.host, token) : asBearer(token));
        expect(res.status).toBe(row.expect);
        if (row.expect === 200) {
          expect(res.body.user.id).toBe(owner[row.owner].user.id);
          expect(res.body.area).toBe(row.sessionArea);
        } else {
          expect(res.body.user).toBeUndefined();
          // A recusa não diz de qual área é a conta nem que ela existe em outro lugar.
          expect(JSON.stringify(res.body)).not.toMatch(/CNPJ|CPF|empresa|pessoa|jur[ií]dica|f[ií]sica/i);
        }
        if (row.expect === 403) expect(res.body.error.code).toBe('WRONG_AREA');
        const stored = await ctx.prisma.session.findUnique({ where: { id: session.id } });
        // 401 revoga (a sessão era forjada ou velha); 403 e 200 deixam a linha como estava.
        expect(stored === null).toBe(row.expect === 401);
      });
    }
  }

  // ---- tokens de verdade, em toda montagem do outro host --------------------------------------
  describe('um token de verdade da outra área é recusado em toda montagem', () => {
    const tokens = {};
    beforeAll(async () => {
      for (const [host, who] of [[CNPJ_HOST, 'COMPANY'], [CPF_HOST, 'PERSON']]) {
        const native = await call(ctx.app, host, 'post', '/api/auth/native/login', { body: { identifier: owner[who].document, password: STRONG_PASSWORD } });
        expect(native.status, `native/login em ${host}`).toBe(200);
        const web = await call(ctx.app, host, 'post', '/api/auth/login', { body: { identifier: owner[who].document, password: STRONG_PASSWORD } });
        tokens[host] = { bearer: native.body.token, cookie: cookieValue(setCookieOf(web, DEV_COOKIE[host])) };
      }
    });

    it('os tokens de verdade existem e valem no próprio host (controle positivo)', async () => {
      for (const host of HOSTS) {
        expect((await me(host, asBearer(tokens[host].bearer))).status, host).toBe(200);
        expect((await me(host, asCookie(host, tokens[host].cookie))).status, host).toBe(200);
      }
    });

    for (const host of HOSTS) {
      const foreignHost = host === CNPJ_HOST ? CPF_HOST : CNPJ_HOST;
      for (const mount of GUARDED) {
        it(`${host} · ${mount.path} · token ${foreignHost === CPF_HOST ? 'CPF' : 'CNPJ'} (bearer e cookie) responde 403 WRONG_AREA`, async () => {
          for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
            const body = method === 'get' ? undefined : {};
            const viaBearer = await call(ctx.app, host, method, mount.path, { body, bearer: tokens[foreignHost].bearer });
            expect({ status: viaBearer.status, code: viaBearer.body?.error?.code }, `bearer ${method.toUpperCase()} ${host}${mount.path}`).toEqual({ status: 403, code: 'WRONG_AREA' });
            const viaCookie = await call(ctx.app, host, method, mount.path, { body, cookie: `${DEV_COOKIE[host]}=${tokens[foreignHost].cookie}` });
            expect({ status: viaCookie.status, code: viaCookie.body?.error?.code }, `cookie ${method.toUpperCase()} ${host}${mount.path}`).toEqual({ status: 403, code: 'WRONG_AREA' });
          }
        });
      }
    }
  });

  // ---- a área vem do banco --------------------------------------------------------------------
  describe('a área é a gravada no banco, não a que o pedido diz', () => {
    it('mudar Session.area no banco muda a decisão: a área gravada tem de ser a do dono, senão a sessão é revogada', async () => {
      const login = await call(ctx.app, CPF_HOST, 'post', '/api/auth/native/login', { body: { identifier: owner.PERSON.document, password: STRONG_PASSWORD } });
      const token = login.body.token;
      expect((await me(CPF_HOST, asBearer(token))).status).toBe(200);
      const row = await ctx.prisma.session.findFirst({ where: { userId: owner.PERSON.user.id, area: 'CPF' }, orderBy: { createdAt: 'desc' } });
      await ctx.prisma.session.update({ where: { id: row.id }, data: { area: 'CNPJ' } });
      // Com a área trocada, nem o host que antes aceitava (CPF) nem o que passou a aceitar (CNPJ) a honram.
      expect((await me(CNPJ_HOST, asBearer(token))).status).toBe(401);
      expect(await ctx.prisma.session.findUnique({ where: { id: row.id } })).toBeNull();
      expect((await me(CPF_HOST, asBearer(token))).status).toBe(401);
    });

    it('o dono que muda de área derruba a sessão: a área gravada na sessão não basta', async () => {
      const company = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
      const { token, session } = await insertSession(ctx.prisma, ctx.config, { userId: company.user.id, area: 'CNPJ' });
      expect((await me(CNPJ_HOST, asBearer(token))).status).toBe(200);
      await ctx.prisma.company.update({ where: { id: company.company.id }, data: { accountType: 'PERSON' } });
      expect((await me(CNPJ_HOST, asBearer(token))).status).toBe(401);
      expect(await ctx.prisma.session.findUnique({ where: { id: session.id } })).toBeNull();
    });

    it('a sessão de cadastro aberta num host não vale no outro, nem no cookie nem no bearer', async () => {
      const start = await call(ctx.app, CPF_HOST, 'post', '/api/onboarding/start', {
        body: { accountType: 'PERSON', name: 'João Pereira', email: `joao-${Date.now()}@area.example`, document: testCpf() },
      });
      expect(start.status).toBe(201);
      const token = cookieValue(setCookieOf(start, DEV_COOKIE[CPF_HOST]));
      expect((await me(CPF_HOST, asBearer(token))).status).toBe(200);
      for (const auth of [asBearer(token), asCookie(CNPJ_HOST, token)]) {
        const res = await me(CNPJ_HOST, auth);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('WRONG_AREA');
      }
    });

    it('um Host forjado não dá acesso: a sessão CPF decide pela área gravada, no host que o pedido disser', async () => {
      const { token } = await insertSession(ctx.prisma, ctx.config, { userId: owner.PERSON.user.id, area: 'CPF' });
      // Pedido ao app com o host do CNPJ mas o cookie e o token do CPF: recusado.
      const res = await call(ctx.app, CNPJ_HOST, 'get', '/api/me', { origin: null, xrw: null, cookie: `${DEV_COOKIE[CPF_HOST]}=${token}`, bearer: token });
      expect(res.status).toBe(403);
      // E o host do CPF com o token do CNPJ.
      const { token: cnpjToken } = await insertSession(ctx.prisma, ctx.config, { userId: owner.COMPANY.user.id, area: 'CNPJ' });
      expect((await call(ctx.app, CPF_HOST, 'get', '/api/me', { origin: null, xrw: null, bearer: cnpjToken })).status).toBe(403);
    });
  });
});
