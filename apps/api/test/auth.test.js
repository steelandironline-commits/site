import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { hashPassword, verifyPassword, hashToken, disconnectPrisma } from '@autopix/core';
import { setupApp, resetDb, client, createActiveUser, onboardToCheckout, hasDb, STRONG_PASSWORD } from './helpers.js';

describe('password hashing', () => {
  it('uses Argon2id and never stores plaintext', async () => {
    const hash = await hashPassword('minha-senha-123');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('minha-senha-123');
    expect(await verifyPassword(hash, 'minha-senha-123')).toBe(true);
    expect(await verifyPassword(hash, 'outra-senha-123')).toBe(false);
  });
});

describe.skipIf(!hasDb)('auth flows', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('stores only the Argon2 hash after activation', async () => {
    const { email } = await createActiveUser(ctx.app);
    const user = await ctx.prisma.user.findUnique({ where: { email } });
    expect(user.status).toBe('ACTIVE');
    expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(JSON.stringify(user)).not.toContain(STRONG_PASSWORD);
  });

  it('logs in with valid credentials and sets an HTTP-only cookie', async () => {
    const { email } = await createActiveUser(ctx.app);
    const c = client(ctx.app);
    const res = await c.post('/api/auth/login', { email, password: STRONG_PASSWORD });
    expect(res.status).toBe(200);
    const cookie = res.headers['set-cookie'].join(';');
    expect(cookie).toContain('ap_session=');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const me = await c.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.scope).toBe('FULL');
    expect(me.body.user.email).toBe(email);
  });

  it('rejects wrong passwords and unknown e-mails with the same message', async () => {
    const { email } = await createActiveUser(ctx.app);
    const c = client(ctx.app);
    const wrong = await c.post('/api/auth/login', { email, password: 'senha-errada-123' });
    const unknown = await c.post('/api/auth/login', { email: 'ninguem@empresa.example', password: 'senha-errada-123' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('logout revokes the session server-side', async () => {
    const { email } = await createActiveUser(ctx.app);
    const c = client(ctx.app);
    await c.post('/api/auth/login', { email, password: STRONG_PASSWORD });
    const before = await ctx.prisma.session.count({ where: { user: { email }, scope: 'FULL' } });
    const out = await c.post('/api/auth/logout');
    expect(out.status).toBe(200);
    const after = await ctx.prisma.session.count({ where: { user: { email }, scope: 'FULL' } });
    expect(after).toBe(before - 1);
    expect((await c.get('/api/me')).status).toBe(401);
    const anon = await c.get('/api/session');
    expect(anon.status).toBe(200);
    expect(anon.body.session).toBeNull();
  });

  it('expires sessions', async () => {
    const { email } = await createActiveUser(ctx.app);
    const c = client(ctx.app);
    await c.post('/api/auth/login', { email, password: STRONG_PASSWORD });
    await ctx.prisma.session.updateMany({ where: { user: { email } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await c.get('/api/me')).status).toBe(401);
  });

  describe('activation token', () => {
    async function paidAndClaimed() {
      const flow = await onboardToCheckout(ctx.app);
      await flow.c.post(`/api/payments/${flow.payment.id}/simulate`);
      const claim = await flow.c.post(`/api/payments/${flow.payment.id}/activation`);
      return { ...flow, token: claim.body.token };
    }

    it('is stored hashed and can be inspected', async () => {
      const { token, email } = await paidAndClaimed();
      expect(token).toBeTruthy();
      const raw = await ctx.prisma.activationToken.findMany({ where: { user: { email } } });
      expect(raw.length).toBeGreaterThan(0);
      expect(raw.some((t) => t.tokenHash === token)).toBe(false);
      expect(raw.some((t) => t.tokenHash === hashToken(token, ctx.config.secrets.activation))).toBe(true);
      const info = await client(ctx.app).get(`/api/auth/activate/${token}`);
      expect(info.status).toBe(200);
      expect(info.body.email).toBe(email);
    });

    it('cannot be reused', async () => {
      const { token } = await paidAndClaimed();
      const first = await client(ctx.app).post('/api/auth/activate', { token, password: STRONG_PASSWORD });
      expect(first.status).toBe(200);
      const second = await client(ctx.app).post('/api/auth/activate', { token, password: 'outra-senha-123' });
      expect(second.status).toBe(410);
    });

    it('invalidates sibling tokens after activation', async () => {
      const flow = await paidAndClaimed();
      const other = await flow.c.post(`/api/payments/${flow.payment.id}/activation`);
      await client(ctx.app).post('/api/auth/activate', { token: flow.token, password: STRONG_PASSWORD });
      const res = await client(ctx.app).post('/api/auth/activate', { token: other.body.token, password: STRONG_PASSWORD });
      expect([404, 410]).toContain(res.status);
    });

    it('rejects expired tokens', async () => {
      const { token, email } = await paidAndClaimed();
      await ctx.prisma.activationToken.updateMany({ where: { user: { email } }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const res = await client(ctx.app).post('/api/auth/activate', { token, password: STRONG_PASSWORD });
      expect(res.status).toBe(410);
      expect(res.body.error.message).toMatch(/expirou/);
    });

    it('rejects weak passwords', async () => {
      const { token } = await paidAndClaimed();
      const res = await client(ctx.app).post('/api/auth/activate', { token, password: '123' });
      expect(res.status).toBe(400);
      expect(res.body.error.fields.password).toBeTruthy();
    });
  });

  describe('forgot / reset password', () => {
    it('answers identically for unknown accounts', async () => {
      const res = await client(ctx.app).post('/api/auth/forgot-password', { email: 'nao-existe@empresa.example' });
      expect(res.status).toBe(200);
      expect(await ctx.prisma.passwordResetToken.count()).toBe(0);
    });

    it('resets the password once, revokes sessions and expires', async () => {
      const { email } = await createActiveUser(ctx.app);
      const res = await ctx.services.auth.requestPasswordReset(email);
      expect(res.sent).toBe(true);
      expect(ctx.email.outbox.at(-1).text).toContain('/reset-password/');

      const sessionsBefore = await ctx.prisma.session.count({ where: { user: { email } } });
      expect(sessionsBefore).toBeGreaterThan(0);
      const ok = await client(ctx.app).post('/api/auth/reset-password', { token: res.token, password: 'nova-senha-segura-1' });
      expect(ok.status).toBe(200);
      expect(await ctx.prisma.session.count({ where: { user: { email } } })).toBe(0);

      const reuse = await client(ctx.app).post('/api/auth/reset-password', { token: res.token, password: 'nova-senha-segura-2' });
      expect(reuse.status).toBe(410);

      const login = await client(ctx.app).post('/api/auth/login', { email, password: 'nova-senha-segura-1' });
      expect(login.status).toBe(200);

      const again = await ctx.services.auth.requestPasswordReset(email);
      await ctx.prisma.passwordResetToken.updateMany({ where: { usedAt: null }, data: { expiresAt: new Date(Date.now() - 1) } });
      const expired = await client(ctx.app).post('/api/auth/reset-password', { token: again.token, password: 'nova-senha-segura-3' });
      expect(expired.status).toBe(410);
    });
  });

  describe('authorization', () => {
    it('blocks anonymous access to protected routes', async () => {
      const c = client(ctx.app);
      for (const url of ['/api/opportunities', '/api/company', '/api/activity', '/api/agents', '/api/subscription', '/api/dashboard']) {
        expect((await c.get(url)).status).toBe(401);
      }
    });

    it('onboarding sessions cannot reach the dashboard API', async () => {
      const { c } = await onboardToCheckout(ctx.app);
      expect((await c.get('/api/company')).status).toBe(401);
      expect((await c.get('/api/opportunities')).status).toBe(401);
    });

    it('isolates companies from each other', async () => {
      const a = await createActiveUser(ctx.app);
      const b = await createActiveUser(ctx.app);
      const opp = await ctx.prisma.opportunity.create({
        data: { companyId: a.companyId, targetKey: 'alvo-a', targetCompanyName: 'Alvo A', score: 80, confidence: 0.8, signal: 'Expansão' },
      });
      expect((await a.c.get(`/api/opportunities/${opp.id}`)).status).toBe(200);
      expect((await b.c.get(`/api/opportunities/${opp.id}`)).status).toBe(404);
      expect((await b.c.patch(`/api/opportunities/${opp.id}`, { status: 'WON' })).status).toBe(404);
    });

    it('rejects state-changing requests without the CSRF header or from foreign origins', async () => {
      const { email } = await createActiveUser(ctx.app);
      const c = client(ctx.app);
      const noHeader = await c.agent.post('/api/auth/login').send({ email, password: STRONG_PASSWORD });
      expect(noHeader.status).toBe(403);
      const foreign = await c.agent
        .post('/api/auth/login')
        .set('X-Requested-With', 'autopix')
        .set('Origin', 'https://evil.example')
        .send({ email, password: STRONG_PASSWORD });
      expect(foreign.status).toBe(403);
    });
  });
});
