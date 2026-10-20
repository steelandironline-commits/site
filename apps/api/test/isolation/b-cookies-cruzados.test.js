import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isAnyArea } from '@autopix/areas';
import { disconnectPrisma } from '@autopix/core';
import { mountsOf } from '../../src/middleware/area.js';
import { PRODUCTION_ENV, areaApp } from '../areaHelpers.js';
import { setupApp, resetDb } from '../helpers.js';
import { AREA_ENV, CNPJ_HOST, CPF_HOST, DEV_COOKIE, call, cookiePair, cookieValue, makeAccount, setCookieOf } from '../authAreaHelpers.js';
import { describeDb, nonEmpty, ownTo } from './support.js';

// ISOLAMENTO · item b (PLANO_DIVISAO, ETAPA 7, item 1): o cookie de uma área não autentica na outra,
// nos dois sentidos. Cada cookie nasce de um login de verdade no host da sua área (nunca é montado
// à mão), e o resultado é conferido em TODA montagem que o host tem, pela lista do próprio app.js.
//
// A prova é diferencial: com o cookie estrangeiro, cada rota responde igual a quem não mandou cookie
// nenhum. Assim a suíte não precisa saber quais rotas exigem login. O controle positivo (o cookie
// da própria área muda a resposta de /api/me) impede que o teste passe por não provar nada.

const OTHER = { [CNPJ_HOST]: CPF_HOST, [CPF_HOST]: CNPJ_HOST };
const MOUNTS = nonEmpty('montagens do app.js (mountsOf)', mountsOf(areaApp(AREA_ENV).app));
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const SUBPATHS = ['', '/1'];

/** Status e corpo, sem o que varia de uma chamada para outra. */
const outcome = (res) => ({ status: res.status, body: res.body, setCookie: res.headers['set-cookie'] });

function identityOf(account) {
  return [account.email, account.user.id, account.company.id, account.user.name, account.document].map(String);
}

describeDb('b · cookie de uma área não autentica na outra · desenvolvimento (http)', () => {
  let ctx;
  let accounts; // por host
  let cookies; // por host: { pair, token }

  beforeAll(async () => {
    ctx = await setupApp(AREA_ENV);
    await resetDb(ctx.prisma);
    accounts = { [CNPJ_HOST]: await makeAccount(ctx.prisma, { accountType: 'COMPANY' }), [CPF_HOST]: await makeAccount(ctx.prisma, { accountType: 'PERSON' }) };
    cookies = {};
    for (const host of [CNPJ_HOST, CPF_HOST]) {
      const login = await call(ctx.app, host, 'post', '/api/auth/login', { body: { email: accounts[host].email, password: accounts[host].password } });
      expect(login.status, `login em ${host}`).toBe(200);
      const header = setCookieOf(login, DEV_COOKIE[host]);
      expect(header, `Set-Cookie ${DEV_COOKIE[host]} em ${host}`).toBeDefined();
      cookies[host] = { pair: cookiePair(header), token: cookieValue(header) };
    }
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  const bare = (host) => ({ origin: `http://${host}`, xrw: 'autopix' });

  it('a lista de montagens vem do app e cada host tem as suas', () => {
    expect(MOUNTS.length).toBeGreaterThan(25);
    for (const host of [CNPJ_HOST, CPF_HOST]) {
      const area = host === CNPJ_HOST ? 'CNPJ' : 'CPF';
      expect(ownTo(MOUNTS, area).filter((m) => !isAnyArea(m.areas)).length, host).toBeGreaterThan(10);
    }
  });

  it('controle positivo: o cookie da própria área autentica; o da outra, no mesmo host, não', async () => {
    for (const host of [CNPJ_HOST, CPF_HOST]) {
      const own = await call(ctx.app, host, 'get', '/api/me', { cookie: cookies[host].pair, origin: null, xrw: null });
      expect(own.status, host).toBe(200);
      expect(own.body.user.id).toBe(accounts[host].user.id);
      const foreign = await call(ctx.app, host, 'get', '/api/me', { cookie: cookies[OTHER[host]].pair, origin: null, xrw: null });
      expect(foreign.status, host).toBe(401);
      expect(JSON.stringify(foreign.body)).not.toContain(accounts[OTHER[host]].user.id);
    }
  });

  for (const host of [CPF_HOST, CNPJ_HOST]) {
    const area = host === CNPJ_HOST ? 'CNPJ' : 'CPF';
    const foreignHost = OTHER[host];
    const own = nonEmpty(`montagens do host ${host}`, ownTo(MOUNTS, area).filter((m) => !isAnyArea(m.areas)));

    for (const mount of own) {
      it(`${host} · ${mount.path} · o cookie ${DEV_COOKIE[foreignHost]} do outro host responde igual a nenhum cookie`, async () => {
        for (const method of METHODS) {
          for (const sub of SUBPATHS) {
            const url = `${mount.path}${sub}`;
            const body = method === 'get' ? undefined : {};
            const none = outcome(await call(ctx.app, host, method, url, { ...bare(host), body }));
            const crossed = outcome(await call(ctx.app, host, method, url, { ...bare(host), body, cookie: cookies[foreignHost].pair }));
            expect(crossed, `${method.toUpperCase()} ${host}${url}`).toEqual(none);
          }
        }
      });

      it(`${host} · ${mount.path} · o token da outra área posto no cookie deste host responde 403 WRONG_AREA`, async () => {
        const identity = identityOf(accounts[foreignHost]);
        const relabeled = `${DEV_COOKIE[host]}=${cookies[foreignHost].token}`;
        for (const method of METHODS) {
          for (const sub of SUBPATHS) {
            const url = `${mount.path}${sub}`;
            const res = await call(ctx.app, host, method, url, { ...bare(host), body: method === 'get' ? undefined : {}, cookie: relabeled });
            expect({ status: res.status, code: res.body?.error?.code }, `${method.toUpperCase()} ${host}${url}`).toEqual({ status: 403, code: 'WRONG_AREA' });
            for (const secret of identity) expect(JSON.stringify(res.body), `${method.toUpperCase()} ${host}${url}`).not.toContain(secret);
          }
        }
      });
    }

    it(`${host} · com os dois cookies juntos, cada host lê só o da própria área`, async () => {
      const both = `${cookies[CNPJ_HOST].pair}; ${cookies[CPF_HOST].pair}`;
      const res = await call(ctx.app, host, 'get', '/api/me', { cookie: both, origin: null, xrw: null });
      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(accounts[host].user.id);
    });
  }
});

// Produção: __Host-ap_session (CNPJ) e __Host-ap_session_cpf (CPF). Aqui entra o "cookie tossing": um
// subdomínio que grave um cookie para o host vizinho. Poucos pedidos, porque o limitador de produção vale.
describeDb('b · cookie de uma área não autentica na outra · produção (https, __Host-)', () => {
  let ctx;
  let accounts;
  let sessions; // por host: { name, token }

  beforeAll(async () => {
    ctx = await setupApp({ ...PRODUCTION_ENV, DATABASE_URL: process.env.DATABASE_URL, ...AREA_ENV });
    await resetDb(ctx.prisma);
    accounts = { [CNPJ_HOST]: await makeAccount(ctx.prisma, { accountType: 'COMPANY' }), [CPF_HOST]: await makeAccount(ctx.prisma, { accountType: 'PERSON' }) };
    sessions = {};
    for (const [host, name] of [[CNPJ_HOST, '__Host-ap_session'], [CPF_HOST, '__Host-ap_session_cpf']]) {
      const login = await call(ctx.app, host, 'post', '/api/auth/login', { body: { email: accounts[host].email, password: accounts[host].password }, origin: `https://${host}` });
      expect(login.status, `login em ${host}`).toBe(200);
      const header = setCookieOf(login, name);
      expect(header, `Set-Cookie ${name}`).toBeDefined();
      expect(header).not.toMatch(/Domain=/i);
      expect(header).toMatch(/; Secure/i);
      sessions[host] = { name, token: cookieValue(header) };
    }
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  const me = (host, cookie) => call(ctx.app, host, 'get', '/api/me', { cookie, origin: null, xrw: null });

  it('cada área usa um nome de cookie próprio, e o do CPF não é o do CNPJ', () => {
    expect(sessions[CNPJ_HOST].name).not.toBe(sessions[CPF_HOST].name);
    expect(sessions[CNPJ_HOST].token).not.toBe(sessions[CPF_HOST].token);
  });

  it('cada cookie autentica no próprio host e só nele', async () => {
    for (const host of [CNPJ_HOST, CPF_HOST]) {
      const own = await me(host, `${sessions[host].name}=${sessions[host].token}`);
      expect(own.status, host).toBe(200);
      expect(own.body.user.id).toBe(accounts[host].user.id);
      // O navegador nunca mandaria o cookie do outro host; se mandasse (nome e valor), ninguém o lê.
      const other = sessions[OTHER[host]];
      expect((await me(host, `${other.name}=${other.token}`)).status, host).toBe(401);
    }
  });

  it('cookie tossing: o token da outra área escrito com o nome do cookie deste host responde 403', async () => {
    for (const host of [CNPJ_HOST, CPF_HOST]) {
      const res = await me(host, `${sessions[host].name}=${sessions[OTHER[host]].token}`);
      expect(res.status, host).toBe(403);
      expect(res.body.error.code).toBe('WRONG_AREA');
    }
  });

  it('cookie tossing: o nome sem __Host- (o de desenvolvimento) não é lido em produção', async () => {
    for (const host of [CNPJ_HOST, CPF_HOST]) {
      for (const name of ['ap_session', 'ap_session_cpf']) {
        const res = await me(host, `${name}=${sessions[host].token}`);
        expect(res.status, `${host} ${name}`).toBe(401);
      }
    }
  });
});
