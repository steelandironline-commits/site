import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { disconnectPrisma, getPrisma } from '@autopix/core';
import { setupApp, resetDb, client, hasDb, testCnpj, PROFILE } from './helpers.js';

const SECRET = 'bbpay-webhook-secret-0123456789abcdef0123';
const CONVENIO = '421378';
const URL = `/api/webhooks/payment/bb-pay?token=${SECRET}`;

const event = (numeroSolicitacao, valorOriginal, codigoEvento = 1, codigoConciliacaoSolicitacao = 'TPconc777', payer = {}) => ({
  codigoEvento,
  dadosEvento: {
    numeroConvenio: Number(CONVENIO),
    numeroSolicitacao,
    numeroPagamento: 123456,
    codigoEstadoPagamento: 200,
    timestampPagamento: '2026-10-15T13:02:55.00000',
    valorOriginal,
    codigoTipoPagamento: 'PIX',
    codigoConciliacaoSolicitacao,
    nomePagador: 'NOME DO PAGADOR',
    ...payer,
  },
});
// The bank sends the payer's document as a number (leading zeros dropped).
const paidBy = (type, document) => ({ tipoDocumentoPagador: type === 'CNPJ' ? 2 : 1, numeroDocumentoPagador: Number(document) });

async function signupWithCharge(ctx, { email, numero }) {
  const prisma = getPrisma();
  const c = client(ctx.app);
  const cnpj = testCnpj();
  const start = await c.post('/api/onboarding/start', { name: 'Ana Souza', email, companyName: 'Paga Ltda', document: cnpj });
  const companyId = start.body.company.id;
  await c.put('/api/onboarding/step', { step: 9, data: PROFILE, complete: true });
  const sub = await prisma.subscription.create({ data: { companyId, plan: 'commission', priceCents: 0, provider: 'bb_pay' } });
  const ref = `${numero}:TPconc${numero}`;
  await prisma.payment.create({
    data: { kind: 'SIGNUP_FEE', subscriptionId: sub.id, companyId, provider: 'bb_pay', providerPaymentId: ref, amountCents: 20000, idempotencyKey: `bbpay-${numero}`, expiresAt: new Date(Date.now() + 3600_000) },
  });
  return { c, cnpj, companyId, ref };
}

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

  it('confirms our signup request once, only for the right amount, paid by the company CNPJ', async () => {
    const prisma = getPrisma();
    const { cnpj, companyId, ref } = await signupWithCharge(ctx, { email: 'pago@empresa.example', numero: 777 });
    const byCompany = paidBy('CNPJ', cnpj);

    // Wrong amount: flagged for a human, never confirmed.
    await request(ctx.app).post(URL).send(event(777, 2.0, 1, 'TPconc777', byCompany));
    expect((await prisma.payment.findFirst({ where: { providerPaymentId: ref } })).status).toBe('PENDING');

    // "Paid" without saying by whom: not enough to open a company account.
    await request(ctx.app).post(URL).send({ ...event(777, 200.0), dadosEvento: { ...event(777, 200.0).dadosEvento, numeroPagamento: 998 } });
    expect((await prisma.payment.findFirst({ where: { providerPaymentId: ref } })).status).toBe('PENDING');

    const paidEvent = event(777, 200.0, 1, 'TPconc777', byCompany);
    paidEvent.dadosEvento.numeroPagamento = 999;
    const paid = await request(ctx.app).post(URL).send(paidEvent);
    expect(paid.status).toBe(200);
    expect((await prisma.payment.findFirst({ where: { providerPaymentId: ref } })).status).toBe('CONFIRMED');
    expect((await prisma.subscription.findUnique({ where: { companyId } })).status).toBe('ACTIVE');

    // The bank retries: same event, nothing changes twice.
    expect((await request(ctx.app).post(URL).send(paidEvent)).status).toBe(200);
  });

  it('refuses a signup fee paid from another account (CPF or another CNPJ) and opens it for return', async () => {
    const prisma = getPrisma();
    const { c, companyId, ref } = await signupWithCharge(ctx, { email: 'fraude@empresa.example', numero: 778 });
    const fromCpf = event(778, 200.0, 1, 'TPconc778', paidBy('CPF', '05544562701'));
    expect((await request(ctx.app).post(URL).send(fromCpf)).status).toBe(200);

    const payment = await prisma.payment.findFirst({ where: { providerPaymentId: ref } });
    expect(payment).toMatchObject({ status: 'FAILED', failureCode: 'PAYER_MISMATCH' });
    expect((await prisma.subscription.findUnique({ where: { companyId } })).status).not.toBe('ACTIVE');
    const issue = await prisma.reconciliationIssue.findFirst({ where: { paymentId: payment.id, kind: 'PAYER_MISMATCH' } });
    expect(issue).toMatchObject({ status: 'OPEN' });
    expect(issue.details).toMatchObject({ payerType: 'CPF', amountCents: 20000, numeroPagamento: 123456 });
    // The payer's document is never stored.
    expect(JSON.stringify(issue)).not.toContain('5544562701');
    const stored = await prisma.paymentEvent.findMany({ where: { providerPaymentId: ref } });
    expect(JSON.stringify(stored)).not.toContain('5544562701');

    // The checkout shows why, so the company can pay again from its own account.
    const seen = await c.get(`/api/payments/${payment.id}`);
    expect(seen.body.payment.checkoutState).toBe('PAYER_MISMATCH');

    // The bank refused the automatic return (no permission yet): the worker tries again
    // once an hour, and closes the issue when the bank accepts it.
    const payments = ctx.services.payments;
    const firstTry = await prisma.reconciliationIssue.findUnique({ where: { id: issue.id } });
    expect(firstTry.details.lastReturnAttemptAt).toBeTruthy();
    expect(await payments.retryPayerReturns()).toMatchObject({ pending: 1, returned: 0 }); // within the hour: no new call
    const realFactory = payments.providerFactory;
    const returned = [];
    payments.providerFactory = (name, cfg) => Object.assign(Object.create(realFactory(name, cfg)), { returnPayment: async (a) => (returned.push(a), { providerRefundId: '70001' }) });
    try {
      expect(await payments.retryPayerReturns({ now: new Date(Date.now() + 61 * 60 * 1000) })).toMatchObject({ returned: 1 });
    } finally {
      payments.providerFactory = realFactory;
    }
    expect(returned).toEqual([expect.objectContaining({ numeroPagamento: 123456, amountCents: 20000 })]);
    expect(await prisma.reconciliationIssue.findUnique({ where: { id: issue.id } })).toMatchObject({ status: 'AUTO_REPAIRED' });
    expect((await prisma.payment.findUnique({ where: { id: payment.id } })).failureCode).toBe('PAYER_MISMATCH_RETURNED');
    // Still shown as refused (and returned) on the checkout.
    expect((await c.get(`/api/payments/${payment.id}`)).body.payment.checkoutState).toBe('PAYER_MISMATCH');

    // Another company's CNPJ is refused the same way.
    const other = await signupWithCharge(ctx, { email: 'outra@empresa.example', numero: 779 });
    await request(ctx.app).post(URL).send(event(779, 200.0, 1, 'TPconc779', paidBy('CNPJ', testCnpj())));
    expect((await prisma.payment.findFirst({ where: { providerPaymentId: other.ref } })).failureCode).toBe('PAYER_MISMATCH');
  });
});
