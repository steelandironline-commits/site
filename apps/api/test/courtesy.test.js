import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { disconnectPrisma } from '@autopix/core';
import { setupApp, resetDb, client, hasDb, STRONG_PASSWORD, testCnpj, testCpf, activationTokenFromEmail, onboardToCheckout, createActiveUser } from './helpers.js';

const ADMIN_EMAIL = 'dono-plataforma@tempix.example';
const REASON = 'Conta de teste da fundadora: liberar painel para validação da plataforma.';

/**
 * Cortesia de acesso: an admin gives a company free access without any Pix.
 * It must be confirmed with the admin's password and leave an audit record.
 */
describe.skipIf(!hasDb)('courtesy access (cortesia auditada)', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp({ BILLING_MODEL: 'commission', PLATFORM_ADMIN_EMAILS: ADMIN_EMAIL });
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  /** A free professional account, activated through the normal emailed link, logged in as admin. */
  async function adminClient() {
    const c = client(ctx.app);
    expect((await c.post('/api/onboarding/start', { accountType: 'PERSON', name: 'Dono da Plataforma', email: ADMIN_EMAIL, document: testCpf() })).status).toBe(201);
    expect((await c.put('/api/onboarding/step', { step: 4, data: { services: ['Gestão'], city: 'Campinas', state: 'SP' }, complete: true })).status).toBe(200);
    expect((await c.post('/api/onboarding/finish')).status).toBe(200);
    const token = activationTokenFromEmail(ctx.email);
    expect((await c.post('/api/auth/activate', { token, password: STRONG_PASSWORD })).status).toBe(200);
    expect((await c.post('/api/auth/login', { identifier: ADMIN_EMAIL, password: STRONG_PASSWORD })).status).toBe(200);
    return c;
  }

  it('refuses the grant to a logged-in company that is not a platform admin', async () => {
    const { c } = await createActiveUser(ctx.app);
    const res = await c.post('/api/actions/GRANT_COURTESY_ACCESS', { input: { cnpj: testCnpj(), reason: REASON } });
    expect(res.status).toBe(403);
  });

  it('needs the admin password to confirm, then the company logs in by CNPJ without paying', async () => {
    const admin = await adminClient();
    const company = await onboardToCheckout(ctx.app);
    const cnpj = company.cnpj;

    const asked = await admin.post('/api/actions/GRANT_COURTESY_ACCESS', { input: { cnpj, reason: REASON } });
    expect(asked.body.status).toBe('CONFIRMATION_REQUIRED');
    expect(asked.body.challenge.summary).toContain(cnpj.slice(-4));

    // Nothing changes before the admin confirms.
    const before = await ctx.prisma.subscription.findUnique({ where: { companyId: company.companyId } });
    expect(before?.status).not.toBe('ACTIVE');

    const done = await admin.post(`/api/challenges/${asked.body.challenge.id}/confirm`, { password: STRONG_PASSWORD });
    expect(done.status).toBe(200);

    const sub = await ctx.prisma.subscription.findUnique({ where: { companyId: company.companyId } });
    expect(sub).toMatchObject({ status: 'ACTIVE', provider: 'courtesy', priceCents: 0 });
    const audit = await ctx.prisma.financialAuditLog.findFirst({ where: { companyId: company.companyId, action: 'COURTESY_ACCESS_GRANTED' } });
    expect(audit).toBeTruthy();
    expect(audit.metadata).toMatchObject({ cnpjLast4: cnpj.slice(-4) });
    expect(audit.metadata.reason).toBe(REASON);
    // No payment record is created: a courtesy is not a Pix.
    expect(await ctx.prisma.payment.count({ where: { companyId: company.companyId, status: 'CONFIRMED' } })).toBe(0);

    // The company can now finish the signup, activate and log in with its CNPJ.
    const fin = await company.c.post('/api/onboarding/finish');
    expect(fin.status).toBe(200);
    const token = fin.body.token;
    expect(token).toBeTruthy();
    expect((await company.c.post('/api/auth/activate', { token, password: STRONG_PASSWORD })).status).toBe(200);
    const login = await client(ctx.app).post('/api/auth/login', { identifier: cnpj, password: STRONG_PASSWORD });
    expect(login.status).toBe(200);
  });

  it('rejects a reason that is too short and a CNPJ that is not a company', async () => {
    const admin = await adminClient();
    const tooShort = await admin.post('/api/actions/GRANT_COURTESY_ACCESS', { input: { cnpj: testCnpj(), reason: 'ok' } });
    expect(tooShort.status).toBe(400);

    const asked = await admin.post('/api/actions/GRANT_COURTESY_ACCESS', { input: { cnpj: '12345678000195', reason: REASON } });
    const res = await admin.post(`/api/challenges/${asked.body.challenge.id}/confirm`, { password: STRONG_PASSWORD });
    expect(res.status).toBe(404);
  });
});
