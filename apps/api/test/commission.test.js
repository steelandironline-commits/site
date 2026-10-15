import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { disconnectPrisma } from '@autopix/core';
import { COMMISSION_PLAN_CODE } from '@autopix/shared';
import { setupApp, resetDb, client, hasDb, PROFILE, STRONG_PASSWORD, testCnpj, testCpf, activationTokenFromEmail } from './helpers.js';

const WORKER_PROFILE = { services: ['Eletricista'], city: 'Joinville', state: 'SC', serviceLocations: ['Joinville - SC'], postalCode: '89201000' };

/**
 * TemPix has no subscription: professionals (pessoa física) sign up free,
 * companies pay a one-time signup fee, and every contract pays a commission
 * by value tier (5% down to 2%).
 */
describe.skipIf(!hasDb)('commission model: free professionals, one-time company fee', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp({ BILLING_MODEL: 'commission' });
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  async function start(c, accountType, email = `${accountType.toLowerCase()}-${Date.now()}@empresa.example`) {
    const body =
      accountType === 'PERSON'
        ? { accountType, name: 'João Pereira', email, document: testCpf() }
        : { accountType, name: 'Bia Lima', email, companyName: 'Construtora Lima', document: testCnpj() };
    const res = await c.post('/api/onboarding/start', body);
    expect(res.status).toBe(201);
    expect(res.body.billingModel).toBe('commission');
    expect(res.body.company.accountType).toBe(accountType);
    return { email, state: res.body };
  }

  it('professional: free signup, no CNPJ, activates without any charge', async () => {
    const c = client(ctx.app);
    const { email, state } = await start(c, 'PERSON');
    expect(state.company.name).toBe('João Pereira');
    expect(state.signupFeeCents).toBe(0);
    expect((await c.put('/api/onboarding/step', { step: 4, data: WORKER_PROFILE, complete: true })).status).toBe(200);

    const fin = await c.post('/api/onboarding/finish');
    expect(fin.status).toBe(200);
    expect(fin.body).toMatchObject({ emailVerificationRequired: true, emailSent: true });
    expect(fin.body.token).toBeUndefined();
    const token = activationTokenFromEmail(ctx.email);
    const user = await ctx.prisma.user.findUnique({ where: { email } });
    expect(user.status).toBe('PENDING_ACTIVATION');
    expect(user.passwordHash).toBeNull();
    const access = await ctx.prisma.subscription.findUnique({ where: { companyId: user.companyId } });
    expect(access).toMatchObject({ status: 'ACTIVE', plan: COMMISSION_PLAN_CODE, priceCents: 0, currentPeriodEnd: null });
    expect(await ctx.prisma.payment.count()).toBe(0);

    const act = await c.post('/api/auth/activate', { token, password: STRONG_PASSWORD });
    expect(act.status).toBe(200);
    expect((await ctx.prisma.user.findUnique({ where: { email } })).status).toBe('ACTIVE');
    expect((await ctx.prisma.user.findUnique({ where: { email } })).emailVerifiedAt).toBeTruthy();
    expect((await c.get('/api/me')).status).toBe(200);
  });

  it('professional: there is no fee to pay', async () => {
    const c = client(ctx.app);
    await start(c, 'PERSON');
    await c.put('/api/onboarding/step', { step: 4, data: WORKER_PROFILE, complete: true });
    const pix = await c.post('/api/payments/pix');
    expect(pix.status).toBe(409);
    expect(await ctx.prisma.payment.count()).toBe(0);
  });

  it('company: one-time R$ 200 fee by Pix, then password; access never expires', async () => {
    const c = client(ctx.app);
    const { email, state } = await start(c, 'COMPANY');
    expect(state.signupFeeCents).toBe(20000);
    await c.put('/api/onboarding/step', { step: 9, data: PROFILE, complete: true });

    // No free pass for companies.
    const early = await c.post('/api/onboarding/finish');
    expect(early.status).toBe(409);
    expect(early.body.error.message).toContain('R$ 200,00');

    const pix = await c.post('/api/payments/pix');
    expect(pix.status).toBe(201);
    expect(pix.body.payment).toMatchObject({ amountCents: 20000, status: 'PENDING' });
    const stored = await ctx.prisma.payment.findUnique({ where: { id: pix.body.payment.id } });
    expect(stored.kind).toBe('SIGNUP_FEE');
    // Same pending Pix is reused, never a second charge.
    expect((await c.post('/api/payments/pix')).body.payment.id).toBe(pix.body.payment.id);

    const sim = await c.post(`/api/payments/${pix.body.payment.id}/simulate`);
    expect(sim.status).toBe(200);
    const user = await ctx.prisma.user.findUnique({ where: { email } });
    const access = await ctx.prisma.subscription.findUnique({ where: { companyId: user.companyId } });
    expect(access).toMatchObject({ status: 'ACTIVE', plan: COMMISSION_PLAN_CODE, currentPeriodEnd: null });

    const claim = await c.post(`/api/payments/${pix.body.payment.id}/activation`);
    expect(claim.body.emailVerificationRequired).toBe(true);
    const token = activationTokenFromEmail(ctx.email);
    expect((await c.post('/api/auth/activate', { token, password: STRONG_PASSWORD })).status).toBe(200);

    // Paid once: nothing expires and nothing more to pay.
    expect(await ctx.services.subscriptions.sweepExpired()).toBe(0);
    expect((await ctx.prisma.subscription.findUnique({ where: { id: access.id } })).status).toBe('ACTIVE');
    expect((await c.post('/api/payments/pix')).status).toBe(409);
    expect((await c.post('/api/subscription/cancel')).status).toBe(409);
  });

  it('refuses to finish before the profile is complete', async () => {
    const c = client(ctx.app);
    await start(c, 'PERSON');
    expect((await c.post('/api/onboarding/finish')).status).toBe(400);
    expect(await ctx.prisma.subscription.count()).toBe(0);
  });

  it('requires the onboarding session and a company name for companies', async () => {
    const anon = client(ctx.app);
    expect((await anon.post('/api/onboarding/finish')).status).toBe(401);
    const bad = await anon.post('/api/onboarding/start', { accountType: 'COMPANY', name: 'Bia', email: 'x@empresa.example', document: testCnpj() });
    expect(bad.status).toBe(400);
  });

  it('publishes the model in the public config', async () => {
    const res = await client(ctx.app).get('/api/config');
    expect(res.body.billing).toMatchObject({ model: 'commission', companySignupFeeCents: 20000 });
    expect(res.body.billing.commissionTiers.map((t) => t.rateBps)).toEqual([500, 400, 300, 200]);
    expect(res.body.billing.commissionLabel).toContain('5% a 2%');
  });
});

describe.skipIf(!hasDb)('commission model with the company fee waived', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp({ BILLING_MODEL: 'commission', COMPANY_SIGNUP_FEE_CENTS: '0' });
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });

  it('lets a company finish without paying', async () => {
    const c = client(ctx.app);
    await c.post('/api/onboarding/start', {
      accountType: 'COMPANY',
      name: 'Bia Lima',
      email: `free-${Date.now()}@empresa.example`,
      companyName: 'Construtora Lima',
      document: testCnpj(),
    });
    await c.put('/api/onboarding/step', { step: 9, data: PROFILE, complete: true });
    const fin = await c.post('/api/onboarding/finish');
    expect(fin.status).toBe(200);
    expect(fin.body).toMatchObject({ emailVerificationRequired: true, emailSent: true });
    expect(fin.body.token).toBeUndefined();
    expect(activationTokenFromEmail(ctx.email)).toBeTruthy();
    expect(await ctx.prisma.payment.count()).toBe(0);
  });
});
