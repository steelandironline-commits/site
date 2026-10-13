import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { disconnectPrisma, getPaymentProvider, crc16Check } from './paymentHelpers.js';
import { setupApp, resetDb, onboardToCheckout, client, hasDb, activationTokenFromEmail } from './helpers.js';

describe.skipIf(!hasDb)('payments', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  const mock = () => getPaymentProvider('mock', ctx.config);
  const sendWebhook = (wh, provider = 'mock') => {
    const req = request(ctx.app).post(`/api/webhooks/payment/${provider}`).set('Content-Type', 'application/json');
    for (const [k, v] of Object.entries(wh.headers)) req.set(k, v);
    return req.send(wh.rawBody);
  };

  it('creates a Pix charge with QR code and a valid BR Code', async () => {
    const { payment, companyId } = await onboardToCheckout(ctx.app);
    expect(payment.status).toBe('PENDING');
    expect(payment.amountCents).toBe(59700);
    expect(payment.pixQrCodeBase64.length).toBeGreaterThan(100);
    expect(payment.pixCopyPaste.startsWith('000201')).toBe(true);
    expect(crc16Check(payment.pixCopyPaste)).toBe(true);
    const sub = await ctx.prisma.subscription.findUnique({ where: { companyId } });
    expect(sub.status).toBe('PENDING');
    expect(sub.priceCents).toBe(59700);
  });

  it('reuses the live pending charge instead of creating duplicates', async () => {
    const { c, payment } = await onboardToCheckout(ctx.app);
    const again = await c.post('/api/payments/pix');
    expect(again.status).toBe(201);
    expect(again.body.payment.id).toBe(payment.id);
    expect(await ctx.prisma.payment.count()).toBe(1);
  });

  it('only the owner can read a payment', async () => {
    const a = await onboardToCheckout(ctx.app);
    const b = await onboardToCheckout(ctx.app);
    expect((await a.c.get(`/api/payments/${a.payment.id}`)).status).toBe(200);
    expect((await b.c.get(`/api/payments/${a.payment.id}`)).status).toBe(404);
    expect((await client(ctx.app).get(`/api/payments/${a.payment.id}`)).status).toBe(401);
  });

  it('rejects webhooks with invalid signatures', async () => {
    const { payment } = await onboardToCheckout(ctx.app);
    const providerPaymentId = (await ctx.prisma.payment.findUnique({ where: { id: payment.id } })).providerPaymentId;
    const wh = mock().buildWebhook(providerPaymentId, 'CONFIRMED');
    wh.headers['x-autopix-signature'] = 'f'.repeat(64);
    const res = await sendWebhook(wh);
    expect(res.status).toBe(401);
    expect((await ctx.prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('PENDING');

    const tampered = mock().buildWebhook(providerPaymentId, 'CONFIRMED');
    tampered.rawBody = tampered.rawBody.replace('CONFIRMED', 'REFUNDED');
    expect((await sendWebhook(tampered)).status).toBe(401);
  });

  it('rejects webhooks for providers that are not configured', async () => {
    const res = await request(ctx.app).post('/api/webhooks/payment/asaas').send({ event: 'PAYMENT_RECEIVED' });
    expect(res.status).toBe(404);
  });

  it('confirms payment → activates subscription → issues activation token, in one transaction', async () => {
    const { payment, companyId, email } = await onboardToCheckout(ctx.app);
    const { providerPaymentId } = await ctx.prisma.payment.findUnique({ where: { id: payment.id } });
    const res = await sendWebhook(mock().buildWebhook(providerPaymentId, 'CONFIRMED'));
    expect(res.status).toBe(200);

    const p = await ctx.prisma.payment.findUnique({ where: { id: payment.id } });
    expect(p.status).toBe('CONFIRMED');
    expect(p.paidAt).toBeTruthy();
    const sub = await ctx.prisma.subscription.findUnique({ where: { companyId } });
    expect(sub.status).toBe('ACTIVE');
    expect(sub.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    const user = await ctx.prisma.user.findUnique({ where: { email } });
    expect(user.status).toBe('PENDING_ACTIVATION');
    expect(user.passwordHash).toBeNull();
    expect(await ctx.prisma.activationToken.count({ where: { userId: user.id } })).toBe(1);
    expect(await ctx.prisma.searchJob.count({ where: { companyId, trigger: 'PAYMENT' } })).toBe(1);
    expect(ctx.email.outbox.at(-1).text).toContain('/activate/');
  });

  it('is idempotent: duplicate and concurrent deliveries activate exactly once', async () => {
    const { payment, companyId } = await onboardToCheckout(ctx.app);
    const { providerPaymentId } = await ctx.prisma.payment.findUnique({ where: { id: payment.id } });
    const wh = mock().buildWebhook(providerPaymentId, 'CONFIRMED', 'evt_same_id');

    const results = await Promise.all([sendWebhook(wh), sendWebhook(wh), sendWebhook(wh)]);
    results.forEach((r) => expect(r.status).toBe(200));
    const sub1 = await ctx.prisma.subscription.findUnique({ where: { companyId } });

    // A different event id carrying the same state must not extend the period again.
    await sendWebhook(mock().buildWebhook(providerPaymentId, 'CONFIRMED', 'evt_other_id'));
    const sub2 = await ctx.prisma.subscription.findUnique({ where: { companyId } });

    expect(sub2.currentPeriodEnd.getTime()).toBe(sub1.currentPeriodEnd.getTime());
    expect(await ctx.prisma.paymentEvent.count({ where: { providerEventId: 'evt_same_id' } })).toBe(1);
    expect(await ctx.prisma.activationToken.count()).toBe(1);
    expect(await ctx.prisma.searchJob.count({ where: { companyId } })).toBe(1);
    expect(await ctx.prisma.activityEvent.count({ where: { companyId, title: 'Pagamento confirmado' } })).toBe(1);
  });

  it('exposes the confirmed state and sends the activation link by e-mail, never in the API body', async () => {
    const { c, payment } = await onboardToCheckout(ctx.app);
    const early = await c.post(`/api/payments/${payment.id}/activation`);
    expect(early.status).toBe(409);
    await c.post(`/api/payments/${payment.id}/simulate`);
    const status = await c.get(`/api/payments/${payment.id}`);
    expect(status.body.payment.status).toBe('CONFIRMED');
    const claim = await c.post(`/api/payments/${payment.id}/activation`);
    expect(claim.status).toBe(200);
    expect(claim.body).toMatchObject({ emailVerificationRequired: true, emailSent: true });
    expect(claim.body.token).toBeUndefined();
    expect(activationTokenFromEmail(ctx.email)).toBeTruthy();

    const stranger = await onboardToCheckout(ctx.app);
    expect((await stranger.c.post(`/api/payments/${payment.id}/activation`)).status).toBe(404);
  });

  it('never simulates in production', async () => {
    const { PaymentService, loadConfig } = await import('@autopix/core');
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://x/y',
        APP_URL: 'https://autopix.example',
        SESSION_SECRET: 'x'.repeat(40),
        ACTIVATION_TOKEN_SECRET: 'y'.repeat(40),
        PASSWORD_RESET_SECRET: 'z'.repeat(40),
        PAYMENT_PROVIDER: 'mock',
        PAYMENT_ACCESS_TOKEN: 't',
        PAYMENT_WEBHOOK_SECRET: 'w'.repeat(40),
      }),
    ).toThrow(/mock is not allowed in production/);

    const { payment, companyId } = await onboardToCheckout(ctx.app);
    const prodLike = new PaymentService({ prisma: ctx.prisma, config: { ...ctx.config, isProduction: true } });
    await expect(prodLike.simulateConfirmation(payment.id, companyId)).rejects.toMatchObject({ status: 403 });
  });

  it('cancels the subscription at period end', async () => {
    const { createActiveUser } = await import('./helpers.js');
    const { c, companyId } = await createActiveUser(ctx.app);
    const res = await c.post('/api/subscription/cancel');
    expect(res.status).toBe(200);
    expect(res.body.subscription.cancelAtPeriodEnd).toBe(true);
    expect(res.body.subscription.status).toBe('ACTIVE');
    await ctx.prisma.subscription.update({ where: { companyId }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    await ctx.services.subscriptions.sweepExpired();
    expect((await ctx.prisma.subscription.findUnique({ where: { companyId } })).status).toBe('CANCELED');
  });
});
