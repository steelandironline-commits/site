import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { disconnectPrisma, getPaymentProvider, buildPlatform, PAYMENTS_UNAVAILABLE_MESSAGE } from '@autopix/core';
import { setupApp, resetDb, createActiveUser, client, hasDb, STRONG_PASSWORD } from './helpers.js';
import { createApp } from '../src/app.js';

const WA_FROM = '5511977776666';

/** Shared helpers bound to a test context. */
function kit(ctx) {
  const mock = () => getPaymentProvider('mock', ctx.config);
  const act = (user, name, input) => user.c.post(`/api/actions/${name}`, { input });
  /** Sensitive action: request → challenge → password confirmation. */
  const actConfirmed = async (user, name, input) => {
    const first = await act(user, name, input);
    if (first.status !== 202) return first;
    return user.c.post(`/api/challenges/${first.body.challenge.id}/confirm`, { password: STRONG_PASSWORD });
  };
  const webhook = async (payment, status = 'CONFIRMED', extra = {}) => {
    const fresh = await ctx.prisma.payment.findUnique({ where: { id: payment.id } });
    const wh = mock().buildWebhook(fresh.providerPaymentId, status, undefined, extra);
    const r = request(ctx.app).post('/api/webhooks/payment/mock').set('Content-Type', 'application/json');
    for (const [k, v] of Object.entries(wh.headers)) r.set(k, v);
    return { res: await r.send(wh.rawBody), wh };
  };
  const replay = (wh) => {
    const r = request(ctx.app).post('/api/webhooks/payment/mock').set('Content-Type', 'application/json');
    for (const [k, v] of Object.entries(wh.headers)) r.set(k, v);
    return r.send(wh.rawBody);
  };
  const inbound = (payload) => {
    const wa = ctx.services.whatsappProvider;
    const wh = wa.buildInbound(payload);
    const req = request(ctx.app).post('/api/webhooks/whatsapp').set('Content-Type', 'application/json');
    for (const [k, v] of Object.entries(wh.headers)) req.set(k, v);
    return req.send(wh.rawBody);
  };
  const linkWhatsApp = async (user) => {
    const start = await user.c.post('/api/whatsapp/connection', { phoneNumber: '(11) 97777-6666' });
    await inbound({ from: WA_FROM, text: `TEMPIX ${start.body.verification.code}` });
  };
  const newTransaction = async (seller, input) => {
    const res = await act(seller, 'CREATE_TRANSACTION', input);
    expect(res.status).toBe(200);
    return res.body.result.transaction;
  };
  const payTransaction = async (seller, transactionId) => {
    const pix = await seller.c.post('/api/payments/pix', { transactionId, amountCents: 1 }); // client amount is ignored
    expect(pix.status).toBe(201);
    const { res } = await webhook(pix.body.payment);
    expect(res.status).toBe(200);
    return pix.body.payment;
  };
  /** Reconciliation as the worker would run it later. */
  const reconcile = () => ctx.services.reconciliation.run({ minAgeMs: 0, now: new Date(Date.now() + 60_000) });
  return { mock, act, actConfirmed, webhook, replay, inbound, linkWhatsApp, newTransaction, payTransaction, reconcile };
}

// =====================================================================
describe.skipIf(!hasDb)('TemPix Pay — standard Pix (no protected capability)', () => {
  let ctx;
  let k;
  beforeAll(async () => {
    ctx = await setupApp();
    k = kit(ctx);
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    ctx.services.whatsappProvider.sent.length = 0;
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('ACCEPTANCE (standard Pix): R$1.400 → commission R$28 / net R$1.372 → PAID → dashboard + WhatsApp → persisted after restart', async () => {
    const seller = await createActiveUser(ctx.app);
    const buyer = await createActiveUser(ctx.app);
    await k.linkWhatsApp(seller);

    const caps = await seller.c.get('/api/pay/capabilities');
    expect(caps.body).toMatchObject({ provider: 'mock', sandbox: true, capabilities: { pix: true, refund: true, protectedFlow: false, split: false, payout: false } });
    expect(caps.body.protectedPayment.enabled).toBe(false);

    const quote = await seller.c.get('/api/pay/commission/quote?grossCents=140000');
    expect(quote.body.quote).toMatchObject({ grossCents: 140000, commissionCents: 2800, sellerNetCents: 137200, rateBps: 200 });

    const t = await k.newTransaction(seller, { grossCents: 140000, description: 'Manutenção de caldeira', buyerEmail: buyer.email });
    expect(t).toMatchObject({ status: 'DRAFT', type: 'SERVICE', grossAmount: 140000, commissionAmount: 2800, sellerNetAmount: 137200, protectedFlow: false, isSandbox: true });

    // Server-side amount: the client's amountCents is ignored.
    const payment = await k.payTransaction(seller, t.id);
    expect(payment).toMatchObject({ amountCents: 140000, transactionId: t.id, isSandbox: true });

    const paid = await ctx.prisma.marketplaceTransaction.findUnique({ where: { id: t.id } });
    expect(paid).toMatchObject({ status: 'PAID', settlementStatus: 'PENDING_PROVIDER_CAPABILITY' });
    expect((await ctx.prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('CONFIRMED');

    // Dashboard (both parties) and TemPix Pay metrics.
    for (const u of [seller, buyer]) {
      const feed = await u.c.get('/api/activity?type=PAYMENT');
      expect(feed.body.items.some((e) => e.title === 'Pix recebido · R$ 1.400,00')).toBe(true);
    }
    const sum = await seller.c.get('/api/pay/summary');
    expect(sum.body.summary).toMatchObject({ receivedCents: 140000, commissionsCents: 2800, toReleaseCents: 0 });
    expect(sum.body.sandbox).toBe(true);

    // WhatsApp: text + deep link, never a money button.
    await ctx.services.events.dispatchPending({ limit: 100 });
    const texts = ctx.services.whatsappProvider.sent.map((m) => m.text?.body || m.interactive?.body?.text || '').join('\n---\n');
    expect(texts).toContain('💳 Cobrança TemPix criada');
    expect(texts).toContain('✅ Pix recebido');
    expect(texts).toContain(`/app/pay/transactions/${t.id}`);
    expect(texts).toContain('[SANDBOX]');
    expect(texts).not.toMatch(/LIBERAR|token=|secret/i);

    // Restart: a brand-new platform instance reads the same persisted state.
    const restarted = createApp({ services: buildPlatform({ prisma: ctx.prisma, config: ctx.config, email: ctx.email }), hub: { mode: 'test', subscribe: () => () => {} }, serveWeb: false });
    const login = await request(restarted).post('/api/auth/native/login').set('X-Requested-With', 'autopix').send({ email: seller.email, password: STRONG_PASSWORD });
    const again = await request(restarted).get(`/api/pay/transactions/${t.id}`).set('Authorization', `Bearer ${login.body.token}`);
    expect(again.status).toBe(200);
    expect(again.body.transaction.status).toBe('PAID');
    expect(again.body.transaction.timeline.map((e) => e.type)).toEqual(expect.arrayContaining(['CREATED', 'COMMISSION', 'PIX_CREATED', 'PAYMENT_RECEIVED', 'SETTLEMENT_PENDING']));

    // Audit trail is append-only.
    const audit = await ctx.prisma.financialAuditLog.findMany({ where: { transactionId: t.id } });
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['TRANSACTION_CREATED', 'PIX_CHARGE_CREATED', 'PAYMENT_CONFIRMED', 'TRANSACTION_PAID']));
    await expect(ctx.prisma.financialAuditLog.update({ where: { id: audit[0].id }, data: { action: 'X' } })).rejects.toThrow(/append-only/);
    await expect(ctx.prisma.financialAuditLog.delete({ where: { id: audit[0].id } })).rejects.toThrow(/append-only/);
  });

  it('webhooks are idempotent, hashed and never confirm a different amount', async () => {
    const seller = await createActiveUser(ctx.app);
    const t = await k.newTransaction(seller, { grossCents: 50000, description: 'Serviço' });
    const pix = await seller.c.post('/api/payments/pix', { transactionId: t.id });
    const { wh } = await k.webhook(pix.body.payment);
    await Promise.all([k.replay(wh), k.replay(wh)]);
    const events = await ctx.prisma.paymentEvent.findMany({ where: { provider: 'mock', providerPaymentId: wh.body.data.paymentId } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ processingStatus: 'PROCESSED', processed: true });
    expect(events[0].payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await ctx.prisma.domainEvent.count({ where: { type: 'PAYMENT_RECEIVED', aggregateId: t.id } })).toBe(1);

    // Amount mismatch: flagged for a human, payment untouched.
    const t2 = await k.newTransaction(seller, { grossCents: 90000, description: 'Outro serviço' });
    const pix2 = await seller.c.post('/api/payments/pix', { transactionId: t2.id });
    await k.webhook(pix2.body.payment, 'CONFIRMED', { amountCents: 100 });
    expect((await ctx.prisma.payment.findUnique({ where: { id: pix2.body.payment.id } })).status).toBe('PENDING');
    expect((await ctx.prisma.marketplaceTransaction.findUnique({ where: { id: t2.id } })).status).toBe('AWAITING_PAYMENT');
    expect(await ctx.prisma.reconciliationIssue.findFirst({ where: { paymentId: pix2.body.payment.id } })).toMatchObject({ kind: 'AMOUNT_MISMATCH', status: 'OPEN' });
    expect(await ctx.prisma.paymentEvent.findFirst({ where: { paymentId: pix2.body.payment.id } })).toMatchObject({ processingStatus: 'FLAGGED' });

    // Invalid signature: rejected and traced (hash only).
    const bad = await request(ctx.app).post('/api/webhooks/payment/mock').set('Content-Type', 'application/json').set('x-autopix-signature', 'nope').send('{"id":"x"}');
    expect(bad.status).toBe(401);
    expect(await ctx.prisma.paymentEvent.count({ where: { processingStatus: 'FAILED', type: 'rejected' } })).toBe(1);
  });

  it('reconciliation repairs a missed webhook only when the amount matches, and records it', async () => {
    const seller = await createActiveUser(ctx.app);
    const t = await k.newTransaction(seller, { grossCents: 70000, description: 'Serviço' });
    const pix = await seller.c.post('/api/payments/pix', { transactionId: t.id });
    const p = await ctx.prisma.payment.findUnique({ where: { id: pix.body.payment.id } });
    k.mock().state.set(p.providerPaymentId, { status: 'CONFIRMED', amountCents: 70000 }); // paid, webhook lost
    const stats = await k.reconcile();
    expect(stats.repaired).toBe(1);
    expect((await ctx.prisma.payment.findUnique({ where: { id: p.id } })).status).toBe('CONFIRMED');
    expect((await ctx.prisma.marketplaceTransaction.findUnique({ where: { id: t.id } })).status).toBe('PAID');
    expect(await ctx.prisma.reconciliationIssue.findFirst({ where: { paymentId: p.id } })).toMatchObject({ kind: 'MISSED_WEBHOOK', status: 'AUTO_REPAIRED' });

    const t2 = await k.newTransaction(seller, { grossCents: 80000, description: 'Serviço 2' });
    const pix2 = await seller.c.post('/api/payments/pix', { transactionId: t2.id });
    const p2 = await ctx.prisma.payment.findUnique({ where: { id: pix2.body.payment.id } });
    k.mock().state.set(p2.providerPaymentId, { status: 'CONFIRMED', amountCents: 79000 });
    await k.reconcile();
    expect((await ctx.prisma.payment.findUnique({ where: { id: p2.id } })).status).toBe('PENDING'); // never silently resolved
    expect(await ctx.prisma.reconciliationIssue.findFirst({ where: { paymentId: p2.id } })).toMatchObject({ kind: 'AMOUNT_MISMATCH', status: 'OPEN' });
  });

  it('refunds: partial then full, completed only after provider confirmation', async () => {
    const seller = await createActiveUser(ctx.app);
    const t = await k.newTransaction(seller, { grossCents: 140000, description: 'Serviço' });
    const payment = await k.payTransaction(seller, t.id);

    expect((await k.act(seller, 'REFUND_PAYMENT', { id: t.id, amountCents: 999999 })).status).toBe(202); // sensitive: challenge first
    const tooMuch = await k.actConfirmed(seller, 'REFUND_PAYMENT', { id: t.id, amountCents: 999999 });
    expect(tooMuch.status).toBe(400);

    const partial = await k.actConfirmed(seller, 'REFUND_PAYMENT', { id: t.id, amountCents: 40000, reason: 'Ajuste' });
    expect(partial.status).toBe(200);
    expect(partial.body.result.refund).toMatchObject({ status: 'PROCESSING', amountCents: 40000 });
    expect((await ctx.prisma.payment.findUnique({ where: { id: payment.id } })).refundedCents).toBe(0); // not before confirmation

    k.mock().completeRefund(partial.body.result.refund.idempotencyKey);
    await k.reconcile();
    expect(await ctx.prisma.refund.findUnique({ where: { id: partial.body.result.refund.id } })).toMatchObject({ status: 'COMPLETED' });
    expect(await ctx.prisma.payment.findUnique({ where: { id: payment.id } })).toMatchObject({ status: 'CONFIRMED', refundedCents: 40000 });
    expect((await ctx.prisma.marketplaceTransaction.findUnique({ where: { id: t.id } })).status).toBe('PAID');

    const rest = await k.actConfirmed(seller, 'REFUND_PAYMENT', { id: t.id });
    expect(rest.body.result.refund.amountCents).toBe(100000);
    k.mock().completeRefund(rest.body.result.refund.idempotencyKey);
    await k.reconcile();
    expect(await ctx.prisma.payment.findUnique({ where: { id: payment.id } })).toMatchObject({ status: 'REFUNDED', refundedCents: 140000 });
    expect((await ctx.prisma.marketplaceTransaction.findUnique({ where: { id: t.id } })).status).toBe('REFUNDED');
    expect(await ctx.prisma.domainEvent.count({ where: { type: 'PAYMENT_REFUNDED', aggregateId: t.id } })).toBeGreaterThanOrEqual(2);
  });

  it('isolation: other companies cannot see or act on a transaction; admin screens are restricted', async () => {
    const seller = await createActiveUser(ctx.app);
    const stranger = await createActiveUser(ctx.app);
    const t = await k.newTransaction(seller, { grossCents: 10000, description: 'Serviço' });
    expect((await stranger.c.get(`/api/pay/transactions/${t.id}`)).status).toBe(404);
    expect((await k.act(stranger, 'CANCEL_TRANSACTION', { id: t.id })).status).toBe(404);
    expect((await stranger.c.get('/api/admin/overview')).status).toBe(403);
    expect((await k.act(stranger, 'RESOLVE_RECONCILIATION_ISSUE', { id: 'x', status: 'RESOLVED', note: 'tentativa indevida' })).status).toBe(403);

    await ctx.prisma.user.updateMany({ where: { email: stranger.email }, data: { isPlatformAdmin: true } });
    const overview = await stranger.c.get('/api/admin/overview');
    expect(overview.status).toBe(200);
    expect(overview.body.overview).toHaveProperty('openIssues');
    // No admin route can edit financial state.
    expect((await stranger.c.patch(`/api/admin/payments/${t.id}`, { status: 'CONFIRMED' })).status).toBe(404);
  });
});

// =====================================================================
describe.skipIf(!hasDb)('TemPix Pay — protected payment (provider with protectedFlow + payout)', () => {
  let ctx;
  let k;
  beforeAll(async () => {
    ctx = await setupApp({ MOCK_PAYMENT_CAPABILITIES: 'protectedFlow,payout' });
    k = kit(ctx);
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });

  async function setPayoutKey(user) {
    const res = await k.actConfirmed(user, 'CHANGE_BANK_DETAILS', { pixKey: 'financeiro@prestador.example', pixKeyType: 'EMAIL' });
    expect(res.status).toBe(200);
  }

  it('ACCEPTANCE (protected): paid → protected → completion → buyer confirms → release with step-up → payout via provider', async () => {
    const seller = await createActiveUser(ctx.app);
    const buyer = await createActiveUser(ctx.app);
    await setPayoutKey(seller);
    const t = await k.newTransaction(seller, { grossCents: 140000, description: 'Montagem industrial', buyerEmail: buyer.email });
    expect(t.protectedFlow).toBe(true);
    const payment = await k.payTransaction(seller, t.id);

    expect(await ctx.prisma.marketplaceTransaction.findUnique({ where: { id: t.id } })).toMatchObject({ status: 'PROTECTED', settlementStatus: 'HELD_BY_PROVIDER' });
    expect((await ctx.prisma.payment.findUnique({ where: { id: payment.id } })).protectionStatus).toBe('HELD');
    expect(await ctx.prisma.domainEvent.count({ where: { type: 'PROTECTED_PAYMENT_CREATED', aggregateId: t.id } })).toBe(2); // seller + buyer
    expect((await buyer.c.get('/api/activity?type=PAYMENT')).body.items.some((e) => e.title === 'Pagamento recebido e aguardando conclusão')).toBe(true);

    // Premature release attempts fail.
    expect((await k.actConfirmed(buyer, 'RELEASE_PAYMENT', { id: t.id })).status).toBe(409);
    expect((await k.act(buyer, 'CONFIRM_COMPLETION', { id: t.id })).status).toBe(409); // seller has not reported completion

    expect((await k.act(seller, 'REPORT_COMPLETION', { id: t.id })).status).toBe(200);
    expect((await k.act(seller, 'REQUEST_RELEASE', { id: t.id })).status).toBe(200);
    const buyerView = await buyer.c.get(`/api/pay/transactions/${t.id}`);
    expect(buyerView.body.role).toBe('BUYER');
    expect(buyerView.body.allowedActions).toContain('CONFIRM_COMPLETION');
    expect(buyerView.body.allowedActions).not.toContain('RELEASE_PAYMENT');

    // The seller can never release its own money.
    expect((await k.actConfirmed(seller, 'RELEASE_PAYMENT', { id: t.id })).status).toBe(403);

    expect((await k.act(buyer, 'CONFIRM_COMPLETION', { id: t.id })).status).toBe(200);
    expect((await ctx.prisma.marketplaceTransaction.findUnique({ where: { id: t.id } })).status).toBe('READY_TO_RELEASE');
    expect(await ctx.prisma.payout.count()).toBe(0); // confirmation alone moves no money

    const rel = await k.actConfirmed(buyer, 'RELEASE_PAYMENT', { id: t.id });
    expect(rel.status).toBe(200);
    expect(rel.body.result.transaction).toMatchObject({ status: 'RELEASED', settlementStatus: 'PAYOUT_COMPLETED' });
    const payout = await ctx.prisma.payout.findFirst({ where: { transactionId: t.id } });
    expect(payout).toMatchObject({ amountCents: 137200, status: 'COMPLETED', idempotencyKey: `release-${t.id}` });
    for (const type of ['PROTECTED_PAYMENT_RELEASED', 'PAYOUT_CREATED', 'PAYOUT_CONFIRMED']) {
      expect(await ctx.prisma.domainEvent.count({ where: { type, aggregateId: t.id } })).toBeGreaterThanOrEqual(1);
    }
    expect(await ctx.prisma.financialAuditLog.count({ where: { transactionId: t.id, action: 'PAYMENT_RELEASED' } })).toBe(1);

    // Exactly once.
    expect((await k.actConfirmed(buyer, 'RELEASE_PAYMENT', { id: t.id })).status).toBe(409);
    expect(await ctx.prisma.payout.count()).toBe(1);
  });

  it('ACCEPTANCE (freight Santos → Campinas, R$4.800): geofence arrival notifies but never releases money', async () => {
    const carrier = await createActiveUser(ctx.app);
    const shipper = await createActiveUser(ctx.app);
    await setPayoutKey(carrier);
    const match = await ctx.prisma.freightMatch.create({
      data: { companyId: carrier.companyId, origin: 'Santos - SP', destination: 'Campinas - SP', cargo: 'Bobinas de aço', price: 4800, status: 'ACCEPTED', source: 'test' },
    });

    // Amount comes from the freight reference — the client's grossCents is ignored.
    const t = await k.newTransaction(carrier, { referenceType: 'freightMatch', referenceId: match.id, grossCents: 100, buyerEmail: shipper.email });
    expect(t).toMatchObject({ type: 'FREIGHT', grossAmount: 480000, commissionAmount: 9600, sellerNetAmount: 470400, protectedFlow: true });
    await k.payTransaction(carrier, t.id);

    // Location requires explicit consent for this trip.
    const loc = (lat, lng) => k.act(carrier, 'RECORD_LOCATION', { matchId: match.id, latitude: lat, longitude: lng, accuracyM: 20 });
    expect((await loc(-23.96, -46.33)).status).toBe(403);
    expect((await k.act(carrier, 'CONSENT_TRIP_TRACKING', { matchId: match.id })).status).toBe(200);
    expect((await k.act(carrier, 'START_TRIP', { matchId: match.id })).status).toBe(200);

    expect((await loc(-23.9608, -46.3336)).body.result.milestones).toEqual(['DRIVER_ARRIVED_PICKUP']);
    expect((await k.act(carrier, 'MARK_CARGO_LOADED', { matchId: match.id })).status).toBe(200);
    expect((await loc(-23.4, -46.7)).body.result.milestones).toEqual([]); // en route
    expect((await loc(-22.93, -47.06)).body.result.milestones).toEqual(['NEAR_DESTINATION']); // ~3 km
    const arrived = await loc(-22.9057, -47.0609);
    expect(arrived.body.result).toMatchObject({ tripStatus: 'AT_DESTINATION', milestones: ['DRIVER_ARRIVED_DESTINATION'] });

    // Arrival: buyer notified; money untouched.
    expect((await shipper.c.get('/api/activity?type=SYSTEM')).body.items.some((e) => e.title === '🚛 O transporte chegou ao destino.')).toBe(true);
    expect((await ctx.prisma.marketplaceTransaction.findUnique({ where: { id: t.id } })).status).toBe('PROTECTED');
    expect(await ctx.prisma.payout.count()).toBe(0);

    // Location privacy: the shipper never receives coordinates.
    const view = await shipper.c.get(`/api/pay/transactions/${t.id}`);
    expect(view.body.transaction.trip.events.length).toBeGreaterThan(0);
    expect(JSON.stringify(view.body.transaction.trip)).not.toMatch(/latitude|longitude|-22\.9|-46\.3/);
    const carrierView = await carrier.c.get(`/api/pay/transactions/${t.id}`);
    expect(carrierView.body.transaction.trip.events.some((e) => e.latitude != null)).toBe(true);

    // Human confirmation → ready; release is still a separate, step-up action.
    expect((await k.act(shipper, 'CONFIRM_DELIVERY', { id: t.id })).status).toBe(200);
    expect((await ctx.prisma.marketplaceTransaction.findUnique({ where: { id: t.id } })).status).toBe('READY_TO_RELEASE');
    expect(await ctx.prisma.payout.count()).toBe(0);
    const rel = await k.actConfirmed(shipper, 'RELEASE_PAYMENT', { id: t.id });
    expect(rel.status).toBe(200);
    expect(await ctx.prisma.payout.findFirst({ where: { transactionId: t.id } })).toMatchObject({ amountCents: 470400, status: 'COMPLETED' });
  });

  it('disputes freeze release; only a platform admin (human, step-up) resolves; refund completes on provider confirmation', async () => {
    const seller = await createActiveUser(ctx.app);
    const buyer = await createActiveUser(ctx.app);
    const admin = await createActiveUser(ctx.app);
    await ctx.prisma.user.updateMany({ where: { email: admin.email }, data: { isPlatformAdmin: true } });
    const t = await k.newTransaction(seller, { grossCents: 200000, description: 'Reforma', buyerEmail: buyer.email });
    const payment = await k.payTransaction(seller, t.id);

    const open = await k.act(buyer, 'OPEN_DISPUTE', { id: t.id, reason: 'Serviço incompleto', description: 'Faltou a pintura.' });
    expect(open.status).toBe(200);
    expect((await ctx.prisma.marketplaceTransaction.findUnique({ where: { id: t.id } })).status).toBe('DISPUTED');
    expect((await k.act(seller, 'REPORT_COMPLETION', { id: t.id })).status).toBe(409);
    expect((await k.actConfirmed(buyer, 'RELEASE_PAYMENT', { id: t.id })).status).toBe(409);
    expect((await k.actConfirmed(seller, 'REFUND_PAYMENT', { id: t.id })).status).toBe(409); // decided in the dispute

    expect((await k.act(seller, 'RESPOND_DISPUTE', { id: open.body.result.dispute.id, message: 'A pintura foi combinada à parte.' })).status).toBe(200);
    const summary = await admin.c.post(`/api/admin/disputes/${open.body.result.dispute.id}/summary`);
    expect(summary.body.summary.note).toMatch(/decisão é sempre humana/);

    // Parties cannot resolve; the admin needs the step-up challenge.
    expect((await k.act(buyer, 'RESOLVE_DISPUTE', { id: open.body.result.dispute.id, outcome: 'BUYER', note: 'tentando decidir sozinho' })).status).toBe(403);
    expect((await k.act(admin, 'RESOLVE_DISPUTE', { id: open.body.result.dispute.id, outcome: 'BUYER', note: 'Evidências confirmam serviço incompleto.' })).status).toBe(202);
    const resolved = await k.actConfirmed(admin, 'RESOLVE_DISPUTE', { id: open.body.result.dispute.id, outcome: 'BUYER', note: 'Evidências confirmam serviço incompleto.' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.result.dispute.status).toBe('RESOLVED_BUYER');
    expect(resolved.body.result.refund.status).toBe('PROCESSING');
    expect((await ctx.prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('CONFIRMED'); // not refunded yet

    k.mock().completeRefund(resolved.body.result.refund.idempotencyKey);
    await k.reconcile();
    expect((await ctx.prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('REFUNDED');
    expect((await ctx.prisma.marketplaceTransaction.findUnique({ where: { id: t.id } })).status).toBe('REFUNDED');
    expect(await ctx.prisma.financialAuditLog.count({ where: { transactionId: t.id, action: 'DISPUTE_RESOLVED', source: 'ADMIN' } })).toBe(1);
  });
});

// =====================================================================
describe.skipIf(!hasDb)('TemPix Pay — Banco do Brasil provider boundary', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp({
      PAYMENT_PROVIDER: 'banco-do-brasil',
      BB_ENVIRONMENT: 'sandbox',
      BB_CLIENT_ID: 'test-client',
      BB_CLIENT_SECRET: 'test-secret',
      BB_DEVELOPER_APPLICATION_KEY: 'test-app-key',
      BB_PIX_KEY: 'chave@example.com',
      BB_WEBHOOK_SECRET: 'bb-webhook-secret-0123456789abcdef01234567',
      BB_PROTECTED_PAYMENT_ENABLED: 'true',
      BB_PAYOUT_ENABLED: 'true',
      BB_API_BASE_URL: 'http://127.0.0.1:9/pix/v2', // unroutable: no live call can ever succeed
      BB_OAUTH_URL: 'http://127.0.0.1:9/oauth/token',
    });
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });

  it('protected payment stays unavailable even with BB flags on (contract integration not implemented)', async () => {
    const caps = ctx.services.transactions.capabilities();
    expect(caps).toMatchObject({ provider: 'banco_do_brasil', label: 'Banco do Brasil', sandbox: true });
    expect(caps.capabilities).toMatchObject({ pix: true, pixWebhook: true, refund: true, protectedFlow: false, payout: false, split: false, bbPayRedirect: false });
    const st = ctx.services.protectedPayments.status();
    expect(st.enabled).toBe(false);
    expect(st.reason).toMatch(/não foi implementada|não contratado/);
    await expect(ctx.services.protectedPayments.release({ user: { id: 'u' }, company: { id: 'c' }, id: 'x' })).rejects.toMatchObject({ code: 'PROTECTED_FLOW_NOT_SUPPORTED' });
  });

  it('BB webhook endpoint (and BACEN /pix suffix) rejects deliveries without the shared token', async () => {
    const body = JSON.stringify({ pix: [{ endToEndId: 'E1', txid: 'APabc000000000000000000000', valor: '1400.00' }] });
    for (const path of ['/api/webhooks/payment/banco-do-brasil', '/api/webhooks/payment/banco-do-brasil/pix']) {
      const res = await request(ctx.app).post(path).set('Content-Type', 'application/json').send(body);
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toMatch(/secret|token=/i);
    }
    const ok = await request(ctx.app).post('/api/webhooks/payment/banco-do-brasil/pix?token=bb-webhook-secret-0123456789abcdef01234567').set('Content-Type', 'application/json').send('{}');
    expect(ok.status).toBe(400); // authenticated but malformed
    expect(await ctx.prisma.payment.count()).toBe(0);
  });
});

// =====================================================================
describe.skipIf(!hasDb)('TemPix Pay — gateway disabled (PAYMENT_PROVIDER=none)', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp({ PAYMENT_PROVIDER: 'none' });
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('the app runs, but no Pix charge is created and nothing is recorded', async () => {
    const c = client(ctx.app);
    const start = await c.post('/api/onboarding/start', { name: 'Ana', email: `sem-gateway-${Date.now()}@empresa.example`, companyName: 'Sem Gateway' });
    expect(start.status).toBe(201);
    const pix = await c.post('/api/payments/pix', {});
    expect(pix.status).toBe(503);
    expect(pix.body.error.message).toBe(PAYMENTS_UNAVAILABLE_MESSAGE);
    expect(await ctx.prisma.payment.count()).toBe(0);
    expect((await c.get('/api/pay/capabilities')).status).toBe(401); // onboarding session has no TemPix Pay access
    const config = await request(ctx.app).get('/api/config');
    expect(config.body.paymentProvider).toBe('none');
    expect(config.body.simulationAvailable).toBe(false);
  });
});
