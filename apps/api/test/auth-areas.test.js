import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { disconnectPrisma } from '@autopix/core';
import { setupApp, resetDb, hasDb, STRONG_PASSWORD, testCnpj, testCpf } from './helpers.js';
import {
  AREA_ENV,
  CNPJ_HOST,
  CPF_HOST,
  ADMIN_HOST,
  DEV_COOKIE,
  call,
  cookiePair,
  cookieValue,
  insertSession,
  lastAuthCode,
  makeAccount,
  setCookieOf,
} from './authAreaHelpers.js';

// ETAPA 4a · sessão e autenticação por área, no modo de áreas (hosts temcnpj.com.br e
// cpf.temcnpj.com.br, http porque o ambiente de teste não é produção, então sem __Host-).

const CNPJ_COOKIE = DEV_COOKIE[CNPJ_HOST]; // ap_session
const CPF_COOKIE = DEV_COOKIE[CPF_HOST]; // ap_session_cpf
const origin = (host) => `http://${host}`;

/** "nome=valor" do cookie de sessão que a resposta de login gravou para o host. */
function sessionCookie(res, host) {
  const header = setCookieOf(res, DEV_COOKIE[host]);
  expect(header, `Set-Cookie ${DEV_COOKIE[host]} em ${host}`).toBeDefined();
  return cookiePair(header);
}

const login = (ctx, host, identifier, password = STRONG_PASSWORD, path = '/api/auth/login') =>
  call(ctx.app, host, 'post', path, { body: { identifier, password } });

const me = (ctx, host, auth = {}) => call(ctx.app, host, 'get', '/api/me', { origin: null, xrw: null, ...auth });

const GENERIC_SIGNUP = 'Não foi possível iniciar o cadastro. Confira os dados e tente novamente.';
const IN_PROGRESS = /Já existe um cadastro em andamento com este e-mail/;
const NOT_FOUND_LINK = 'Link inválido ou já utilizado.';
/** Palavras que denunciariam a outra área (ou o tipo da conta) numa resposta neutra. */
const GIVEAWAYS = /CNPJ|CPF|empresa|pessoa|jur[ií]dica|f[ií]sica|colaborador/i;

// =============================================================================================
describe.skipIf(!hasDb)('área da sessão · modo de áreas', () => {
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

  describe('sessão cruzada', () => {
    it('o cookie de uma área não autentica na outra: cada host lê só o cookie da própria área', async () => {
      const cnpj = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
      const cpf = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
      const a = sessionCookie(await login(ctx, CNPJ_HOST, cnpj.email), CNPJ_HOST); // ap_session=<token CNPJ>
      const b = sessionCookie(await login(ctx, CPF_HOST, cpf.email), CPF_HOST); // ap_session_cpf=<token CPF>

      expect((await me(ctx, CNPJ_HOST, { cookie: a })).body.user.id).toBe(cnpj.user.id);
      expect((await me(ctx, CPF_HOST, { cookie: b })).body.user.id).toBe(cpf.user.id);

      // O cookie do CPF no host CNPJ (e o do CNPJ no host CPF): o nome não é o da área, ninguém lê.
      for (const [host, cookie] of [[CNPJ_HOST, b], [CPF_HOST, a]]) {
        const res = await me(ctx, host, { cookie });
        expect(res.status, host).toBe(401);
        const boot = await call(ctx.app, host, 'get', '/api/session', { cookie, origin: null, xrw: null });
        expect(boot.body, host).toEqual({ session: null });
      }
      // Com os dois cookies juntos, cada host enxerga só o seu.
      const both = `${a}; ${b}`;
      expect((await me(ctx, CNPJ_HOST, { cookie: both })).body.user.id).toBe(cnpj.user.id);
      expect((await me(ctx, CPF_HOST, { cookie: both })).body.user.id).toBe(cpf.user.id);
    });

    it('token de outra área posto no cookie do próprio host: 403 WRONG_AREA, nunca autentica', async () => {
      const cnpj = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
      const cpf = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
      const cnpjToken = cookieValue(setCookieOf(await login(ctx, CNPJ_HOST, cnpj.email), CNPJ_COOKIE));
      const cpfToken = cookieValue(setCookieOf(await login(ctx, CPF_HOST, cpf.email), CPF_COOKIE));

      // token CPF no cookie do host CNPJ
      for (const path of ['/api/me', '/api/session', '/api/dashboard']) {
        const res = await call(ctx.app, CNPJ_HOST, 'get', path, { cookie: `${CNPJ_COOKIE}=${cpfToken}`, origin: null, xrw: null });
        expect(res.status, path).toBe(403);
        expect(res.body.error.code).toBe('WRONG_AREA');
        expect(JSON.stringify(res.body)).not.toMatch(GIVEAWAYS);
      }
      // token CNPJ no cookie do host CPF
      const back = await me(ctx, CPF_HOST, { cookie: `${CPF_COOKIE}=${cnpjToken}` });
      expect(back.status).toBe(403);
      expect(back.body.error.code).toBe('WRONG_AREA');
      // O cookie torto do próprio host é apagado; a sessão de verdade segue viva (não foi revogada).
      expect(setCookieOf(back, CPF_COOKIE)).toMatch(/^ap_session_cpf=;/);
      expect(await ctx.prisma.session.count({ where: { userId: { in: [cnpj.user.id, cpf.user.id] } } })).toBe(2);
    });

    it('bearer (app nativo) de uma área no host da outra: 403 WRONG_AREA; no host certo, 200', async () => {
      const cnpj = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
      const cpf = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
      const nativeCnpj = await login(ctx, CNPJ_HOST, cnpj.email, STRONG_PASSWORD, '/api/auth/native/login');
      const nativeCpf = await login(ctx, CPF_HOST, cpf.email, STRONG_PASSWORD, '/api/auth/native/login');
      expect(nativeCnpj.status).toBe(200);
      expect(nativeCpf.status).toBe(200);
      expect(nativeCnpj.headers['set-cookie']).toBeUndefined();

      expect((await me(ctx, CNPJ_HOST, { bearer: nativeCnpj.body.token })).status).toBe(200);
      expect((await me(ctx, CPF_HOST, { bearer: nativeCpf.body.token })).status).toBe(200);
      for (const [host, token] of [[CPF_HOST, nativeCnpj.body.token], [CNPJ_HOST, nativeCpf.body.token]]) {
        const res = await me(ctx, host, { bearer: token });
        expect(res.status, host).toBe(403);
        expect(res.body.error.code).toBe('WRONG_AREA');
      }
    });

    it('sessão com área CPF cujo dono é uma empresa COMPANY é revogada, no host da área forjada e no da empresa', async () => {
      const company = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
      const forgedForCpf = await insertSession(ctx.prisma, ctx.config, { userId: company.user.id, area: 'CPF' });
      const res = await me(ctx, CPF_HOST, { cookie: `${CPF_COOKIE}=${forgedForCpf.token}` });
      expect(res.status).toBe(401);
      expect(await ctx.prisma.session.findUnique({ where: { id: forgedForCpf.session.id } })).toBeNull();

      const forgedAgain = await insertSession(ctx.prisma, ctx.config, { userId: company.user.id, area: 'CPF' });
      const onOwnHost = await me(ctx, CNPJ_HOST, { cookie: `${CNPJ_COOKIE}=${forgedAgain.token}` });
      expect(onOwnHost.status).toBe(401);
      expect(await ctx.prisma.session.findUnique({ where: { id: forgedAgain.session.id } })).toBeNull();
    });

    it('a inversa e o admin forjado também são revogados', async () => {
      const person = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
      const asCnpj = await insertSession(ctx.prisma, ctx.config, { userId: person.user.id, area: 'CNPJ' });
      expect((await me(ctx, CNPJ_HOST, { cookie: `${CNPJ_COOKIE}=${asCnpj.token}` })).status).toBe(401);
      expect(await ctx.prisma.session.findUnique({ where: { id: asCnpj.session.id } })).toBeNull();

      // area ADMIN para quem não é administrador da plataforma
      const asAdmin = await insertSession(ctx.prisma, ctx.config, { userId: person.user.id, area: 'ADMIN' });
      expect((await me(ctx, CNPJ_HOST, { cookie: `${CNPJ_COOKIE}=${asAdmin.token}` })).status).toBe(401);
      expect(await ctx.prisma.session.findUnique({ where: { id: asAdmin.session.id } })).toBeNull();

      // administrador que deixou de ser administrador: a sessão ADMIN cai
      const admin = await makeAccount(ctx.prisma, { accountType: 'PERSON', platformAdmin: true });
      const adminSession = await insertSession(ctx.prisma, ctx.config, { userId: admin.user.id, area: 'ADMIN' });
      expect((await me(ctx, CNPJ_HOST, { cookie: `${CNPJ_COOKIE}=${adminSession.token}` })).status).toBe(200);
      await ctx.prisma.user.update({ where: { id: admin.user.id }, data: { isPlatformAdmin: false } });
      expect((await me(ctx, CNPJ_HOST, { cookie: `${CNPJ_COOKIE}=${adminSession.token}` })).status).toBe(401);
      expect(await ctx.prisma.session.findUnique({ where: { id: adminSession.session.id } })).toBeNull();
    });

    it('sessão sem área é inválida no modo de áreas (e fica no banco, só expira)', async () => {
      const company = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
      const old = await insertSession(ctx.prisma, ctx.config, { userId: company.user.id, area: null });
      for (const auth of [{ cookie: `${CNPJ_COOKIE}=${old.token}` }, { bearer: old.token }]) {
        expect((await me(ctx, CNPJ_HOST, auth)).status).toBe(401);
      }
      expect((await call(ctx.app, CNPJ_HOST, 'get', '/api/session', { cookie: `${CNPJ_COOKIE}=${old.token}`, origin: null, xrw: null })).body).toEqual({ session: null });
      expect(await ctx.prisma.session.findUnique({ where: { id: old.session.id } })).not.toBeNull();
    });

    it('o admin entra pelo host CNPJ (sem ADMIN_HOST) e não vale no host CPF', async () => {
      const admin = await makeAccount(ctx.prisma, { accountType: 'PERSON', platformAdmin: true });
      const { token } = await insertSession(ctx.prisma, ctx.config, { userId: admin.user.id, area: 'ADMIN' });
      expect((await me(ctx, CNPJ_HOST, { cookie: `${CNPJ_COOKIE}=${token}` })).status).toBe(200);
      const wrong = await me(ctx, CPF_HOST, { cookie: `${CPF_COOKIE}=${token}` });
      expect(wrong.status).toBe(403);
      expect(wrong.body.error.code).toBe('WRONG_AREA');
    });

    it('pedido sem host de área (health) não carrega sessão, mesmo com bearer de qualquer área', async () => {
      const cnpj = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
      const native = await login(ctx, CNPJ_HOST, cnpj.email, STRONG_PASSWORD, '/api/auth/native/login');
      const health = await call(ctx.app, 'x.up.railway.app', 'get', '/api/health', { bearer: native.body.token, origin: null, xrw: null });
      expect(health.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------------------------
  describe('login na área errada', () => {
    const wrongPasswordOn = async (host, identifier, path) => {
      const res = await login(ctx, host, identifier, 'senha-errada-123', path);
      expect(res.status).toBe(401);
      return res;
    };

    it('mesma resposta e mesmo código da senha errada, por e-mail, CPF/CNPJ e native/login', async () => {
      const cnpj = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
      const cpf = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
      const cases = [
        { account: cpf, host: CNPJ_HOST }, // conta CPF batendo no host CNPJ
        { account: cnpj, host: CPF_HOST }, // conta CNPJ batendo no host CPF
      ];
      for (const path of ['/api/auth/login', '/api/auth/native/login']) {
        for (const { account, host } of cases) {
          for (const identifier of [account.email, account.document, account.email.toUpperCase()]) {
            const baseline = await wrongPasswordOn(host, identifier, path);
            const unknown = await wrongPasswordOn(host, '00000000000', path);
            const crossed = await login(ctx, host, identifier, account.password, path);
            const label = `${path} ${host} ${identifier}`;
            expect(crossed.status, label).toBe(baseline.status);
            expect(crossed.body, label).toEqual(baseline.body);
            expect(crossed.body, label).toEqual(unknown.body);
            expect(crossed.headers['set-cookie'], label).toBeUndefined();
            expect(crossed.body.token, label).toBeUndefined();
            expect(JSON.stringify(crossed.body)).not.toMatch(/ADMIN|área|area/i);
          }
        }
      }
      expect(await ctx.prisma.session.count()).toBe(0);
      expect((await ctx.prisma.user.findUnique({ where: { id: cpf.user.id } })).lastLoginAt).toBeNull();
    });

    it('conta de outra área que ainda nem está ativa também responde como senha errada (nunca 403 de conta inativa)', async () => {
      const pending = await makeAccount(ctx.prisma, { accountType: 'PERSON', status: 'PENDING_ACTIVATION' });
      const crossed = await login(ctx, CNPJ_HOST, pending.email);
      const baseline = await wrongPasswordOn(CNPJ_HOST, pending.email);
      expect(crossed.status).toBe(401);
      expect(crossed.body).toEqual(baseline.body);
      // Na própria área, o comportamento de sempre.
      expect((await login(ctx, CPF_HOST, pending.email)).status).toBe(403);
    });

    it('o admin da plataforma, no host CPF, também é uma conta de outra área', async () => {
      const admin = await makeAccount(ctx.prisma, { accountType: 'PERSON', platformAdmin: true });
      const crossed = await login(ctx, CPF_HOST, admin.document);
      expect(crossed.status).toBe(401);
      expect(crossed.body).toEqual((await wrongPasswordOn(CPF_HOST, admin.document)).body);
    });

    it('a área certa continua entrando, e a verificação de senha é feita ou queimada (o tempo não denuncia)', async () => {
      const cnpj = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
      const cpf = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
      expect((await login(ctx, CNPJ_HOST, cnpj.document)).status).toBe(200);
      expect((await login(ctx, CPF_HOST, cpf.document)).status).toBe(200);

      await wrongPasswordOn(CNPJ_HOST, 'ninguem@area.example'); // esquenta o hash de equalização
      const median = (xs) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)];
      const time = async (fn) => {
        const t0 = performance.now();
        await fn();
        return performance.now() - t0;
      };
      const wrongPassword = [];
      const wrongArea = [];
      for (let i = 0; i < 5; i += 1) {
        wrongPassword.push(await time(() => login(ctx, CNPJ_HOST, cnpj.email, 'senha-errada-123')));
        wrongArea.push(await time(() => login(ctx, CNPJ_HOST, cpf.email, cpf.password)));
      }
      // Se a senha não fosse verificada ou queimada, a resposta seria uma ordem de grandeza mais rápida.
      expect(median(wrongArea)).toBeGreaterThan(median(wrongPassword) * 0.4);
    });

    it('o código de WhatsApp só vale no host onde o login começou', async () => {
      const cnpj = await makeAccount(ctx.prisma, { accountType: 'COMPANY', whatsapp: true });
      const started = await login(ctx, CNPJ_HOST, cnpj.email);
      expect(started.status).toBe(200);
      expect(started.body.mfaRequired).toBe(true);
      expect(started.headers['set-cookie']).toBeUndefined();
      const challenge = await ctx.prisma.loginChallenge.findUnique({ where: { id: started.body.challengeId } });
      expect(challenge.area).toBe('CNPJ');
      const code = lastAuthCode(ctx.services);
      const verify = (host, path = '/api/auth/login/verify-whatsapp') =>
        call(ctx.app, host, 'post', path, { body: { challengeId: started.body.challengeId, code } });

      for (const path of ['/api/auth/login/verify-whatsapp', '/api/auth/native/verify-whatsapp']) {
        const wrong = await verify(CPF_HOST, path);
        expect(wrong.status, path).toBe(401);
        expect(wrong.headers['set-cookie']).toBeUndefined();
      }
      const untouched = await ctx.prisma.loginChallenge.findUnique({ where: { id: started.body.challengeId } });
      expect(untouched.consumedAt).toBeNull();
      expect(untouched.attempts).toBe(0);
      expect(await ctx.prisma.session.count()).toBe(0);

      const ok = await verify(CNPJ_HOST);
      expect(ok.status).toBe(200);
      expect(setCookieOf(ok, CNPJ_COOKIE)).toBeDefined();
      expect((await ctx.prisma.session.findFirst({ where: { userId: cnpj.user.id } })).area).toBe('CNPJ');
    });

    it('desafio sem área (de antes das áreas) não vale no modo de áreas', async () => {
      const cpf = await makeAccount(ctx.prisma, { accountType: 'PERSON', whatsapp: true });
      const started = await login(ctx, CPF_HOST, cpf.email);
      await ctx.prisma.loginChallenge.update({ where: { id: started.body.challengeId }, data: { area: null } });
      const res = await call(ctx.app, CPF_HOST, 'post', '/api/auth/login/verify-whatsapp', {
        body: { challengeId: started.body.challengeId, code: lastAuthCode(ctx.services) },
      });
      expect(res.status).toBe(401);
      expect(await ctx.prisma.session.count()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------------------------
  describe('cadastro', () => {
    const company = (extra = {}) => ({ accountType: 'COMPANY', name: 'Bia Lima', email: `bia-${Date.now()}-${Math.random()}@area.example`, companyName: 'Construtora Lima', document: testCnpj(), ...extra });
    const person = (extra = {}) => ({ accountType: 'PERSON', name: 'João Pereira', email: `joao-${Date.now()}-${Math.random()}@area.example`, document: testCpf(), ...extra });

    it('o host impõe o tipo: accountType oposto responde 400 genérico, sem criar nada', async () => {
      for (const [path, host, body] of [
        ['/api/onboarding/start', CPF_HOST, company()],
        ['/api/onboarding/start', CNPJ_HOST, person()],
        ['/api/onboarding/start', CPF_HOST, { ...person(), accountType: 'ADMIN' }],
        ['/api/onboarding/check', CPF_HOST, { accountType: 'COMPANY', email: 'x@area.example', document: testCnpj() }],
        ['/api/onboarding/check', CNPJ_HOST, { accountType: 'PERSON', email: 'x@area.example', document: testCpf() }],
      ]) {
        const res = await call(ctx.app, host, 'post', path, { body });
        expect(res.status, `${host}${path}`).toBe(400);
        expect(res.body.error.code).toBe('BAD_REQUEST');
        expect(res.body.error.message).toBe(GENERIC_SIGNUP);
        expect(res.body.error.fields).toBeUndefined();
        expect(JSON.stringify(res.body)).not.toMatch(GIVEAWAYS);
        expect(res.headers['set-cookie']).toBeUndefined();
      }
      expect(await ctx.prisma.user.count()).toBe(0);
      expect(await ctx.prisma.company.count()).toBe(0);
    });

    it('o tipo certo do host abre a conta e a sessão de cadastro, no cookie e na área do host', async () => {
      const a = await call(ctx.app, CNPJ_HOST, 'post', '/api/onboarding/start', { body: company() });
      expect(a.status).toBe(201);
      expect(a.body.company.accountType).toBe('COMPANY');
      expect(setCookieOf(a, CNPJ_COOKIE)).toBeDefined();
      expect(setCookieOf(a, CPF_COOKIE)).toBeUndefined();

      const b = await call(ctx.app, CPF_HOST, 'post', '/api/onboarding/start', { body: person() });
      expect(b.status).toBe(201);
      expect(b.body.company.accountType).toBe('PERSON');
      expect(setCookieOf(b, CPF_COOKIE)).toBeDefined();
      expect(setCookieOf(b, CNPJ_COOKIE)).toBeUndefined();

      const sessions = await ctx.prisma.session.findMany({ include: { user: { include: { company: true } } } });
      expect(sessions).toHaveLength(2);
      for (const s of sessions) {
        expect(s.scope).toBe('ONBOARDING');
        expect(s.area).toBe(s.user.company.accountType === 'COMPANY' ? 'CNPJ' : 'CPF');
      }
    });

    it('sem accountType no corpo, vale o tipo do host', async () => {
      const { accountType: _a, ...semTipoPf } = person();
      const { accountType: _b, ...semTipoPj } = company();
      const pf = await call(ctx.app, CPF_HOST, 'post', '/api/onboarding/start', { body: semTipoPf });
      expect(pf.status).toBe(201);
      expect(pf.body.company.accountType).toBe('PERSON');
      const pj = await call(ctx.app, CNPJ_HOST, 'post', '/api/onboarding/start', { body: semTipoPj });
      expect(pj.status).toBe(201);
      expect(pj.body.company.accountType).toBe('COMPANY');
    });

    it('reiniciar um rascunho de outra área responde a mensagem neutra e não mexe no rascunho', async () => {
      const email = `rascunho-${Date.now()}@area.example`;
      const draft = await call(ctx.app, CNPJ_HOST, 'post', '/api/onboarding/start', { body: company({ email }) });
      expect(draft.status).toBe(201);
      const user = await ctx.prisma.user.findUnique({ where: { email }, include: { company: true } });

      const crossed = await call(ctx.app, CPF_HOST, 'post', '/api/onboarding/start', { body: person({ email }) });
      expect(crossed.status).toBe(409);
      expect(crossed.body.error.message).toMatch(IN_PROGRESS);
      expect(crossed.body.error.message).not.toMatch(GIVEAWAYS);
      expect(crossed.body.error.details).toEqual({ field: 'email' });
      expect(crossed.headers['set-cookie']).toBeUndefined();

      const after = await ctx.prisma.user.findUnique({ where: { email }, include: { company: true } });
      expect(after.id).toBe(user.id);
      expect(after.company.accountType).toBe('COMPANY');
      expect(after.company.cnpj).toBe(user.company.cnpj);
      expect(after.company.name).toBe(user.company.name);
      expect(await ctx.prisma.session.count({ where: { userId: user.id } })).toBe(1);

      // O check diz o mesmo, sem citar a área.
      const check = await call(ctx.app, CPF_HOST, 'post', '/api/onboarding/check', { body: { accountType: 'PERSON', email, document: testCpf() } });
      expect(check.status).toBe(200);
      expect(check.body.available).toBe(false);
      expect(check.body.taken.email).toMatch(IN_PROGRESS);
      expect(check.body.taken.email).not.toMatch(GIVEAWAYS);

      // E a mesma área continua podendo reiniciar o próprio rascunho. 4c (item H): "próprio" é quem
      // tem a sessão de cadastro dele (o cookie do primeiro pedido); só o e-mail já não basta.
      const own = await call(ctx.app, CNPJ_HOST, 'post', '/api/onboarding/start', { body: company({ email }), cookie: cookiePair(setCookieOf(draft, CNPJ_COOKIE)) });
      expect(own.status).toBe(201);
      expect((await ctx.prisma.user.findUnique({ where: { email } })).id).toBe(user.id);
    });

    it('vale nos dois sentidos: rascunho do CPF reiniciado no host CNPJ', async () => {
      const email = `rascunho-pf-${Date.now()}@area.example`;
      expect((await call(ctx.app, CPF_HOST, 'post', '/api/onboarding/start', { body: person({ email }) })).status).toBe(201);
      const crossed = await call(ctx.app, CNPJ_HOST, 'post', '/api/onboarding/start', { body: company({ email }) });
      expect(crossed.status).toBe(409);
      expect(crossed.body.error.message).toMatch(IN_PROGRESS);
      expect(crossed.body.error.message).not.toMatch(GIVEAWAYS);
      const kept = await ctx.prisma.user.findUnique({ where: { email }, include: { company: true } });
      expect(kept.company.accountType).toBe('PERSON');
    });

    it('e-mail de uma conta já ativa, em qualquer área, dá a mesma mensagem de sempre', async () => {
      const acc = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
      for (const [host, body] of [[CNPJ_HOST, company({ email: acc.email })], [CPF_HOST, person({ email: acc.email })]]) {
        const res = await call(ctx.app, host, 'post', '/api/onboarding/start', { body });
        expect(res.status, host).toBe(409);
        expect(res.body.error.message).toBe('Já existe um cadastro com este e-mail. Use outro e-mail ou entre com a sua conta.');
      }
    });
  });

  // -------------------------------------------------------------------------------------------
  describe('links de ativação e de reset', () => {
    const link404 = async (res) => {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toBe(NOT_FOUND_LINK);
    };
    const nonexistent = () => 'A'.repeat(43);

    it('ativação: o link do cadastro CPF sai com o host do CPF e, em outro host, responde 404 como token inexistente', async () => {
      const start = await call(ctx.app, CPF_HOST, 'post', '/api/onboarding/start', { body: { accountType: 'PERSON', name: 'João Pereira', email: `joao-${Date.now()}@area.example`, document: testCpf() } });
      expect(start.status).toBe(201);
      const cookie = cookiePair(setCookieOf(start, CPF_COOKIE));
      const profile = { services: ['Eletricista'], city: 'Joinville', state: 'SC', serviceLocations: ['Joinville - SC'], postalCode: '89201000' };
      expect((await call(ctx.app, CPF_HOST, 'put', '/api/onboarding/step', { cookie, body: { step: 4, data: profile, complete: true } })).status).toBe(200);
      const fin = await call(ctx.app, CPF_HOST, 'post', '/api/onboarding/finish', { cookie });
      expect(fin.status).toBe(200);
      expect(fin.body).toMatchObject({ emailVerificationRequired: true, emailSent: true });

      const text = ctx.email.outbox.at(-1).text;
      const token = new RegExp(`${origin(CPF_HOST)}/activate/([A-Za-z0-9_-]+)`).exec(text)?.[1];
      expect(token, 'o e-mail traz o link do host CPF').toBeTruthy();
      expect(text).not.toContain(`${origin(CNPJ_HOST)}/activate/`);
      expect(text).not.toContain('localhost:5173');
      expect((await ctx.prisma.activationToken.findFirst({ where: { user: { email: start.body.user.email } } })).area).toBe('CPF');

      const unknown = await call(ctx.app, CNPJ_HOST, 'get', `/api/auth/activate/${nonexistent()}`, { origin: null, xrw: null });
      await link404(unknown);
      const inspect = await call(ctx.app, CNPJ_HOST, 'get', `/api/auth/activate/${token}`, { origin: null, xrw: null });
      await link404(inspect);
      expect(inspect.body).toEqual(unknown.body);
      const activate = await call(ctx.app, CNPJ_HOST, 'post', '/api/auth/activate', { body: { token, password: STRONG_PASSWORD } });
      await link404(activate);
      expect(activate.headers['set-cookie']).toBeUndefined();
      const untouched = await ctx.prisma.activationToken.findFirst({ where: { user: { email: start.body.user.email } } });
      expect(untouched.usedAt).toBeNull();
      expect((await ctx.prisma.user.findUnique({ where: { email: start.body.user.email } })).status).toBe('PENDING_ACTIVATION');

      const right = await call(ctx.app, CPF_HOST, 'post', '/api/auth/activate', { body: { token, password: STRONG_PASSWORD } });
      expect(right.status).toBe(200);
      expect(setCookieOf(right, CPF_COOKIE)).toBeDefined();
      const session = await ctx.prisma.session.findFirst({ where: { user: { email: start.body.user.email }, scope: 'FULL' } });
      expect(session.area).toBe('CPF');
    });

    it('ativação de empresa: link com o host CNPJ; no host CPF é 404; e a inspeção de link usado não vaza no host errado', async () => {
      const acc = await makeAccount(ctx.prisma, { accountType: 'COMPANY', status: 'PENDING_ACTIVATION' });
      const { token, area } = await ctx.services.auth.issueActivation(acc.user.id);
      expect(area).toBe('CNPJ');
      expect(ctx.services.auth.activationLink(token, area)).toBe(`${origin(CNPJ_HOST)}/activate/${token}`);

      await link404(await call(ctx.app, CPF_HOST, 'get', `/api/auth/activate/${token}`, { origin: null, xrw: null }));
      await link404(await call(ctx.app, CPF_HOST, 'post', '/api/auth/activate', { body: { token, password: STRONG_PASSWORD } }));
      expect((await call(ctx.app, CNPJ_HOST, 'get', `/api/auth/activate/${token}`, { origin: null, xrw: null })).status).toBe(200);
      expect((await call(ctx.app, CNPJ_HOST, 'post', '/api/auth/activate', { body: { token, password: STRONG_PASSWORD } })).status).toBe(200);
      // Já usado: no host certo é 410; no host errado continua 404, igual a token inexistente.
      expect((await call(ctx.app, CNPJ_HOST, 'get', `/api/auth/activate/${token}`, { origin: null, xrw: null })).status).toBe(410);
      await link404(await call(ctx.app, CPF_HOST, 'get', `/api/auth/activate/${token}`, { origin: null, xrw: null }));
    });

    it('token antigo, sem área, vale a área do dono', async () => {
      const company = await makeAccount(ctx.prisma, { accountType: 'COMPANY', status: 'PENDING_ACTIVATION' });
      const { token } = await ctx.services.auth.issueActivation(company.user.id);
      await ctx.prisma.activationToken.updateMany({ where: { userId: company.user.id }, data: { area: null } });
      await link404(await call(ctx.app, CPF_HOST, 'get', `/api/auth/activate/${token}`, { origin: null, xrw: null }));
      expect((await call(ctx.app, CNPJ_HOST, 'get', `/api/auth/activate/${token}`, { origin: null, xrw: null })).status).toBe(200);
    });

    it('convite de colaborador: o link sai no host CNPJ, com a área CNPJ no token', async () => {
      const owner = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
      const out = await ctx.services.team.invite(owner.company, owner.user, { name: 'Colaborador Teste', email: `colab-${Date.now()}@area.example`, cpf: testCpf() });
      expect(out.invite.link).toMatch(new RegExp(`^${origin(CNPJ_HOST)}/activate/[A-Za-z0-9_-]+$`));
      const token = out.invite.link.split('/').pop();
      expect((await ctx.prisma.activationToken.findFirst({ where: { userId: out.member.id } })).area).toBe('CNPJ');
      await link404(await call(ctx.app, CPF_HOST, 'get', `/api/auth/activate/${token}`, { origin: null, xrw: null }));
    });

    it('reset: o link sai com o host da área do dono e, em outro host, responde 404 e não troca a senha', async () => {
      const cpf = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
      const ask = await call(ctx.app, CPF_HOST, 'post', '/api/auth/forgot-password', { body: { email: cpf.email } });
      expect(ask.status).toBe(200);
      const text = ctx.email.outbox.at(-1).text;
      const token = new RegExp(`${origin(CPF_HOST)}/reset-password/([A-Za-z0-9_-]+)`).exec(text)?.[1];
      expect(token, 'o e-mail traz o link do host CPF').toBeTruthy();
      expect((await ctx.prisma.passwordResetToken.findFirst({ where: { userId: cpf.user.id } })).area).toBe('CPF');

      const unknown = await call(ctx.app, CNPJ_HOST, 'get', `/api/auth/reset-password/${nonexistent()}`, { origin: null, xrw: null });
      await link404(unknown);
      const inspect = await call(ctx.app, CNPJ_HOST, 'get', `/api/auth/reset-password/${token}`, { origin: null, xrw: null });
      await link404(inspect);
      expect(inspect.body).toEqual(unknown.body);
      await link404(await call(ctx.app, CNPJ_HOST, 'post', '/api/auth/reset-password', { body: { token, password: 'outra-senha-2024-x' } }));
      expect((await ctx.prisma.passwordResetToken.findFirst({ where: { userId: cpf.user.id } })).usedAt).toBeNull();
      expect((await login(ctx, CPF_HOST, cpf.email)).status).toBe(200); // a senha antiga segue valendo

      expect((await call(ctx.app, CPF_HOST, 'get', `/api/auth/reset-password/${token}`, { origin: null, xrw: null })).status).toBe(200);
      expect((await call(ctx.app, CPF_HOST, 'post', '/api/auth/reset-password', { body: { token, password: 'outra-senha-2024-x' } })).status).toBe(200);
      expect((await login(ctx, CPF_HOST, cpf.email, 'outra-senha-2024-x')).status).toBe(200);
    });

    it('reset antigo, sem área, vale a área do dono', async () => {
      const cnpj = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
      const { token } = await ctx.services.auth.requestPasswordReset(cnpj.email, { hostArea: 'CNPJ' });
      await ctx.prisma.passwordResetToken.updateMany({ where: { userId: cnpj.user.id }, data: { area: null } });
      await link404(await call(ctx.app, CPF_HOST, 'get', `/api/auth/reset-password/${token}`, { origin: null, xrw: null }));
      expect((await call(ctx.app, CNPJ_HOST, 'get', `/api/auth/reset-password/${token}`, { origin: null, xrw: null })).status).toBe(200);
    });

    it('esqueci a senha em outra área: mesma resposta, nenhum token e nenhum e-mail', async () => {
      const cpf = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
      const cnpj = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
      const before = ctx.email.outbox.at(-1);
      const unknown = await call(ctx.app, CNPJ_HOST, 'post', '/api/auth/forgot-password', { body: { email: 'ninguem@area.example' } });
      for (const [host, email] of [[CNPJ_HOST, cpf.email], [CPF_HOST, cnpj.email]]) {
        const res = await call(ctx.app, host, 'post', '/api/auth/forgot-password', { body: { email } });
        expect(res.status, host).toBe(unknown.status);
        expect(res.body, host).toEqual(unknown.body);
      }
      expect(await ctx.prisma.passwordResetToken.count()).toBe(0);
      expect(ctx.email.outbox.at(-1)).toBe(before);
      // Na própria área o e-mail sai.
      await call(ctx.app, CPF_HOST, 'post', '/api/auth/forgot-password', { body: { email: cpf.email } });
      expect(await ctx.prisma.passwordResetToken.count()).toBe(1);
      expect(ctx.email.outbox.at(-1)).not.toBe(before);
      expect(ctx.email.outbox.at(-1).to).toBe(cpf.email);
    });
  });

  // -------------------------------------------------------------------------------------------
  describe('CORS e CSRF', () => {
    const acao = (res) => res.headers['access-control-allow-origin'];

    it('CORS responde só à origem da própria área, sem curinga', async () => {
      for (const [host, other] of [[CNPJ_HOST, CPF_HOST], [CPF_HOST, CNPJ_HOST]]) {
        const own = await call(ctx.app, host, 'get', '/api/session', { origin: origin(host), xrw: null });
        expect(acao(own), host).toBe(origin(host));
        expect(own.headers['access-control-allow-credentials']).toBe('true');
        for (const foreign of [origin(other), `https://${host}`, 'http://localhost:5173', 'https://x.up.railway.app', 'null', origin(`sub.${host}`)]) {
          const res = await call(ctx.app, host, 'get', '/api/session', { origin: foreign, xrw: null });
          expect(res.status).toBe(200);
          expect(acao(res), `${host} ← ${foreign}`).toBeUndefined();
        }
        const preflightOwn = await call(ctx.app, host, 'options', '/api/auth/login', { origin: origin(host), xrw: null, headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-requested-with,content-type' } });
        expect(preflightOwn.status).toBe(204);
        expect(acao(preflightOwn)).toBe(origin(host));
        const preflightOther = await call(ctx.app, host, 'options', '/api/auth/login', { origin: origin(other), xrw: null, headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-requested-with,content-type' } });
        expect(acao(preflightOther)).toBeUndefined();
      }
    });

    it('CSRF exige o Origin da própria área e o X-Requested-With', async () => {
      const send = (host, opts) => call(ctx.app, host, 'post', '/api/auth/logout', { body: {}, ...opts });
      for (const [host, other] of [[CNPJ_HOST, CPF_HOST], [CPF_HOST, CNPJ_HOST]]) {
        const foreign = await send(host, { origin: origin(other) });
        expect(foreign.status, `${host} com Origin do ${other}`).toBe(403);
        expect(foreign.body.error.message).toBe('Origem não permitida.');
        expect((await send(host, { origin: 'http://localhost:5173' })).status).toBe(403);
        expect((await send(host, { origin: null })).status).toBe(403); // sem Origin
        const noHeader = await send(host, { xrw: null });
        expect(noHeader.status).toBe(403);
        expect(noHeader.body.error.message).toBe('Requisição não permitida.');
        expect((await send(host, { xrw: 'outro' })).status).toBe(403);
        expect((await send(host, {})).status).toBe(200);
      }
    });

    it('login com o Origin da outra área é recusado antes de qualquer verificação de senha', async () => {
      const cpf = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
      const res = await call(ctx.app, CPF_HOST, 'post', '/api/auth/login', { body: { identifier: cpf.email, password: cpf.password }, origin: origin(CNPJ_HOST) });
      expect(res.status).toBe(403);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(await ctx.prisma.session.count()).toBe(0);
    });

    it('cliente com bearer e sem cookie da área dispensa o Origin; o login nativo também, mas Origin errado não', async () => {
      const cnpj = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
      const nativeLogin = await call(ctx.app, CNPJ_HOST, 'post', '/api/auth/native/login', { body: { identifier: cnpj.email, password: cnpj.password }, origin: null });
      expect(nativeLogin.status).toBe(200);
      const out = await call(ctx.app, CNPJ_HOST, 'post', '/api/auth/logout', { body: {}, origin: null, xrw: null, bearer: nativeLogin.body.token });
      expect(out.status).toBe(200);
      expect(await ctx.prisma.session.count()).toBe(0);
      const wrongOrigin = await call(ctx.app, CNPJ_HOST, 'post', '/api/auth/native/login', { body: { identifier: cnpj.email, password: cnpj.password }, origin: origin(CPF_HOST) });
      expect(wrongOrigin.status).toBe(403);
      // O endereço de login do navegador, esse sim, exige Origin.
      expect((await call(ctx.app, CNPJ_HOST, 'post', '/api/auth/login', { body: { identifier: cnpj.email, password: cnpj.password }, origin: null })).status).toBe(403);
    });
  });
});

// =============================================================================================
describe.skipIf(!hasDb)('área da sessão · modo de áreas com ADMIN_HOST', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp({ ...AREA_ENV, ADMIN_HOST });
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('o admin entra no host de admin, com o cookie próprio; no host CNPJ ele é conta de outra área', async () => {
    const admin = await makeAccount(ctx.prisma, { accountType: 'PERSON', platformAdmin: true });
    const crossed = await login(ctx, CNPJ_HOST, admin.email);
    expect(crossed.status).toBe(401);
    expect(crossed.headers['set-cookie']).toBeUndefined();

    const ok = await login(ctx, ADMIN_HOST, admin.email);
    expect(ok.status).toBe(200);
    const cookie = cookiePair(setCookieOf(ok, 'ap_session_admin'));
    expect((await ctx.prisma.session.findFirst({ where: { userId: admin.user.id } })).area).toBe('ADMIN');
    expect((await me(ctx, ADMIN_HOST, { cookie })).status).toBe(200);
    // Esse mesmo token no cookie do CNPJ: não vale ali.
    const asCnpj = await me(ctx, CNPJ_HOST, { cookie: `${CNPJ_COOKIE}=${cookieValue(setCookieOf(ok, 'ap_session_admin'))}` });
    expect(asCnpj.status).toBe(403);
    expect(asCnpj.body.error.code).toBe('WRONG_AREA');
  });

  it('conta de empresa no host de admin responde como senha errada', async () => {
    const cnpj = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    const crossed = await login(ctx, ADMIN_HOST, cnpj.email);
    const baseline = await login(ctx, ADMIN_HOST, cnpj.email, 'senha-errada-123');
    expect(crossed.status).toBe(401);
    expect(crossed.body).toEqual(baseline.body);
  });

  it('o host de admin não tem cadastro: a rota nem existe nele (404, 4b) e o serviço também recusaria (400 genérico)', async () => {
    const res = await call(ctx.app, ADMIN_HOST, 'post', '/api/onboarding/start', {
      body: { name: 'Zé', email: `ze-${Date.now()}@area.example`, document: testCpf() },
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
    // Defesa em profundidade: se a rota fosse montada, o serviço ainda recusaria o host de admin.
    expect(() => ctx.services.onboarding.applyHostAccountType({}, 'ADMIN')).toThrow(GENERIC_SIGNUP);
  });
});
