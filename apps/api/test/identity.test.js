import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { disconnectPrisma, getPrisma } from '@autopix/core';
import { formatCnpj, formatCpf } from '@autopix/shared';
import { setupApp, resetDb, client, hasDb, PROFILE, STRONG_PASSWORD, testCnpj, testCpf, activationTokenFromEmail } from './helpers.js';

const login = (app, identifier, password = STRONG_PASSWORD) => client(app).post('/api/auth/login', { identifier, password });

/** Login is the document: CNPJ for a company (one per company), CPF for a person or a collaborator. */
describe.skipIf(!hasDb)('login by CPF / CNPJ and collaborators', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp({ BILLING_MODEL: 'commission', COMPANY_SIGNUP_FEE_CENTS: '0' });
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  async function signUp({ accountType, document, email = `${accountType.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@ex.example` }) {
    const c = client(ctx.app);
    const body = accountType === 'PERSON' ? { accountType, name: 'João Pereira', email, document } : { accountType, name: 'Bia Lima', email, companyName: 'Construtora Lima', document };
    const start = await c.post('/api/onboarding/start', body);
    if (start.status !== 201) return { start };
    const data = accountType === 'PERSON' ? { services: ['Eletricista'], city: 'Joinville', state: 'SC' } : PROFILE;
    await c.put('/api/onboarding/step', { step: 9, data, complete: true });
    const fin = await c.post('/api/onboarding/finish');
    expect(fin.body.emailVerificationRequired).toBe(true);
    expect(fin.body.token).toBeUndefined();
    const token = activationTokenFromEmail(ctx.email);
    await c.post('/api/auth/activate', { token, password: STRONG_PASSWORD });
    return { c, start, email };
  }

  it('company logs in with its CNPJ (formatted or digits); the CNPJ stays the one given at signup', async () => {
    const cnpj = testCnpj();
    const { c, start } = await signUp({ accountType: 'COMPANY', document: formatCnpj(cnpj) });
    expect(start.body.company.cnpj).toBe(cnpj);
    expect((await c.get('/api/me')).body.company.accountType).toBe('COMPANY');
    expect((await login(ctx.app, formatCnpj(cnpj))).status).toBe(200);
    expect((await login(ctx.app, cnpj)).status).toBe(200);
    // PROFILE carries another CNPJ: ignored during signup, refused afterwards.
    expect((await ctx.prisma.company.findFirst({ where: { cnpj } }))).toBeTruthy();
    const change = await c.put('/api/company', { cnpj: '11.222.333/0001-81' });
    expect(change.status).toBe(400);
  });

  it('one login per CNPJ and per CPF', async () => {
    const cnpj = testCnpj();
    await signUp({ accountType: 'COMPANY', document: cnpj });
    const again = await signUp({ accountType: 'COMPANY', document: cnpj });
    expect(again.start.status).toBe(409);
    expect(again.start.body.error.message).toContain('CNPJ');

    const cpf = testCpf();
    await signUp({ accountType: 'PERSON', document: cpf });
    const dup = await signUp({ accountType: 'PERSON', document: cpf });
    expect(dup.start.status).toBe(409);
  });

  it('an unfinished draft holds the CNPJ for one hour, then frees it', async () => {
    const cnpj = testCnpj();
    const prisma = getPrisma();
    expect((await client(ctx.app).post('/api/onboarding/start', { accountType: 'COMPANY', name: 'Rascunho Silva', email: 'draft@ex.example', companyName: 'Rascunho Ltda', document: cnpj })).status).toBe(201);
    const blocked = await signUp({ accountType: 'COMPANY', document: cnpj });
    expect(blocked.start.status).toBe(409);
    // Once the hour is up, the unpaid draft is purged and the CNPJ is free again.
    await prisma.user.update({ where: { email: 'draft@ex.example' }, data: { pendingExpiresAt: new Date(Date.now() - 1000) } });
    const real = await signUp({ accountType: 'COMPANY', document: cnpj });
    expect(real.start.status).toBe(201);
    expect(await prisma.user.findUnique({ where: { email: 'draft@ex.example' } })).toBeNull();
    expect((await login(ctx.app, cnpj)).status).toBe(200);
  });

  it('pessoa física logs in with CPF; invalid documents are refused', async () => {
    const cpf = testCpf();
    const { c } = await signUp({ accountType: 'PERSON', document: formatCpf(cpf) });
    // The app picks the person or company view from the session.
    expect((await c.get('/api/me')).body.company.accountType).toBe('PERSON');
    expect((await login(ctx.app, formatCpf(cpf))).status).toBe(200);
    expect((await login(ctx.app, cpf, 'senha-errada-123')).status).toBe(401);
    const bad = await client(ctx.app).post('/api/onboarding/start', { accountType: 'PERSON', name: 'Zé', email: 'ze@ex.example', document: '123.456.789-00' });
    expect(bad.status).toBe(400);
    const badCnpj = await client(ctx.app).post('/api/onboarding/start', { accountType: 'COMPANY', name: 'Zé', email: 'ze2@ex.example', companyName: 'Zé ME', document: '11.111.111/1111-11' });
    expect(badCnpj.status).toBe(400);
  });

  it('owner opens access for a collaborator, who logs in with their own CPF', async () => {
    const cnpj = testCnpj();
    const { c: owner } = await signUp({ accountType: 'COMPANY', document: cnpj });
    const cpf = testCpf();
    const inv = await owner.post('/api/team', { name: 'Carlos Lima', email: 'carlos@ex.example', cpf: formatCpf(cpf) });
    expect(inv.status).toBe(201);
    expect(inv.body.member).toMatchObject({ name: 'Carlos Lima', role: 'MEMBER', status: 'PENDING_ACTIVATION' });
    expect(inv.body.member.login).toMatch(/^\*\*\*\.\d{3}\.\d{3}-\*\*$/);
    const token = inv.body.invite.link.split('/activate/')[1];
    expect(token).toBeTruthy();

    // Neither the CPF nor the link land in the action log.
    const log = await ctx.prisma.actionLog.findFirst({ where: { action: 'INVITE_COLLABORATOR' } });
    expect(JSON.stringify(log)).not.toContain(cpf);
    expect(JSON.stringify(log)).not.toContain(token);

    const collab = client(ctx.app);
    expect((await collab.post('/api/auth/activate', { token, password: STRONG_PASSWORD })).status).toBe(200);
    expect((await login(ctx.app, cpf)).status).toBe(200);

    // A collaborator can't open access for others.
    expect((await collab.post('/api/team', { name: 'Outra', email: 'outra@ex.example', cpf: testCpf() })).status).toBe(403);

    const list = await owner.get('/api/team');
    expect(list.body.members.map((m) => m.role)).toEqual(['OWNER', 'MEMBER']);

    // Removing access ends their sessions and login.
    const rm = await owner.del(`/api/team/${inv.body.member.id}`);
    expect(rm.status).toBe(200);
    expect(rm.body.member.status).toBe('DISABLED');
    expect((await collab.get('/api/me')).status).toBe(401);
    expect((await login(ctx.app, cpf)).status).toBe(403);
  });

  it('collaborators are for company accounts only', async () => {
    const { c } = await signUp({ accountType: 'PERSON', document: testCpf() });
    const res = await c.post('/api/team', { name: 'Carlos', email: 'c2@ex.example', cpf: testCpf() });
    expect(res.status).toBe(409);
  });

  it('accounts made before (no document yet) still log in by e-mail', async () => {
    const { email } = await signUp({ accountType: 'COMPANY', document: testCnpj() });
    await ctx.prisma.user.update({ where: { email }, data: { loginId: null } });
    expect((await client(ctx.app).post('/api/auth/login', { email, password: STRONG_PASSWORD })).status).toBe(200);
    expect((await client(ctx.app).post('/api/auth/login', { identifier: email, password: STRONG_PASSWORD })).status).toBe(200);
  });
});
