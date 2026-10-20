import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { disconnectPrisma, loginMessages } from '@autopix/core';
import { setupApp, resetDb, hasDb, STRONG_PASSWORD } from './helpers.js';
import { AREA_ENV, CNPJ_HOST, CPF_HOST, call, makeAccount } from './authAreaHelpers.js';

// ETAPA 5 · o acesso fala na língua da área: quem erra a senha no CPF lê "CPF ou senha incorretos.",
// sem citar CNPJ; no CNPJ lê "Documento ou senha incorretos."; o modo legado diz o que sempre disse.

const login = (ctx, host, identifier, password = STRONG_PASSWORD) => call(ctx.app, host, 'post', '/api/auth/login', { body: { identifier, password } });

describe('loginMessages · por área', () => {
  const on = { areas: { enabled: true } };
  const off = { areas: { enabled: false } };

  it('modo legado: as frases de sempre', () => {
    for (const area of [null, 'CNPJ', 'CPF', 'ADMIN']) {
      expect(loginMessages(area, off)).toEqual({ required: 'Informe CPF ou CNPJ', failure: 'CPF/CNPJ ou senha incorretos.' });
    }
  });

  it('modo de áreas: o CPF e o admin só falam de CPF; o CNPJ fala de "documento"', () => {
    expect(loginMessages('CPF', on)).toEqual({ required: 'Informe o CPF', failure: 'CPF ou senha incorretos.' });
    expect(loginMessages('ADMIN', on)).toEqual({ required: 'Informe o CPF', failure: 'CPF ou senha incorretos.' });
    expect(loginMessages('CNPJ', on)).toEqual({ required: 'Informe o documento', failure: 'Documento ou senha incorretos.' });
    expect(JSON.stringify(loginMessages('CPF', on))).not.toMatch(/CNPJ/);
    expect(JSON.stringify(loginMessages('CNPJ', on))).not.toMatch(/Tem CPF|pessoa/i);
  });
});

describe.skipIf(!hasDb)('mensagens de acesso · modo de áreas', () => {
  let ctx;
  let cnpj;
  let cpf;

  beforeAll(async () => {
    ctx = await setupApp(AREA_ENV);
    await resetDb(ctx.prisma);
    cnpj = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    cpf = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('CPF: senha errada, conta que não existe e conta da outra área respondem a mesma frase, sem citar CNPJ', async () => {
    const wrongPassword = await login(ctx, CPF_HOST, cpf.document, 'senha-errada-123');
    const unknown = await login(ctx, CPF_HOST, '52998224725');
    const otherArea = await login(ctx, CPF_HOST, cnpj.document);
    for (const res of [wrongPassword, unknown, otherArea]) {
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('CPF ou senha incorretos.');
      expect(JSON.stringify(res.body)).not.toMatch(/CNPJ/);
    }
  });

  it('CNPJ: as mesmas três respostas dizem "Documento ou senha incorretos." (o CPF da pessoa é conta de outra área)', async () => {
    const wrongPassword = await login(ctx, CNPJ_HOST, cnpj.document, 'senha-errada-123');
    const unknown = await login(ctx, CNPJ_HOST, '11222333000181');
    const otherArea = await login(ctx, CNPJ_HOST, cpf.document);
    for (const res of [wrongPassword, unknown, otherArea]) {
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Documento ou senha incorretos.');
      expect(JSON.stringify(res.body)).not.toMatch(/pessoa f[ií]sica|Tem CPF/i);
    }
  });

  it('documento em branco: cada área diz a sua frase, e a senha em branco continua igual', async () => {
    const cpfRes = await call(ctx.app, CPF_HOST, 'post', '/api/auth/login', { body: { identifier: '', password: '' } });
    expect(cpfRes.status).toBe(400);
    expect(cpfRes.body.error.fields).toEqual({ identifier: 'Informe o CPF', password: 'Informe a senha' });
    const cnpjRes = await call(ctx.app, CNPJ_HOST, 'post', '/api/auth/login', { body: { identifier: '', password: '' } });
    expect(cnpjRes.body.error.fields).toEqual({ identifier: 'Informe o documento', password: 'Informe a senha' });
    const nativeRes = await call(ctx.app, CPF_HOST, 'post', '/api/auth/native/login', { body: { password: 'x' } });
    expect(nativeRes.body.error.fields.identifier).toBe('Informe o CPF');
  });

  it('o acesso certo continua entrando nas duas áreas', async () => {
    expect((await login(ctx, CPF_HOST, cpf.document)).status).toBe(200);
    expect((await login(ctx, CNPJ_HOST, cnpj.document)).status).toBe(200);
  });
});

describe.skipIf(!hasDb)('mensagens de acesso · modo legado', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp({});
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('diz o que sempre disse, em qualquer host', async () => {
    for (const host of ['localhost:5173', 'cpf.temcnpj.com.br', 'x.up.railway.app']) {
      const wrong = await call(ctx.app, 'localhost:5173', 'post', '/api/auth/login', { body: { identifier: '52998224725', password: STRONG_PASSWORD }, headers: { Host: host } });
      expect(wrong.status).toBe(401);
      expect(wrong.body.error.message).toBe('CPF/CNPJ ou senha incorretos.');
      const blank = await call(ctx.app, 'localhost:5173', 'post', '/api/auth/login', { body: { identifier: '', password: 'x' }, headers: { Host: host } });
      expect(blank.body.error.fields.identifier).toBe('Informe CPF ou CNPJ');
    }
  });
});
