import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { disconnectPrisma } from '@autopix/core';
import { JOB_AREA_SLUGS } from '@autopix/shared';
import { setupApp, resetDb, hasDb } from './helpers.js';
import { AREA_ENV, CNPJ_HOST, CPF_HOST, DEV_COOKIE, call, insertSession, makeAccount } from './authAreaHelpers.js';

// Vagas · "Meu perfil": PUT /api/profile aceita workArea (slug da lista), jobTitle (até 80) e contactPreference
// (WHATSAPP ou EMAIL), validados com zod e guardados no perfil operacional (JSON, chave jobSearch), sem migração.

describe.skipIf(!hasDb)('/api/profile · busca de vagas', () => {
  let ctx;
  let person;
  let cookie;

  const put = (body) => call(ctx.app, CPF_HOST, 'put', '/api/profile', { cookie, body });
  const get = () => call(ctx.app, CPF_HOST, 'get', '/api/profile', { cookie, origin: null, xrw: null });
  const stored = async () => (await ctx.prisma.company.findUnique({ where: { id: person.company.id } })).operationalProfile;

  beforeAll(async () => {
    ctx = await setupApp({ ...AREA_ENV, DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
    person = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    cookie = `${DEV_COOKIE[CPF_HOST]}=${(await insertSession(ctx.prisma, ctx.config, { userId: person.user.id, area: 'CPF' })).token}`;
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('sem busca de vagas gravada, o perfil devolve os três campos vazios', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ workArea: null, jobTitle: null, contactPreference: null });
  });

  it('grava a área, o cargo e o contato preferido, e o perfil devolve os três', async () => {
    const res = await put({ workArea: 'metalurgia', jobTitle: '  Soldador MIG  ', contactPreference: 'EMAIL' });
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ workArea: 'metalurgia', jobTitle: 'Soldador MIG', contactPreference: 'EMAIL' });
    expect(res.body.changed).toContain('operationalProfile');
    expect((await stored()).jobSearch).toEqual({ workArea: 'metalurgia', jobTitle: 'Soldador MIG', contactPreference: 'EMAIL' });
    expect((await get()).body.profile).toMatchObject({ workArea: 'metalurgia', jobTitle: 'Soldador MIG', contactPreference: 'EMAIL' });
  });

  it('aceita todas as áreas da lista', async () => {
    for (const workArea of JOB_AREA_SLUGS) {
      const res = await put({ workArea });
      expect(res.status, workArea).toBe(200);
      expect(res.body.profile.workArea).toBe(workArea);
    }
  });

  it('uma gravação parcial mantém o resto da busca de vagas', async () => {
    await put({ workArea: 'saude', jobTitle: 'Enfermeira', contactPreference: 'WHATSAPP' });
    const res = await put({ contactPreference: 'EMAIL' });
    expect(res.body.profile).toMatchObject({ workArea: 'saude', jobTitle: 'Enfermeira', contactPreference: 'EMAIL' });
  });

  it('o perfil operacional salvo pela outra tela não apaga a busca de vagas', async () => {
    await put({ workArea: 'eletrica', jobTitle: 'Eletricista', contactPreference: 'WHATSAPP' });
    const res = await put({ operationalProfile: { types: ['profissional_autonomo'], objectives: ['encontrar_obras'] } });
    expect(res.status).toBe(200);
    expect(res.body.profile.operationalProfile.types).toEqual(['profissional_autonomo']);
    expect(res.body.profile).toMatchObject({ workArea: 'eletrica', jobTitle: 'Eletricista', contactPreference: 'WHATSAPP' });
    expect((await stored()).jobSearch.workArea).toBe('eletrica');
  });

  it('jobSearch dentro do perfil operacional enviado é descartado: só os campos validados entram', async () => {
    await put({ workArea: 'eletrica' });
    const res = await put({ operationalProfile: { types: ['profissional_autonomo'], jobSearch: { workArea: 'inventada', jobTitle: 'x'.repeat(500) } } });
    expect(res.status).toBe(200);
    expect(res.body.profile.workArea).toBe('eletrica');
    expect((await stored()).jobSearch.jobTitle).not.toBe('x'.repeat(500));
  });

  it('null ou texto vazio apagam o campo', async () => {
    await put({ workArea: 'comercio', jobTitle: 'Vendedor', contactPreference: 'EMAIL' });
    const res = await put({ workArea: '', jobTitle: null, contactPreference: null });
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ workArea: null, jobTitle: null, contactPreference: null });
    expect((await stored()).jobSearch).toBeUndefined();
  });

  it('valida: área fora da lista, cargo com mais de 80 caracteres e contato fora de WHATSAPP/EMAIL dão 400 com o campo', async () => {
    const area = await put({ workArea: 'astronauta' });
    expect(area.status).toBe(400);
    expect(area.body.error.fields.workArea).toBe('Escolha uma área da lista');
    const title = await put({ jobTitle: 'x'.repeat(81) });
    expect(title.status).toBe(400);
    expect(title.body.error.fields.jobTitle).toBeTruthy();
    const contact = await put({ contactPreference: 'TELEFONE' });
    expect(contact.status).toBe(400);
    expect(contact.body.error.fields.contactPreference).toBe('Escolha WhatsApp ou e-mail');
    expect((await put({ jobTitle: 'x'.repeat(80) })).status).toBe(200);
    expect((await put({ workArea: 42 })).status).toBe(400);
    expect((await put({ workArea: ['saude'] })).status).toBe(400);
  });

  it('um corpo inválido não grava nada do que veio junto', async () => {
    await put({ workArea: 'educacao', jobTitle: 'Professor' });
    const bad = await put({ jobTitle: 'Outro cargo', workArea: 'astronauta' });
    expect(bad.status).toBe(400);
    expect((await get()).body.profile).toMatchObject({ workArea: 'educacao', jobTitle: 'Professor' });
  });

  it('sem sessão: 401; no host CNPJ a rota não existe: 404', async () => {
    expect((await call(ctx.app, CPF_HOST, 'put', '/api/profile', { body: { workArea: 'saude' } })).status).toBe(401);
    expect((await call(ctx.app, CNPJ_HOST, 'put', '/api/profile', { body: { workArea: 'saude' } })).status).toBe(404);
  });
});
