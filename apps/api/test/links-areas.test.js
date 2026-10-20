import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { disconnectPrisma, decisionPayload } from '@autopix/core';
import { setupApp, resetDb, hasDb, testCpf } from './helpers.js';
import { AREA_ENV, CNPJ_HOST, DEV_COOKIE, call, insertSession, makeAccount } from './authAreaHelpers.js';

// 4b · links montados no host da área do destinatário: WhatsApp de entrada (botão e comando) e o
// convite de colaborador. NotificationRouter e o provedor, sem banco, estão em
// packages/core/test/links.areas.unit.test.js.

const LEGACY_URL = 'http://localhost:5173';
const COMPANY_URL = `http://${CNPJ_HOST}`;
const PERSON_URL = 'http://cpf.temcnpj.com.br';

function inboundTo(ctx) {
  const wa = ctx.services.whatsappProvider;
  return (payload) => {
    const wh = wa.buildInbound(payload);
    const req = request(ctx.app).post('/api/webhooks/whatsapp').set('Content-Type', 'application/json');
    for (const [k, v] of Object.entries(wh.headers)) req.set(k, v);
    return req.send(wh.rawBody);
  };
}

const phoneOf = async (ctx, account) => (await ctx.prisma.whatsAppConnection.findUnique({ where: { userId: account.user.id } })).phoneNumber;
const texts = (wa) => wa.sent.map((m) => m.text?.body ?? m.interactive?.body?.text ?? '');

describe.skipIf(!hasDb)('links por área · modo de áreas', () => {
  let ctx;
  let inbound;
  let company;
  let person;
  let ownerToken;

  beforeAll(async () => {
    ctx = await setupApp(AREA_ENV);
    await resetDb(ctx.prisma);
    inbound = inboundTo(ctx);
    company = await makeAccount(ctx.prisma, { accountType: 'COMPANY', whatsapp: true });
    person = await makeAccount(ctx.prisma, { accountType: 'PERSON', whatsapp: true });
    ownerToken = (await insertSession(ctx.prisma, ctx.config, { userId: company.user.id, area: 'CNPJ' })).token;
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('o botão de navegação responde com o link no host da área de quem apertou', async () => {
    const wa = ctx.services.whatsappProvider;
    wa.sent.length = 0;
    await inbound({ from: await phoneOf(ctx, company), buttonId: decisionPayload('ABRIR TEMPIX', 'w', 'abc123'), buttonTitle: 'ABRIR TEMPIX' });
    expect(texts(wa).at(-1)).toBe(`Abra no TemPix: ${COMPANY_URL}/app/workforce/matches/abc123`);
    await inbound({ from: await phoneOf(ctx, person), buttonId: decisionPayload('ABRIR TEMPIX', 'w', 'abc123'), buttonTitle: 'ABRIR TEMPIX' });
    expect(texts(wa).at(-1)).toBe(`Abra no TemPix: ${PERSON_URL}/app/workforce/matches/abc123`);
  });

  it('a cobrança Pix pedida por WhatsApp traz o link da transação no host da empresa', async () => {
    const wa = ctx.services.whatsappProvider;
    wa.sent.length = 0;
    const from = await phoneOf(ctx, company);
    await inbound({ from, text: 'gere um Pix de 1400' });
    await inbound({ from, text: 'sim' });
    const charge = texts(wa).find((t) => t.includes('Detalhes:'));
    expect(charge).toMatch(new RegExp(`Detalhes: ${COMPANY_URL.replace(/\./g, '\\.')}/app/pay/transactions/[A-Za-z0-9]+`));
    expect(texts(wa).join('\n')).not.toContain('localhost:5173');
  });

  it('o convite de colaborador leva o link de ativação para o host da empresa que convidou', async () => {
    const res = await call(ctx.app, CNPJ_HOST, 'post', '/api/team', {
      body: { name: 'Carlos Lima', email: `carlos-${Date.now()}@exemplo.test`, cpf: testCpf() },
      cookie: `${DEV_COOKIE[CNPJ_HOST]}=${ownerToken}`,
    });
    expect(res.status).toBe(201);
    expect(res.body.invite.link).toMatch(new RegExp(`^${COMPANY_URL.replace(/\./g, '\\.')}/activate/[A-Za-z0-9_-]+$`));
    // O token fica gravado com a área do dono: só vale nesse host.
    const token = res.body.invite.link.split('/').at(-1);
    const stored = await ctx.prisma.activationToken.findFirst({ where: { user: { email: res.body.member.email } } });
    expect(stored.area).toBe('CNPJ');
    expect(token.length).toBeGreaterThan(20);
  });
});

describe.skipIf(!hasDb)('links por área · modo legado', () => {
  let ctx;
  let inbound;
  let company;
  let person;
  let ownerToken;

  beforeAll(async () => {
    ctx = await setupApp();
    await resetDb(ctx.prisma);
    inbound = inboundTo(ctx);
    company = await makeAccount(ctx.prisma, { accountType: 'COMPANY', whatsapp: true });
    person = await makeAccount(ctx.prisma, { accountType: 'PERSON', whatsapp: true });
    ownerToken = (await insertSession(ctx.prisma, ctx.config, { userId: company.user.id })).token;
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('o botão de navegação usa APP_URL para empresa e para pessoa', async () => {
    const wa = ctx.services.whatsappProvider;
    wa.sent.length = 0;
    for (const account of [company, person]) {
      await inbound({ from: await phoneOf(ctx, account), buttonId: decisionPayload('ABRIR TEMPIX', 'w', 'abc123'), buttonTitle: 'ABRIR TEMPIX' });
      expect(texts(wa).at(-1)).toBe(`Abra no TemPix: ${LEGACY_URL}/app/workforce/matches/abc123`);
    }
  });

  it('a cobrança Pix pedida por WhatsApp usa APP_URL', async () => {
    const wa = ctx.services.whatsappProvider;
    wa.sent.length = 0;
    const from = await phoneOf(ctx, company);
    await inbound({ from, text: 'gere um Pix de 1400' });
    await inbound({ from, text: 'sim' });
    expect(texts(wa).find((t) => t.includes('Detalhes:'))).toMatch(/Detalhes: http:\/\/localhost:5173\/app\/pay\/transactions\/[A-Za-z0-9]+/);
  });

  it('o convite de colaborador usa APP_URL', async () => {
    const res = await call(ctx.app, 'localhost:5173', 'post', '/api/team', {
      body: { name: 'Carlos Lima', email: `carlos-${Date.now()}@exemplo.test`, cpf: testCpf() },
      cookie: `ap_session=${ownerToken}`,
      origin: LEGACY_URL,
    });
    expect(res.status).toBe(201);
    expect(res.body.invite.link.startsWith(`${LEGACY_URL}/activate/`)).toBe(true);
  });
});
