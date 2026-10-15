import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { disconnectPrisma, getPrisma } from '@autopix/core';
import { setupApp, resetDb, client, hasDb, testCnpj, PROFILE } from './helpers.js';

const SECRET = 'bbpay-webhook-secret-0123456789abcdef0123';
const CONVENIO = '421378';
const URL = `/api/webhooks/payment/bb-pay?token=${SECRET}`;

const event = (numeroSolicitacao, valorOriginal, codigoEvento = 1) => ({
  codigoEvento,
  dadosEvento: {
    numeroConvenio: Number(CONVENIO),
    numeroSolicitacao,
    numeroPagamento: 123456,
    codigoEstadoPagamento: 200,
    timestampPagamento: '2026-10-15T13:02:55.00000',
    valorOriginal,
    codigoTipoPagamento: 'PIX',
    nomePagador: 'NOME DO PAGADOR',
  },
});

/** BB Pay webhooks as the bank sends them, through the real route. */
describe.skipIf(!hasDb)('BB Pay webhook route', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp({ PAYMENT_PROVIDER: 'bb_pay', BB_WEBHOOK_SECRET: SECRET, BB_PAY_CONVENIO: CONVENIO, BILLING_MODEL: 'commission', COMPANY_SIGNUP_FEE_CENTS: '20000' });
  });
  beforeEach(async () => {
    await resetDb(getPrisma());
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('answers 200 to the portal test event, and 401 without the token', async () => {
    const ok = await request(ctx.app).post(URL).send(event(56789, 100.2));
    expect(ok.status).toBe(200);
    const bad = await request(ctx.app).post('/api/webhooks/payment/bb-pay').send(event(56789, 100.2));
    expect(bad.status).toBe(401);
  });

  it('does not create a Pix it cannot issue yet', async () => {
    const c = client(ctx.app);
    expect((await c.post('/api/onboarding/start', { name: 'Ana Souza', email: 'bbpay@empresa.example', companyName: 'BB Pay Ltda', document: testCnpj() })).status).toBe(201);
    expect((await c.put('/api/onboarding/step', { step: 9, data: PROFILE, complete: true })).status).toBe(200);
    expect((await c.post('/api/payments/pix')).status).toBe(503);
    expect(await getPrisma().payment.count()).toBe(0);
  });

  it('confirms our signup request once, only for the right amount', async () => {
    const prisma = getPrisma();
    const c = client(ctx.app);
    const start = await c.post('/api/onboarding/start', { name: 'Ana Souza', email: 'pago@empresa.example', companyName: 'Paga Ltda', document: testCnpj() });
    const companyId = start.body.company.id;
    await c.put('/api/onboarding/step', { step: 9, data: PROFILE, complete: true });
    const sub = await prisma.subscription.create({ data: { companyId, plan: 'commission', priceCents: 0, provider: 'bb_pay' } });
    await prisma.payment.create({
      data: { kind: 'SIGNUP_FEE', subscriptionId: sub.id, companyId, provider: 'bb_pay', providerPaymentId: '777', amountCents: 20000, idempotencyKey: 'bbpay-777', expiresAt: new Date(Date.now() + 3600_000) },
    });

    // Wrong amount: flagged for a human, never confirmed.
    await request(ctx.app).post(URL).send(event(777, 2.0));
    expect((await prisma.payment.findFirst({ where: { providerPaymentId: '777' } })).status).toBe('PENDING');

    const paid = await request(ctx.app).post(URL).send({ ...event(777, 200.0), dadosEvento: { ...event(777, 200.0).dadosEvento, numeroPagamento: 999 } });
    expect(paid.status).toBe(200);
    expect((await prisma.payment.findFirst({ where: { providerPaymentId: '777' } })).status).toBe('CONFIRMED');
    expect((await prisma.subscription.findUnique({ where: { companyId } })).status).toBe('ACTIVE');

    // The bank retries: same event, nothing changes twice.
    expect((await request(ctx.app).post(URL).send({ ...event(777, 200.0), dadosEvento: { ...event(777, 200.0).dadosEvento, numeroPagamento: 999 } })).status).toBe(200);
  });
});
