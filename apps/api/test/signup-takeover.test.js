import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { disconnectPrisma, getPaymentProvider } from '@autopix/core';
import { setupApp, resetDb, hasDb, testCnpj, PROFILE, STRONG_PASSWORD } from './helpers.js';

// Hotfix · cadastro com taxa em jogo. Antes desta correção, quem sabia só o e-mail de um cadastro
// com Pix aberto (ou pago) reiniciava o rascunho com os próprios dados. Quando a vítima pagava, o
// finish entregava o token de ativação a essa sessão, e o atacante ativava a conta no e-mail da
// vítima. O teste executa a exploração inteira e afirma o resultado seguro.

const HOST = 'localhost:5173';
const VICTIM_NAME = 'Vítima Souza';

function call(app, method, path, { body, cookie } = {}) {
  const req = request(app)[method](path).set('Host', HOST).set('Origin', `http://${HOST}`).set('X-Requested-With', 'autopix');
  if (cookie) req.set('Cookie', cookie);
  return body === undefined ? req : req.send(body);
}

function setCookieOf(res, name) {
  const raw = res.headers['set-cookie'] ?? [];
  return (Array.isArray(raw) ? raw : [raw]).find((c) => c.startsWith(`${name}=`)) ?? null;
}

const cookiePair = (setCookie) => setCookie.split(';')[0];

async function payWithWebhook(ctx, paymentId) {
  const payment = await ctx.prisma.payment.findUnique({ where: { id: paymentId } });
  const wh = getPaymentProvider('mock', ctx.config).buildWebhook(payment.providerPaymentId, 'CONFIRMED');
  const hook = request(ctx.app).post('/api/webhooks/payment/mock').set('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(wh.headers)) hook.set(k, v);
  return (await hook.send(wh.rawBody)).status;
}

describe.skipIf(!hasDb)('cadastro com taxa em jogo · reinício por e-mail e token de ativação', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp({ BILLING_MODEL: 'commission', DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  /** Victim opens the signup, completes the profile and generates the fee's Pix. */
  async function victimWithPix() {
    const email = `vitima-${Date.now()}-${Math.random()}@alvo.example`;
    const victimDoc = testCnpj();
    const start = await call(ctx.app, 'post', '/api/onboarding/start', {
      body: { accountType: 'COMPANY', name: VICTIM_NAME, email, companyName: 'Empresa da Vítima', document: victimDoc },
    });
    expect(start.status).toBe(201);
    const cookie = cookiePair(setCookieOf(start, 'ap_session'));
    expect((await call(ctx.app, 'put', '/api/onboarding/step', { cookie, body: { step: 9, data: PROFILE, complete: true } })).status).toBe(200);
    const pix = await call(ctx.app, 'post', '/api/payments/pix', { cookie, body: {} });
    expect(pix.status).toBe(201);
    return { email, victimDoc, cookie, paymentId: pix.body.payment.id };
  }

  it('quem só sabe o e-mail não reinicia o cadastro com Pix aberto, nem ativa a conta depois do pagamento', async () => {
    const victim = await victimWithPix();

    // O atacante só sabe o e-mail: reinício e checagem respondem igual a "e-mail já cadastrado".
    const attackerDoc = testCnpj();
    const restart = await call(ctx.app, 'post', '/api/onboarding/start', {
      body: { accountType: 'COMPANY', name: 'Atacante', email: victim.email, companyName: 'Empresa do Atacante', document: attackerDoc },
    });
    expect(restart.status).toBe(409);
    expect(restart.body.error.details?.field).toBe('email');
    expect(setCookieOf(restart, 'ap_session')).toBeNull();
    const probe = await call(ctx.app, 'post', '/api/onboarding/check', { body: { accountType: 'COMPANY', email: victim.email, document: attackerDoc } });
    expect(probe.body.available).toBe(false);
    expect(probe.body.taken.email).toBeTruthy();

    // A vítima paga. O atacante, sem sessão de cadastro, não consegue finalizar nem ativar.
    expect(await payWithWebhook(ctx, victim.paymentId)).toBe(200);
    const finish = await call(ctx.app, 'post', '/api/onboarding/finish', { body: {} });
    expect(finish.status).toBe(401);
    expect(finish.body.token ?? null).toBeNull();

    // O cadastro continua com os dados da vítima.
    const user = await ctx.prisma.user.findUnique({ where: { email: victim.email }, include: { company: true } });
    expect(user.name).toBe(VICTIM_NAME);
    expect(user.loginId).toBe(victim.victimDoc);
    expect(user.company.cnpj).toBe(victim.victimDoc);
  });

  it('o dono, com a própria sessão, reinicia o cadastro com o Pix aberto', async () => {
    const victim = await victimWithPix();
    const again = await call(ctx.app, 'post', '/api/onboarding/start', {
      body: { accountType: 'COMPANY', name: 'Dono Corrigido', email: victim.email, companyName: 'Empresa Corrigida', document: victim.victimDoc },
      cookie: victim.cookie,
    });
    expect(again.status).toBe(201);
    // O reinício troca a sessão do rascunho (a antiga é revogada), então a checagem usa a nova.
    const ownerCookie = cookiePair(setCookieOf(again, 'ap_session'));
    const check = await call(ctx.app, 'post', '/api/onboarding/check', {
      body: { accountType: 'COMPANY', email: victim.email, document: victim.victimDoc },
      cookie: ownerCookie,
    });
    expect(check.body.available).toBe(true);
  });

  it('um Pix vencido há mais de meia hora deixa de segurar o e-mail, como o descarte do rascunho', async () => {
    const victim = await victimWithPix();
    await ctx.prisma.payment.update({ where: { id: victim.paymentId }, data: { expiresAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } });
    const again = await call(ctx.app, 'post', '/api/onboarding/start', {
      body: { accountType: 'COMPANY', name: 'Recomeço', email: victim.email, companyName: 'Empresa Recomeço', document: testCnpj() },
    });
    expect(again.status).toBe(201);
  });

  it('o cadastro pago só termina com a sessão do dono, que recebe o token e ativa a conta', async () => {
    const victim = await victimWithPix();
    expect(await payWithWebhook(ctx, victim.paymentId)).toBe(200);
    const finish = await call(ctx.app, 'post', '/api/onboarding/finish', { cookie: victim.cookie, body: {} });
    expect(finish.status).toBe(200);
    const activated = await call(ctx.app, 'post', '/api/auth/activate', { body: { token: finish.body.token, password: STRONG_PASSWORD } });
    expect(activated.status).toBe(200);
  });
});
