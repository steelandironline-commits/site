import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { disconnectPrisma } from '@autopix/core';
import { setupApp, resetDb, hasDb, testCnpj, testCpf } from './helpers.js';
import { AREA_ENV, CNPJ_HOST, CPF_HOST, call, cookiePair, setCookieOf } from './authAreaHelpers.js';

// 4c · item C. Quem não tem conta abre uma sessão de cadastro (escopo ONBOARDING) no CPF. Antes, uma
// ação do CNPJ que existe respondia 401 (escopo) e uma que não existe respondia 404, então dava para
// listar os nomes das ações do CNPJ. A área vem antes do escopo: o nome de outra área responde igual
// a um nome inexistente.

const UNKNOWN = { error: { code: 'NOT_FOUND', message: 'Ação desconhecida.' } };

describe.skipIf(!hasDb)('ActionEngine · sessão de cadastro não enumera ações de outra área', () => {
  let ctx;
  let cpfCookie;
  let cnpjCookie;

  const act = (host, cookie, name) => call(ctx.app, host, 'post', `/api/actions/${name}`, { body: { input: {} }, cookie });

  beforeAll(async () => {
    ctx = await setupApp({ ...AREA_ENV, DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
    const stamp = Date.now();
    const pf = await call(ctx.app, CPF_HOST, 'post', '/api/onboarding/start', {
      body: { accountType: 'PERSON', name: 'João Pereira', email: `joao-${stamp}@area.example`, document: testCpf() },
    });
    expect(pf.status).toBe(201);
    cpfCookie = cookiePair(setCookieOf(pf, 'ap_session_cpf'));
    const pj = await call(ctx.app, CNPJ_HOST, 'post', '/api/onboarding/start', {
      body: { accountType: 'COMPANY', name: 'Bia Lima', email: `bia-${stamp}@area.example`, companyName: 'Construtora Lima', document: testCnpj() },
    });
    expect(pj.status).toBe(201);
    cnpjCookie = cookiePair(setCookieOf(pj, 'ap_session'));
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('sessão de cadastro do CPF: nome de ação do CNPJ responde igual a nome inexistente', async () => {
    const nothing = await act(CPF_HOST, cpfCookie, 'NAO_EXISTE_ESTA_ACAO');
    expect(nothing.status).toBe(404);
    expect(nothing.body).toEqual(UNKNOWN);
    for (const name of ['START_AGENT', 'CREATE_SUBSCRIPTION_PIX', 'CREATE_PIX', 'INVITE_COLLABORATOR', 'LIST_TODAY_OPPORTUNITIES', 'RESOLVE_DISPUTE']) {
      const res = await act(CPF_HOST, cpfCookie, name);
      expect(res.status, name).toBe(nothing.status);
      expect(res.body, name).toEqual(nothing.body);
    }
  });

  it('sessão de cadastro do CNPJ: ação de administração responde igual a nome inexistente', async () => {
    const nothing = await act(CNPJ_HOST, cnpjCookie, 'NAO_EXISTE_ESTA_ACAO');
    for (const name of ['RESOLVE_DISPUTE', 'UPDATE_COMMISSION_RULE']) {
      const res = await act(CNPJ_HOST, cnpjCookie, name);
      expect(res.status, name).toBe(nothing.status);
      expect(res.body, name).toEqual(nothing.body);
    }
  });

  it('ação da própria área continua exigindo sessão completa (401), sem mudar para quem tem acesso', async () => {
    // Ações sociais são do CPF: a área é a certa, então vale o escopo de antes.
    const social = await act(CPF_HOST, cpfCookie, 'PUBLISH_SOCIAL_POST');
    expect(social.status).toBe(401);
    // Ação do CNPJ que aceita a sessão de cadastro (Pix da taxa) segue passando pela área e pelo escopo permitido.
    const pix = await act(CNPJ_HOST, cnpjCookie, 'CREATE_SUBSCRIPTION_PIX');
    expect(pix.status).not.toBe(404);
    expect(pix.status).not.toBe(401);
  });

  it('sem sessão nenhuma, todo nome responde 401: nada a enumerar', async () => {
    for (const name of ['START_AGENT', 'NAO_EXISTE_ESTA_ACAO']) {
      const res = await act(CPF_HOST, undefined, name);
      expect(res.status, name).toBe(401);
    }
  });
});

describe.skipIf(!hasDb)('ActionEngine · modo legado, a ordem de antes', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await setupApp({ DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('sessão de cadastro chamando ação de empresa: 401 pelo escopo, como sempre', async () => {
    const start = await call(ctx.app, 'localhost:5173', 'post', '/api/onboarding/start', {
      body: { accountType: 'COMPANY', name: 'Bia Lima', email: `bia-${Date.now()}@area.example`, companyName: 'Construtora Lima', document: testCnpj() },
    });
    expect(start.status).toBe(201);
    const cookie = cookiePair(setCookieOf(start, 'ap_session'));
    const res = await call(ctx.app, 'localhost:5173', 'post', '/api/actions/START_AGENT', { body: { input: {} }, cookie });
    expect(res.status).toBe(401);
    const none = await call(ctx.app, 'localhost:5173', 'post', '/api/actions/NAO_EXISTE_ESTA_ACAO', { body: { input: {} }, cookie });
    expect(none.status).toBe(404);
  });
});
