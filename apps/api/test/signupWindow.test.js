import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { disconnectPrisma, getPrisma } from '@autopix/core';
import { setupApp, resetDb, client, hasDb, onboardToCheckout, testCnpj, testCpf, PROFILE } from './helpers.js';

const HOUR_MS = 60 * 60 * 1000;

/** An unpaid signup lasts one hour from the Pix request; its Pix never outlives that hour. */
describe.skipIf(!hasDb)('signup window: one hour from the Pix request', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp({ BILLING_MODEL: 'commission', COMPANY_SIGNUP_FEE_CENTS: '20000' });
  });
  beforeEach(async () => {
    await resetDb(getPrisma());
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('gives the unpaid signup one hour, and the Pix expires no later than that', async () => {
    const prisma = getPrisma();
    const { email, payment } = await onboardToCheckout(ctx.app);
    const user = await prisma.user.findUnique({ where: { email } });
    const charge = await prisma.payment.findUnique({ where: { id: payment.id } });

    const left = user.pendingExpiresAt.getTime() - Date.now();
    expect(left).toBeGreaterThan(HOUR_MS - 60_000);
    expect(left).toBeLessThanOrEqual(HOUR_MS);
    expect(charge.expiresAt.getTime()).toBeLessThanOrEqual(user.pendingExpiresAt.getTime());
  });

  it('never resets a paid signup; an unpaid one goes back to zero only after the bank can no longer confirm it', async () => {
    const prisma = getPrisma();
    const past = (ms) => new Date(Date.now() - ms);
    // Any new signup runs the cleanup of expired drafts.
    const trigger = () => client(ctx.app).post('/api/onboarding/start', { accountType: 'PERSON', name: 'Gatilho Silva', email: `gatilho-${Date.now()}-${Math.random()}@ex.example`, document: testCpf() });

    const paid = await onboardToCheckout(ctx.app);
    await prisma.payment.update({ where: { id: paid.payment.id }, data: { status: 'CONFIRMED', expiresAt: past(HOUR_MS) } });
    await prisma.user.update({ where: { email: paid.email }, data: { pendingExpiresAt: past(2 * HOUR_MS) } });

    const lastMinute = await onboardToCheckout(ctx.app);
    await prisma.payment.update({ where: { id: lastMinute.payment.id }, data: { expiresAt: past(5 * 60_000) } });
    await prisma.user.update({ where: { email: lastMinute.email }, data: { pendingExpiresAt: past(5 * 60_000) } });

    const abandoned = await onboardToCheckout(ctx.app);
    await prisma.payment.update({ where: { id: abandoned.payment.id }, data: { expiresAt: past(2 * HOUR_MS) } });
    await prisma.user.update({ where: { email: abandoned.email }, data: { pendingExpiresAt: past(2 * HOUR_MS) } });

    expect((await trigger()).status).toBe(201);
    expect(await prisma.user.findUnique({ where: { email: paid.email } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { email: lastMinute.email } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { email: abandoned.email } })).toBeNull();
    expect(await prisma.company.findFirst({ where: { cnpj: abandoned.cnpj } })).toBeNull();
  });

  it('refuses a Pix to a signup whose hour has passed, and creates no charge', async () => {
    const prisma = getPrisma();
    const c = client(ctx.app);
    const email = 'vencido@empresa.example';
    const cnpj = testCnpj();
    expect((await c.post('/api/onboarding/start', { name: 'Ana Souza', email, companyName: 'Vencida Ltda', document: cnpj })).status).toBe(201);
    expect((await c.put('/api/onboarding/step', { step: 9, data: PROFILE, complete: true })).status).toBe(200);

    await prisma.user.update({ where: { email }, data: { pendingExpiresAt: new Date(Date.now() - 1000) } });

    const late = await c.post('/api/payments/pix');
    expect(late.status).toBe(410);
    expect(await prisma.payment.count({ where: { company: { cnpj } } })).toBe(0);
  });
});
