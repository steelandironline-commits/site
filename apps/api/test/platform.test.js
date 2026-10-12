import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { disconnectPrisma, getPaymentProvider, AgentOrchestrator, JobQueue, decisionPayload } from '@autopix/core';
import { setupApp, resetDb, createActiveUser, client, hasDb, STRONG_PASSWORD } from './helpers.js';

const PHONE_INPUT = '(11) 98888-7777';
const WA_FROM = '5511988887777';

describe.skipIf(!hasDb)('platform: ActionEngine, EventEngine, WhatsApp, step-up', () => {
  let ctx;
  let wa; // MockWhatsAppProvider
  beforeAll(async () => {
    ctx = await setupApp();
    wa = ctx.services.whatsappProvider;
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    wa.sent.length = 0;
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  const inbound = (payload) => {
    const wh = wa.buildInbound(payload);
    const req = request(ctx.app).post('/api/webhooks/whatsapp').set('Content-Type', 'application/json');
    for (const [k, v] of Object.entries(wh.headers)) req.set(k, v);
    return req.send(wh.rawBody);
  };
  const lastSent = () => wa.sent[wa.sent.length - 1];

  async function linkWhatsApp(user) {
    const start = await user.c.post('/api/whatsapp/connection', { phoneNumber: PHONE_INPUT });
    expect(start.status).toBe(201);
    expect(start.body.connection.status).toBe('PENDING');
    const res = await inbound({ from: WA_FROM, text: `TEMPIX ${start.body.verification.code}` });
    expect(res.status).toBe(200);
    return start.body.verification.code;
  }

  async function runDemoCycle(companyId) {
    const queue = new JobQueue({ prisma: ctx.prisma });
    await ctx.prisma.searchJob.updateMany({ where: { companyId }, data: { status: 'QUEUED' } });
    const job = await queue.claim();
    const orchestrator = new AgentOrchestrator({ prisma: ctx.prisma, config: ctx.config, pacingMs: 0, events: ctx.services.events });
    const stats = await orchestrator.runJob(job);
    await queue.complete(job.id, stats);
    return stats;
  }

  // ------------------------------------------------------------------
  it('ACCEPTANCE 1: link WhatsApp → opportunity → notification → ABORDAR → state + activity on web', async () => {
    const user = await createActiveUser(ctx.app);

    // User links WhatsApp number → connection verified.
    await linkWhatsApp(user);
    const status = await user.c.get('/api/whatsapp');
    expect(status.body.connection.status).toBe('VERIFIED');
    expect(status.body.connection.phoneNumber).toContain('7777');
    expect(lastSent().text.body).toMatch(/vinculado/);

    // Opportunity is created by the agents → domain event generated.
    const stats = await runDemoCycle(user.companyId);
    expect(stats.opportunitiesCreated).toBeGreaterThan(0);
    const created = await ctx.prisma.domainEvent.findMany({ where: { companyId: user.companyId, type: { in: ['OPPORTUNITY_CREATED', 'OPPORTUNITY_HIGH_PRIORITY'] } } });
    expect(created.length).toBeGreaterThan(0);

    // EventEngine dispatch → WhatsApp notification request generated.
    await ctx.services.events.dispatchPending({ limit: 100 });
    const deliveries = await ctx.prisma.notificationDelivery.findMany({ where: { channel: 'WHATSAPP', userId: (await ctx.prisma.user.findFirst({ where: { companyId: user.companyId } })).id } });
    expect(deliveries.some((d) => d.status === 'SENT')).toBe(true);
    const outbound = await ctx.prisma.whatsAppMessage.findMany({ where: { direction: 'OUTBOUND', kind: 'sendOpportunityNotification' } });
    expect(outbound.length).toBeGreaterThan(0);
    const note = wa.sent.find((m) => m.type === 'interactive' && m.interactive.action.buttons.some((b) => b.reply.title === 'ABORDAR'));
    expect(note).toBeTruthy();
    expect(note.interactive.action.buttons.map((b) => b.reply.title)).toEqual(['ANALISAR', 'ABORDAR', 'DESCARTAR']);
    const abordar = note.interactive.action.buttons.find((b) => b.reply.title === 'ABORDAR').reply.id;
    const oppId = abordar.split(':')[3];

    // Dispatch is idempotent: running it again sends nothing new.
    const before = wa.sent.length;
    await ctx.prisma.domainEvent.updateMany({ data: { processedAt: null, lockedAt: null } });
    await ctx.services.events.dispatchPending({ limit: 100 });
    expect(wa.sent.length).toBe(before);

    // User selects ABORDAR → webhook → ActionEngine → domain service → DB.
    const res = await inbound({ from: WA_FROM, buttonId: abordar, buttonTitle: 'ABORDAR' });
    expect(res.status).toBe(200);
    const opp = await ctx.prisma.opportunity.findUnique({ where: { id: oppId } });
    expect(opp.status).toBe('CONTACTED');
    expect(opp.suggestedApproach).toMatch(/MENSAGEM SUGERIDA/);

    const log = await ctx.prisma.actionLog.findFirst({ where: { action: 'CONTACT_OPPORTUNITY' } });
    expect(log).toMatchObject({ channel: 'WHATSAPP', status: 'SUCCEEDED' });
    expect(await ctx.prisma.domainEvent.count({ where: { type: 'OPPORTUNITY_UPDATED', aggregateId: oppId } })).toBe(1);
    expect(lastSent().text.body).toMatch(/Em contato/);

    // Activity event created → visible on the web dashboard API.
    const feed = await user.c.get('/api/activity?type=OPPORTUNITY');
    const ev = feed.body.items.find((e) => e.opportunityId === oppId && e.title === 'Status alterado para Em contato');
    expect(ev).toBeTruthy();
    expect(ev.metadata.channel).toBe('WHATSAPP');

    // Replayed webhook (same message id) is ignored.
    const dupe = wa.buildInbound({ from: WA_FROM, buttonId: abordar, buttonTitle: 'ABORDAR', messageId: 'wamid.same' });
    for (let i = 0; i < 2; i += 1) {
      const r = request(ctx.app).post('/api/webhooks/whatsapp').set('Content-Type', 'application/json');
      for (const [k, v] of Object.entries(dupe.headers)) r.set(k, v);
      await r.send(dupe.rawBody);
    }
    expect(await ctx.prisma.whatsAppMessage.count({ where: { providerMessageId: 'wamid.same' } })).toBe(1);
  });

  // ------------------------------------------------------------------
  it('ACCEPTANCE 2: "gere Pix de 1400" → CREATE_PIX → confirm → charge → WhatsApp reply → provider webhook → PAYMENT_RECEIVED on web', async () => {
    const user = await createActiveUser(ctx.app);
    await linkWhatsApp(user);

    await inbound({ from: WA_FROM, text: 'gere um Pix de 1400' });
    const ask = lastSent();
    expect(ask.type).toBe('interactive');
    expect(ask.interactive.body.text).toMatch(/R\$ 1\.400,00/);
    const pending = await ctx.prisma.whatsAppPendingCommand.findFirst({ where: { status: 'PENDING' } });
    expect(pending).toMatchObject({ intent: 'CREATE_PIX', params: { amountCents: 140000 } });
    expect(await ctx.prisma.payment.count({ where: { kind: 'CHARGE' } })).toBe(0); // nothing before confirmation

    // User confirms.
    await inbound({ from: WA_FROM, text: 'sim' });
    const payment = await ctx.prisma.payment.findFirst({ where: { kind: 'CHARGE' } });
    expect(payment).toMatchObject({ amountCents: 140000, status: 'PENDING', provider: 'mock' });
    expect(payment.reference).toMatch(/^AP-/);
    const reply = lastSent().text.body;
    expect(reply).toContain('R$ 1.400,00');
    expect(reply).toContain(payment.reference);
    expect(reply).toContain(payment.pixCopyPaste);
    expect(payment.transactionId).toBeTruthy(); // WhatsApp CREATE_PIX → TemPix Pay SERVICE transaction
    expect(reply).toContain(`/app/pay/transactions/${payment.transactionId}`);
    expect(reply).not.toMatch(/secret|token/i);
    expect(await ctx.prisma.actionLog.count({ where: { action: 'CREATE_PIX', channel: 'WHATSAPP', status: 'SUCCEEDED' } })).toBe(1);

    // Financial provider webhook confirms payment.
    const wh = getPaymentProvider('mock', ctx.config).buildWebhook(payment.providerPaymentId, 'CONFIRMED');
    const r = request(ctx.app).post('/api/webhooks/payment/mock').set('Content-Type', 'application/json');
    for (const [k, v] of Object.entries(wh.headers)) r.set(k, v);
    expect((await r.send(wh.rawBody)).status).toBe(200);

    const paid = await ctx.prisma.payment.findUnique({ where: { id: payment.id } });
    // Mock default capabilities: no protectedFlow → nothing is "held" by TemPix.
    expect(paid).toMatchObject({ status: 'CONFIRMED', protectionStatus: 'NONE' });
    expect(await ctx.prisma.domainEvent.count({ where: { type: 'PAYMENT_RECEIVED', aggregateId: payment.transactionId } })).toBe(1);
    const tx = await ctx.prisma.marketplaceTransaction.findUnique({ where: { id: payment.transactionId } });
    expect(tx).toMatchObject({ status: 'PAID', type: 'SERVICE', grossAmount: 140000, commissionAmount: 2100, sellerNetAmount: 137900, settlementStatus: 'PENDING_PROVIDER_CAPABILITY' });

    // PAYMENT_RECEIVED appears on the web dashboard.
    const feed = await user.c.get('/api/activity?type=PAYMENT');
    expect(feed.body.items.some((e) => e.title === 'Pix recebido · R$ 1.400,00' && e.metadata.eventType === 'PAYMENT_RECEIVED')).toBe(true);
    const detail = await user.c.get(`/api/payments/${payment.id}`);
    expect(detail.body.payment).toMatchObject({ kind: 'CHARGE', protectionStatus: 'NONE', checkoutState: 'PAID' });
    // Subscription untouched by a customer charge.
    expect((await ctx.prisma.subscription.findUnique({ where: { companyId: user.companyId } })).status).toBe('ACTIVE');
  });

  // ------------------------------------------------------------------
  it('never executes actions for unverified numbers or bad signatures', async () => {
    const user = await createActiveUser(ctx.app);
    const opp = await ctx.prisma.opportunity.create({
      data: { companyId: user.companyId, targetKey: 'x', targetCompanyName: 'X', score: 90, confidence: 0.8, signal: 's' },
    });
    // Pending (not verified) number pressing a decision button.
    await user.c.post('/api/whatsapp/connection', { phoneNumber: PHONE_INPUT });
    await inbound({ from: WA_FROM, buttonId: decisionPayload('DESCARTAR', 'o', opp.id), buttonTitle: 'DESCARTAR' });
    expect((await ctx.prisma.opportunity.findUnique({ where: { id: opp.id } })).status).toBe('NEW');
    expect(await ctx.prisma.actionLog.count({ where: { channel: 'WHATSAPP' } })).toBe(0);

    // Wrong code is counted and rejected.
    await inbound({ from: WA_FROM, text: 'TEMPIX 000000' });
    const conn = await ctx.prisma.whatsAppConnection.findFirst();
    expect(conn.status).toBe('PENDING');
    expect(conn.verificationAttempts).toBe(1);

    // Bad signature.
    const wh = wa.buildInbound({ from: WA_FROM, text: 'oi' });
    const res = await request(ctx.app)
      .post('/api/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', 'sha256=deadbeef')
      .send(wh.rawBody);
    expect(res.status).toBe(401);

    // Another company's entity via a verified number → not found, no change.
    await linkWhatsApp({ c: user.c });
    const other = await createActiveUser(ctx.app);
    const foreign = await ctx.prisma.opportunity.create({
      data: { companyId: other.companyId, targetKey: 'y', targetCompanyName: 'Y', score: 90, confidence: 0.8, signal: 's' },
    });
    await inbound({ from: WA_FROM, buttonId: decisionPayload('DESCARTAR', 'o', foreign.id), buttonTitle: 'DESCARTAR' });
    expect((await ctx.prisma.opportunity.findUnique({ where: { id: foreign.id } })).status).toBe('NEW');
    expect(lastSent().text.body).toMatch(/não encontrada/i);
  });

  // ------------------------------------------------------------------
  it('step-up: fund release requires authenticated web confirmation, never WhatsApp alone', async () => {
    const user = await createActiveUser(ctx.app);
    await linkWhatsApp(user);
    const { body } = await user.c.post('/api/actions/CREATE_PIX', { input: { amountCents: 50000, description: 'Serviço de solda' } });
    expect(body.status).toBe('SUCCEEDED');
    const payment = body.result.payment;
    const wh = getPaymentProvider('mock', ctx.config).buildWebhook((await ctx.prisma.payment.findUnique({ where: { id: payment.id } })).providerPaymentId, 'CONFIRMED');
    const r = request(ctx.app).post('/api/webhooks/payment/mock').set('Content-Type', 'application/json');
    for (const [k, v] of Object.entries(wh.headers)) r.set(k, v);
    await r.send(wh.rawBody);

    // RELEASE_PAYMENT is not even available on the WhatsApp channel.
    const conn = await ctx.prisma.whatsAppConnection.findFirst();
    await expect(
      ctx.services.actions.execute({ action: 'RELEASE_PAYMENT', input: { id: payment.transactionId }, channel: 'WHATSAPP', actor: { userId: conn.userId, whatsappConnectionId: conn.id } }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await ctx.prisma.sensitiveActionChallenge.count({ where: { action: 'RELEASE_PAYMENT' } })).toBe(0);

    // Bank details change is itself sensitive.
    const bank = await user.c.post('/api/actions/CHANGE_BANK_DETAILS', { input: { pixKey: 'financeiro@empresa.example', pixKeyType: 'EMAIL' } });
    expect(bank.status).toBe(202);
    expect((await ctx.prisma.company.findUnique({ where: { id: user.companyId } })).payoutPixKey).toBeNull();
    const bad = await user.c.post(`/api/challenges/${bank.body.challenge.id}/confirm`, { password: 'senha-errada-123' });
    expect(bad.status).toBe(400);
    const ok = await user.c.post(`/api/challenges/${bank.body.challenge.id}/confirm`, { password: STRONG_PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('SUCCEEDED');
    expect((await ctx.prisma.company.findUnique({ where: { id: user.companyId } })).payoutPixKey).toBe('financeiro@empresa.example');
    expect((await user.c.post(`/api/challenges/${bank.body.challenge.id}/confirm`, { password: STRONG_PASSWORD })).status).toBe(409);

    // From the web: challenge first; another user's session can never confirm it.
    const rel = await user.c.post('/api/actions/RELEASE_PAYMENT', { input: { id: payment.transactionId } });
    expect(rel.status).toBe(202);
    expect(rel.body.challenge.confirmPath).toBe(`/app/confirm/${rel.body.challenge.id}`);
    const intruder = await createActiveUser(ctx.app);
    expect((await intruder.c.post(`/api/challenges/${rel.body.challenge.id}/confirm`, { password: STRONG_PASSWORD })).status).toBe(404);
    // Even confirmed, a provider without protected flow refuses: nothing is faked.
    const done = await user.c.post(`/api/challenges/${rel.body.challenge.id}/confirm`, { password: STRONG_PASSWORD });
    expect(done.status).toBe(409);
    expect(done.body.error.code).toBe('PROTECTED_FLOW_NOT_SUPPORTED');
    expect(await ctx.prisma.payout.count()).toBe(0);
    expect((await ctx.prisma.marketplaceTransaction.findUnique({ where: { id: payment.transactionId } })).status).toBe('PAID');
  });

  // ------------------------------------------------------------------
  it('ActionEngine: validation, authorization, audit and native bearer clients', async () => {
    const user = await createActiveUser(ctx.app);
    expect((await user.c.post('/api/actions/CREATE_PIX', { input: { amountCents: 5 } })).status).toBe(400);
    expect((await user.c.post('/api/actions/NOT_AN_ACTION', { input: {} })).status).toBe(404);
    expect(await ctx.prisma.actionLog.count({ where: { action: 'CREATE_PIX', status: 'REJECTED' } })).toBe(1);

    const catalog = await user.c.get('/api/actions');
    const names = catalog.body.items.map((a) => a.name);
    for (const n of ['CONTACT_OPPORTUNITY', 'ARCHIVE_OPPORTUNITY', 'ACCEPT_FREIGHT_MATCH', 'REJECT_FREIGHT_MATCH', 'CREATE_WORKFORCE_DEMAND', 'INVITE_PROFESSIONAL', 'CREATE_PIX', 'RELEASE_PAYMENT', 'OPEN_DISPUTE', 'START_AGENT', 'PAUSE_AGENT']) {
      expect(names).toContain(n);
    }
    expect(catalog.body.items.find((a) => a.name === 'RELEASE_PAYMENT').sensitive).toBe(true);

    // Onboarding-scoped sessions cannot execute business actions.
    const { onboardToCheckout } = await import('./helpers.js');
    const pending = await onboardToCheckout(ctx.app);
    expect((await pending.c.post('/api/actions/CREATE_PIX', { input: { amountCents: 10000 } })).status).toBe(401);

    // Native client: bearer token, no cookie, no CSRF header.
    const login = await request(ctx.app).post('/api/auth/native/login').set('X-Requested-With', 'autopix').send({ email: user.email, password: STRONG_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.headers['set-cookie']).toBeUndefined();
    const res = await request(ctx.app).post('/api/actions/PAUSE_AGENT').set('Authorization', `Bearer ${login.body.token}`).send({ input: {} });
    expect(res.status).toBe(200);
    expect((await ctx.prisma.company.findUnique({ where: { id: user.companyId } })).agentsPaused).toBe(true);
    expect(await ctx.prisma.actionLog.count({ where: { action: 'PAUSE_AGENT', channel: 'API' } })).toBe(1);
    const agents = await request(ctx.app).get('/api/agents').set('Authorization', `Bearer ${login.body.token}`);
    expect(agents.body.paused).toBe(true);
    expect(agents.body.items.every((a) => a.status === 'PAUSED')).toBe(true);
  });

  // ------------------------------------------------------------------
  it('notification preferences gate channels per category', async () => {
    const user = await createActiveUser(ctx.app);
    await linkWhatsApp(user);
    const prefs = await user.c.put('/api/notifications/preferences', { changes: [{ channel: 'WHATSAPP', category: 'OPPORTUNITIES', enabled: false }] });
    expect(prefs.body.preferences.WHATSAPP.OPPORTUNITIES).toBe(false);
    wa.sent.length = 0;
    await runDemoCycle(user.companyId);
    await ctx.services.events.dispatchPending({ limit: 100 });
    expect(wa.sent.filter((m) => m.type === 'interactive')).toHaveLength(0);
    expect(
      await ctx.prisma.notificationDelivery.count({ where: { channel: 'WHATSAPP', domainEvent: { type: { startsWith: 'OPPORTUNITY_' } } } }),
    ).toBe(0);
    // Other channels/categories are unaffected.
    expect(await ctx.prisma.domainEvent.count({ where: { type: 'OPPORTUNITY_CREATED' } })).toBeGreaterThan(0);
  });

  // ------------------------------------------------------------------
  it('freight and workforce commands via WhatsApp go through confirmation and the ActionEngine', async () => {
    const user = await createActiveUser(ctx.app);
    await linkWhatsApp(user);

    await inbound({ from: WA_FROM, text: 'procura carga de Santos para São Paulo amanhã' });
    expect(lastSent().interactive.body.text).toMatch(/Santos → São Paulo/);
    const confirmId = lastSent().interactive.action.buttons[0].reply.id;
    await inbound({ from: WA_FROM, buttonId: confirmId, buttonTitle: 'CONFIRMAR' });
    const req1 = await ctx.prisma.freightRequest.findFirst();
    expect(req1).toMatchObject({ origin: 'Santos', destination: 'São Paulo', isDemo: true });
    const match = await ctx.prisma.freightMatch.findFirst({ where: { isReturnLoad: false } });
    await inbound({ from: WA_FROM, buttonId: decisionPayload('TENHO INTERESSE', 'f', match.id), buttonTitle: 'TENHO INTERESSE' });
    expect((await ctx.prisma.freightMatch.findUnique({ where: { id: match.id } })).status).toBe('ACCEPTED');
    expect(await ctx.prisma.domainEvent.count({ where: { type: 'RETURN_LOAD_FOUND' } })).toBe(1);

    await inbound({ from: WA_FROM, text: 'preciso de 3 soldadores segunda' });
    await inbound({ from: WA_FROM, text: 'sim' });
    const demand = await ctx.prisma.workforceDemand.findFirst();
    expect(demand).toMatchObject({ role: 'Soldador', quantity: 3 });
    expect(new Date(demand.startDate).getUTCDay()).toBe(1);

    await inbound({ from: WA_FROM, text: 'quanto tenho em negócios abertos?' });
    expect(lastSent().text.body).toMatch(/negócio\(s\) em aberto/);
    await inbound({ from: WA_FROM, text: 'quais oportunidades apareceram hoje?' });
    expect(lastSent().text.body).toMatch(/oportunidade/i);

    // Deep-link targets resolve through the API.
    expect((await user.c.get(`/api/freight/matches/${match.id}`)).status).toBe(200);
    const wm = await ctx.prisma.workforceMatch.findFirst();
    expect((await user.c.get(`/api/workforce/matches/${wm.id}`)).status).toBe(200);
    const other = await createActiveUser(ctx.app);
    expect((await other.c.get(`/api/freight/matches/${match.id}`)).status).toBe(404);
  });

  it('cancelled pending commands never execute', async () => {
    const user = await createActiveUser(ctx.app);
    await linkWhatsApp(user);
    await inbound({ from: WA_FROM, text: 'gere um pix de 2 mil' });
    expect((await ctx.prisma.whatsAppPendingCommand.findFirst()).params.amountCents).toBe(200000);
    await inbound({ from: WA_FROM, text: 'não' });
    await inbound({ from: WA_FROM, text: 'sim' });
    expect(await ctx.prisma.payment.count({ where: { kind: 'CHARGE' } })).toBe(0);
    expect(lastSent().text.body).toMatch(/Não há nenhuma ação/);
    expect(client).toBeTruthy();
  });
});
