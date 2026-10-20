import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { disconnectPrisma, getPaymentProvider } from '@autopix/core';
import { setupApp, resetDb, hasDb, testCnpj, PROFILE, STRONG_PASSWORD } from './helpers.js';
import { AREA_ENV, CNPJ_HOST, call, cookiePair, setCookieOf } from './authAreaHelpers.js';

// 4c · item I (pré-existente, fora do diff). Hipótese da revisão: quem sabe o e-mail de um cadastro
// em andamento o reinicia (POST /api/onboarding/start) e, se a vítima pagar a taxa depois,
// POST /api/onboarding/finish entrega o token de ativação à sessão de quem reiniciou. O teste
// executa a exploração inteira contra o app e afirma o resultado seguro: o atacante não chega a
// uma conta ativa sobre o cadastro pago pela vítima.

const VICTIM_NAME = 'Vítima Souza';

/** Roda a exploração em um host (legado: localhost; áreas: o host CNPJ) e devolve o que o atacante obteve. */
async function exploit(ctx, host) {
  const send = (method, path, extra) => call(ctx.app, host, method, path, extra);
  const email = `vitima-${Date.now()}@alvo.example`;
  const victimDoc = testCnpj();
  const attackerDoc = testCnpj();

  // 1. A vítima abre o cadastro, completa o perfil e gera o Pix da taxa (cobrança pendente).
  const start = await send('post', '/api/onboarding/start', { body: { accountType: 'COMPANY', name: VICTIM_NAME, email, companyName: 'Empresa da Vítima', document: victimDoc } });
  expect(start.status).toBe(201);
  const victim = cookiePair(setCookieOf(start, 'ap_session'));
  expect((await send('put', '/api/onboarding/step', { cookie: victim, body: { step: 9, data: PROFILE, complete: true } })).status).toBe(200);
  const pix = await send('post', '/api/payments/pix', { cookie: victim, body: {} });
  expect(pix.status).toBe(201);

  // 2. O atacante só sabe o e-mail. Reinicia o cadastro com os próprios dados.
  const restart = await send('post', '/api/onboarding/start', { body: { accountType: 'COMPANY', name: 'Atacante', email, companyName: 'Empresa do Atacante', document: attackerDoc } });
  const attackerCookie = setCookieOf(restart, 'ap_session');
  const result = { restartStatus: restart.status, gotSession: Boolean(attackerCookie) };
  const attacker = attackerCookie ? cookiePair(attackerCookie) : null;
  if (attacker) {
    await send('put', '/api/onboarding/step', { cookie: attacker, body: { step: 9, data: PROFILE, complete: true } });
  }

  // 3. A vítima paga o Pix (o webhook do provedor confirma a cobrança dela).
  const payment = await ctx.prisma.payment.findUnique({ where: { id: pix.body.payment.id } });
  const wh = getPaymentProvider('mock', ctx.config).buildWebhook(payment.providerPaymentId, 'CONFIRMED');
  const hook = request(ctx.app).post('/api/webhooks/payment/mock').set('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(wh.headers)) hook.set(k, v);
  expect((await hook.send(wh.rawBody)).status).toBe(200);

  // 4. O atacante tenta finalizar com a própria sessão e ativar a conta com a senha dele.
  if (attacker) {
    const finish = await send('post', '/api/onboarding/finish', { cookie: attacker, body: {} });
    result.finishStatus = finish.status;
    result.token = finish.body?.token ?? null;
    if (result.token) {
      const activated = await send('post', '/api/auth/activate', { body: { token: result.token, password: STRONG_PASSWORD } });
      result.activated = activated.status === 200;
    }
  }
  // O dono do e-mail continua sendo quem paga: a conta é dele e o e-mail de ativação foi para ele.
  result.user = await ctx.prisma.user.findUnique({ where: { email }, include: { company: true } });
  result.victimDoc = victimDoc;
  result.attackerDoc = attackerDoc;
  return result;
}

describe.skipIf(!hasDb)('cadastro em andamento · reinício por e-mail e token de ativação · modo legado', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp({ BILLING_MODEL: 'commission', DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('quem só sabe o e-mail não reinicia o cadastro que já tem cobrança Pix, nem recebe o token de ativação', async () => {
    const r = await exploit(ctx, 'localhost:5173');
    expect(r.restartStatus).toBe(409);
    expect(r.gotSession).toBe(false);
    expect(r.token ?? null).toBeNull();
    expect(r.activated ?? false).toBe(false);
    // O cadastro continua com os dados da vítima.
    expect(r.user.name).toBe(VICTIM_NAME);
    expect(r.user.loginId).toBe(r.victimDoc);
    expect(r.user.company.cnpj).toBe(r.victimDoc);
  });
});

describe.skipIf(!hasDb)('cadastro em andamento · o fluxo do próprio dono não muda · modo legado', () => {
  let ctx;
  const host = 'localhost:5173';
  beforeAll(async () => {
    ctx = await setupApp({ BILLING_MODEL: 'commission', DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  async function openPix() {
    const email = `dono-${Date.now()}-${Math.random()}@alvo.example`;
    const body = { accountType: 'COMPANY', name: 'Dono Souza', email, companyName: 'Empresa do Dono', document: testCnpj() };
    const start = await call(ctx.app, host, 'post', '/api/onboarding/start', { body });
    const cookie = cookiePair(setCookieOf(start, 'ap_session'));
    await call(ctx.app, host, 'put', '/api/onboarding/step', { cookie, body: { step: 9, data: PROFILE, complete: true } });
    const pix = await call(ctx.app, host, 'post', '/api/payments/pix', { cookie, body: {} });
    expect(pix.status).toBe(201);
    return { email, body, cookie, paymentId: pix.body.payment.id };
  }

  it('o dono, com a própria sessão, ainda reinicia o cadastro com a cobrança aberta', async () => {
    const { body, cookie } = await openPix();
    const again = await call(ctx.app, host, 'post', '/api/onboarding/start', { body: { ...body, name: 'Dono Corrigido' }, cookie });
    expect(again.status).toBe(201);
  });

  it('um Pix vencido há mais de meia hora deixa de segurar o e-mail, como o descarte do rascunho', async () => {
    const { body, paymentId } = await openPix();
    await ctx.prisma.payment.update({ where: { id: paymentId }, data: { expiresAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } });
    const again = await call(ctx.app, host, 'post', '/api/onboarding/start', { body: { ...body, name: 'Recomeço' } });
    expect(again.status).toBe(201);
  });

  it('o cadastro pago, sem a sessão do dono, não é reiniciado; com ela, o fluxo termina como sempre', async () => {
    const { body, cookie, paymentId } = await openPix();
    const payment = await ctx.prisma.payment.findUnique({ where: { id: paymentId } });
    const wh = getPaymentProvider('mock', ctx.config).buildWebhook(payment.providerPaymentId, 'CONFIRMED');
    const hook = request(ctx.app).post('/api/webhooks/payment/mock').set('Content-Type', 'application/json');
    for (const [k, v] of Object.entries(wh.headers)) hook.set(k, v);
    expect((await hook.send(wh.rawBody)).status).toBe(200);
    // Pago: o usuário já espera a ativação, então o e-mail está tomado de qualquer jeito.
    const stranger = await call(ctx.app, host, 'post', '/api/onboarding/start', { body });
    expect(stranger.status).toBe(409);
    // O dono, com a sessão que já tinha, recebe o token ao finalizar e ativa a conta.
    const finish = await call(ctx.app, host, 'post', '/api/onboarding/finish', { cookie, body: {} });
    expect(finish.status).toBe(200);
    const activated = await call(ctx.app, host, 'post', '/api/auth/activate', { body: { token: finish.body.token, password: STRONG_PASSWORD } });
    expect(activated.status).toBe(200);
  });
});

describe.skipIf(!hasDb)('cadastro em andamento · reinício por e-mail e token de ativação · modo de áreas', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp({ ...AREA_ENV, DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('o mesmo vale no host CNPJ', async () => {
    const r = await exploit(ctx, CNPJ_HOST);
    expect(r.restartStatus).toBe(409);
    expect(r.gotSession).toBe(false);
    expect(r.token ?? null).toBeNull();
    expect(r.activated ?? false).toBe(false);
    expect(r.user.name).toBe(VICTIM_NAME);
    expect(r.user.loginId).toBe(r.victimDoc);
  });
});
