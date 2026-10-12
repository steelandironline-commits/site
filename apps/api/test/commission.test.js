import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { disconnectPrisma } from '@autopix/core';
import { COMMISSION_PLAN_CODE } from '@autopix/shared';
import { setupApp, resetDb, client, hasDb, PROFILE, STRONG_PASSWORD } from './helpers.js';

/** TemPix has no subscription: signup is free, the fee is a % of each contract. */
describe.skipIf(!hasDb)('commission billing model (no subscription)', () => {
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

  async function start(c, email = `livre-${Date.now()}@empresa.example`) {
    const res = await c.post('/api/onboarding/start', { name: 'Bia Lima', email, companyName: 'Transportes Lima' });
    expect(res.status).toBe(201);
    expect(res.body.billingModel).toBe('commission');
    return email;
  }

  it('activates without any charge once the profile is complete', async () => {
    const c = client(ctx.app);
    const email = await start(c);
    expect((await c.put('/api/onboarding/step', { step: 9, data: PROFILE, complete: true })).status).toBe(200);

    const fin = await c.post('/api/onboarding/finish');
    expect(fin.status).toBe(200);
    expect(typeof fin.body.token).toBe('string');

    const user = await ctx.prisma.user.findUnique({ where: { email } });
    expect(user.status).toBe('PENDING_ACTIVATION');
    expect(user.passwordHash).toBeNull();
    const access = await ctx.prisma.subscription.findUnique({ where: { companyId: user.companyId } });
    expect(access).toMatchObject({ status: 'ACTIVE', plan: COMMISSION_PLAN_CODE, priceCents: 0, currentPeriodEnd: null });
    expect(await ctx.prisma.payment.count()).toBe(0);

    // The owner chooses the password; then the account is fully active.
    const act = await c.post('/api/auth/activate', { token: fin.body.token, password: STRONG_PASSWORD });
    expect(act.status).toBe(200);
    expect((await ctx.prisma.user.findUnique({ where: { email } })).status).toBe('ACTIVE');
    const me = await c.get('/api/me');
    expect(me.status).toBe(200);
  });

  it('refuses to finish before the company profile is complete', async () => {
    const c = client(ctx.app);
    await start(c);
    const fin = await c.post('/api/onboarding/finish');
    expect(fin.status).toBe(400);
    expect(await ctx.prisma.subscription.count()).toBe(0);
  });

  it('requires the onboarding session', async () => {
    const anon = client(ctx.app);
    expect((await anon.post('/api/onboarding/finish')).status).toBe(401);
  });

  it('never creates a subscription charge', async () => {
    const c = client(ctx.app);
    await start(c);
    await c.put('/api/onboarding/step', { step: 9, data: PROFILE, complete: true });
    const pix = await c.post('/api/payments/pix');
    expect(pix.status).toBe(409);
    expect(pix.body.error.message).toContain('2%');
    expect(await ctx.prisma.payment.count()).toBe(0);
  });

  it('has nothing to cancel', async () => {
    const c = client(ctx.app);
    await start(c);
    await c.put('/api/onboarding/step', { step: 9, data: PROFILE, complete: true });
    const fin = await c.post('/api/onboarding/finish');
    await c.post('/api/auth/activate', { token: fin.body.token, password: STRONG_PASSWORD });
    const cancel = await c.post('/api/subscription/cancel');
    expect(cancel.status).toBe(409);
  });

  it('publishes the model in the public config', async () => {
    const res = await client(ctx.app).get('/api/config');
    expect(res.body.billing).toEqual({ model: 'commission', commissionRateBps: 200, commissionLabel: '2%' });
  });
});
