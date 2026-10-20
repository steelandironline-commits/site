import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { z } from 'zod';
import { disconnectPrisma } from '@autopix/core';
import { setupApp, resetDb, hasDb } from './helpers.js';
import { AREA_ENV, CNPJ_HOST, CPF_HOST, DEV_COOKIE, call, insertSession, makeAccount } from './authAreaHelpers.js';

// 4b · áreas no ActionEngine. A área vem do dono da conta e vale em todo canal (web, API, WhatsApp
// de entrada, sistema). Ação de outra área responde 404 "Ação desconhecida", como uma que não existe.

const UNKNOWN = { error: { code: 'NOT_FOUND', message: 'Ação desconhecida.' } };
const act = (app, host, token, name, input = {}) =>
  call(app, host, 'post', `/api/actions/${name}`, { body: { input }, cookie: `${DEV_COOKIE[host]}=${token}` });

describe.skipIf(!hasDb)('ActionEngine · modo de áreas', () => {
  let ctx;
  let company;
  let person;
  let admin;
  let tokens;
  let inbound;

  beforeAll(async () => {
    ctx = await setupApp(AREA_ENV);
    await resetDb(ctx.prisma);
    company = await makeAccount(ctx.prisma, { accountType: 'COMPANY', whatsapp: true });
    person = await makeAccount(ctx.prisma, { accountType: 'PERSON', whatsapp: true });
    admin = await makeAccount(ctx.prisma, { accountType: 'PERSON', platformAdmin: true });
    tokens = {
      company: (await insertSession(ctx.prisma, ctx.config, { userId: company.user.id, area: 'CNPJ' })).token,
      person: (await insertSession(ctx.prisma, ctx.config, { userId: person.user.id, area: 'CPF' })).token,
      admin: (await insertSession(ctx.prisma, ctx.config, { userId: admin.user.id, area: 'ADMIN' })).token,
    };
    const wa = ctx.services.whatsappProvider;
    inbound = (from, payload) => {
      const wh = wa.buildInbound({ from, ...payload });
      const req = request(ctx.app).post('/api/webhooks/whatsapp').set('Content-Type', 'application/json');
      for (const [k, v] of Object.entries(wh.headers)) req.set(k, v);
      return req.send(wh.rawBody);
    };
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('ação de CNPJ chamada por sessão CPF é negada com 404 "Ação desconhecida", igual a uma que não existe', async () => {
    for (const name of ['LIST_TODAY_OPPORTUNITIES', 'START_AGENT', 'CREATE_PIX', 'INVITE_COLLABORATOR', 'CREATE_SUBSCRIPTION_PIX', 'CHANGE_BANK_DETAILS']) {
      const res = await act(ctx.app, CPF_HOST, tokens.person, name);
      expect(res.status, name).toBe(404);
      expect(res.body, name).toEqual(UNKNOWN);
    }
    const nothing = await act(ctx.app, CPF_HOST, tokens.person, 'NAO_EXISTE');
    expect(nothing.status).toBe(404);
    expect(nothing.body).toEqual(UNKNOWN);
    // Nada foi executado: o único registro é a recusa.
    const logs = await ctx.prisma.actionLog.findMany({ where: { companyId: person.company.id }, select: { action: true, status: true } });
    expect(logs.every((l) => l.status === 'REJECTED')).toBe(true);
  });

  it('a mesma ação roda para a sessão CNPJ', async () => {
    const res = await act(ctx.app, CNPJ_HOST, tokens.company, 'LIST_TODAY_OPPORTUNITIES');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUCCEEDED');
  });

  it('o CPF alcança as ações sociais (a recusa vem do serviço, não do motor)', async () => {
    const res = await act(ctx.app, CPF_HOST, tokens.person, 'DELETE_SOCIAL_POST', { id: 'inexistente' });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Você só pode remover suas próprias publicações.');
  });

  it('o catálogo de cada sessão mostra só as ações da sua área', async () => {
    const list = async (host, token) => (await call(ctx.app, host, 'get', '/api/actions', { origin: null, xrw: null, cookie: `${DEV_COOKIE[host]}=${token}` })).body.items.map((a) => a.name).sort();
    expect(await list(CPF_HOST, tokens.person)).toEqual(['COMMENT_SOCIAL_POST', 'DELETE_SOCIAL_POST', 'PUBLISH_SOCIAL_POST', 'REPOST_SOCIAL_POST']);
    const cnpj = await list(CNPJ_HOST, tokens.company);
    expect(cnpj).toContain('CREATE_PIX');
    expect(cnpj).not.toContain('RESOLVE_DISPUTE');
    expect(await list(CNPJ_HOST, tokens.admin)).toEqual(['RESOLVE_DISPUTE', 'RESOLVE_RECONCILIATION_ISSUE', 'UPDATE_COMMISSION_RULE']);
  });

  it('o administrador da plataforma não roda ação de empresa, e ação de administração é só dele', async () => {
    const denied = await act(ctx.app, CNPJ_HOST, tokens.admin, 'LIST_TODAY_OPPORTUNITIES');
    expect(denied.status).toBe(404);
    expect(denied.body).toEqual(UNKNOWN);
    // Empresa e pessoa não enxergam a ação de administração.
    for (const [host, token] of [[CNPJ_HOST, tokens.company], [CPF_HOST, tokens.person]]) {
      const res = await act(ctx.app, host, token, 'RESOLVE_DISPUTE', { id: 'x', outcome: 'CANCEL', note: 'dez caracteres' });
      expect(res.status, host).toBe(404);
      expect(res.body, host).toEqual(UNKNOWN);
    }
    // O administrador chega à ação (a recusa seguinte é o desafio de segurança, não "desconhecida").
    const asAdmin = await act(ctx.app, CNPJ_HOST, tokens.admin, 'RESOLVE_DISPUTE', { id: 'x', outcome: 'CANCEL', note: 'dez caracteres' });
    expect(asAdmin.status).toBe(202);
    expect(asAdmin.body.status).toBe('CONFIRMATION_REQUIRED');
  });

  it('a negativa vale no WhatsApp de entrada: o CPF não roda ação de empresa por mensagem nem por botão', async () => {
    const wa = ctx.services.whatsappProvider;
    const phone = (await ctx.prisma.whatsAppConnection.findUnique({ where: { userId: person.user.id } })).phoneNumber;
    wa.sent.length = 0;
    await inbound(phone, { text: 'quais oportunidades apareceram hoje?' });
    expect(wa.sent.at(-1).text.body).toBe('Não foi possível concluir: Ação desconhecida.');
    await inbound(phone, { buttonId: 'ap1:DESCARTAR:o:abc123', buttonTitle: 'DESCARTAR' });
    expect(wa.sent.at(-1).text.body).toBe('Não foi possível concluir: Ação desconhecida.');
    // A empresa, no mesmo canal, roda a mesma consulta.
    const companyPhone = (await ctx.prisma.whatsAppConnection.findUnique({ where: { userId: company.user.id } })).phoneNumber;
    await inbound(companyPhone, { text: 'quais oportunidades apareceram hoje?' });
    expect(wa.sent.at(-1).text.body).toMatch(/Nenhuma oportunidade nova|oportunidade\(s\) nas últimas 24h/);
  });

  it('a negativa vale no canal do sistema (worker) e no WhatsApp direto no motor', async () => {
    const engine = ctx.services.actions;
    engine.register({ name: 'TEST_SISTEMA', areas: ['CNPJ'], channels: ['SYSTEM'], schema: z.object({}).passthrough(), handler: async (c) => ({ area: c.area }) });
    const system = (user) => engine.execute({ action: 'TEST_SISTEMA', channel: 'SYSTEM', actor: { userId: user.id, system: true } });
    await expect(system(person.user)).rejects.toMatchObject({ status: 404, message: 'Ação desconhecida.' });
    // O motor entrega ao serviço a área do dono, para os filtros.
    expect(await system(company.user)).toMatchObject({ status: 'SUCCEEDED', result: { area: 'CNPJ' } });
    const personConn = await ctx.prisma.whatsAppConnection.findUnique({ where: { userId: person.user.id } });
    await expect(
      engine.execute({ action: 'LIST_TODAY_OPPORTUNITIES', channel: 'WHATSAPP', actor: { userId: person.user.id, whatsappConnectionId: personConn.id } }),
    ).rejects.toMatchObject({ status: 404, message: 'Ação desconhecida.' });
  });

  it('ação sem areas é negada no modo de áreas, em todo canal', async () => {
    ctx.services.actions.register({ name: 'TEST_SEM_AREAS', channels: ['SYSTEM', 'WEB', 'API'], schema: z.object({}).passthrough(), handler: async () => ({ ok: true }) });
    const direct = await ctx.services.actions.execute({ action: 'TEST_SEM_AREAS', channel: 'SYSTEM', actor: { userId: company.user.id, system: true } }).catch((e) => e);
    expect(direct).toMatchObject({ status: 404, message: 'Ação desconhecida.' });
    const http = await act(ctx.app, CNPJ_HOST, tokens.company, 'TEST_SEM_AREAS');
    expect(http.status).toBe(404);
    expect(http.body).toEqual(UNKNOWN);
    expect((await ctx.services.actions.catalog({ area: 'CNPJ' })).map((a) => a.name)).not.toContain('TEST_SEM_AREAS');
  });
});

describe.skipIf(!hasDb)('ActionEngine · modo legado, como antes das áreas', () => {
  let ctx;
  let person;
  let token;

  beforeAll(async () => {
    ctx = await setupApp();
    await resetDb(ctx.prisma);
    person = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    token = (await insertSession(ctx.prisma, ctx.config, { userId: person.user.id })).token;
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('executa a ação de empresa para a conta de pessoa, sem olhar areas', async () => {
    const res = await call(ctx.app, 'localhost:5173', 'post', '/api/actions/LIST_TODAY_OPPORTUNITIES', { body: { input: {} }, cookie: `ap_session=${token}` });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUCCEEDED');
  });

  it('executa uma ação sem areas, como hoje, e o catálogo lista todas', async () => {
    ctx.services.actions.register({ name: 'TEST_SEM_AREAS', channels: ['SYSTEM', 'WEB', 'API'], schema: z.object({}).passthrough(), handler: async () => ({ ok: true }) });
    const out = await ctx.services.actions.execute({ action: 'TEST_SEM_AREAS', channel: 'SYSTEM', actor: { userId: person.user.id, system: true } });
    expect(out).toEqual({ status: 'SUCCEEDED', action: 'TEST_SEM_AREAS', result: { ok: true } });
    const catalog = await call(ctx.app, 'localhost:5173', 'get', '/api/actions', { origin: null, xrw: null, cookie: `ap_session=${token}` });
    expect(catalog.status).toBe(200);
    expect(catalog.body.items.length).toBe(ctx.services.actions.actions.size);
    expect(catalog.body.items.map((a) => a.name)).toContain('TEST_SEM_AREAS');
  });
});
