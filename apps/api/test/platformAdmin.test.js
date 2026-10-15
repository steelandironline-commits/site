import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { disconnectPrisma, FinancialAuditService, createPlatformAdmin } from '@autopix/core';
import { setupApp, resetDb, client, hasDb, testConfig } from './helpers.js';

const CPF = '500.765.758-10';
const PASSWORD = 'admin-tempix-2026';

/** The first platform admin: created by an operator, usable straight away (no signup email). */
describe.skipIf(!hasDb)('platform administrator bootstrap', () => {
  let ctx;
  let audit;
  beforeAll(async () => {
    ctx = await setupApp({ BILLING_MODEL: 'commission' });
    audit = new FinancialAuditService({ prisma: ctx.prisma, config: testConfig({ BILLING_MODEL: 'commission' }) });
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  const make = (over = {}) => createPlatformAdmin({ prisma: ctx.prisma, audit, cpf: CPF, email: 'admin@tempix.example', name: 'Guto Admin', password: PASSWORD, ...over });

  it('creates an active platform admin that logs in with CPF and password, with the password hashed', async () => {
    await make();
    const user = await ctx.prisma.user.findUnique({ where: { loginId: '50076575810' } });
    expect(user).toMatchObject({ status: 'ACTIVE', isPlatformAdmin: true, role: 'OWNER' });
    expect(user.passwordHash.startsWith('$argon2id')).toBe(true);
    expect(user.passwordHash).not.toContain(PASSWORD);

    const c = client(ctx.app);
    expect((await c.post('/api/auth/login', { identifier: CPF, password: PASSWORD })).status).toBe(200);
    expect((await c.get('/api/me')).body.user.isPlatformAdmin).toBe(true);
  });

  it('refuses an invalid CPF, a password under 10 characters, and a CPF or e-mail already in use', async () => {
    await expect(make({ cpf: '123.456.789-00' })).rejects.toThrow(/CPF inválido/);
    await expect(make({ password: 'Guto1570!' })).rejects.toThrow(/pelo menos 10/);
    await make();
    await expect(make({ email: 'outro@tempix.example' })).rejects.toThrow(/Já existe/);
    expect(await ctx.prisma.user.count()).toBe(1);
  });

  it('records the creation in the financial audit log', async () => {
    await make();
    const entry = await ctx.prisma.financialAuditLog.findFirst({ where: { action: 'PLATFORM_ADMIN_CREATED' } });
    expect(entry).toMatchObject({ source: 'ADMIN' });
    expect(entry.metadata).toMatchObject({ cpfLast4: '5810' });
    expect(JSON.stringify(entry.metadata)).not.toContain(PASSWORD);
  });
});
