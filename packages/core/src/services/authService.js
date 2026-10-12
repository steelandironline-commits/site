import { onlyDigits } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { generateToken, hashToken } from '../security/tokens.js';
import { hashPassword, verifyPassword, burnPasswordCheck } from '../security/password.js';
import { AppError, badRequest, conflict, gone, notFound, unauthorized } from '../errors.js';

const SESSION_INCLUDE = {
  user: {
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      role: true,
      isPlatformAdmin: true,
      companyId: true,
      company: { select: { id: true, name: true, onboardingStep: true, onboardingCompletedAt: true } },
    },
  },
};

export class AuthService {
  constructor({ prisma = getPrisma(), config = getConfig(), email } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.email = email;
  }

  // ---------------------------------------------------------------- sessions

  async createSession(userId, { scope = 'FULL', ip, userAgent } = {}, tx = this.prisma) {
    const token = generateToken();
    const ttl = scope === 'ONBOARDING' ? this.config.session.onboardingTtlMs : this.config.session.ttlMs;
    const session = await tx.session.create({
      data: {
        userId,
        scope,
        tokenHash: hashToken(token, this.config.secrets.session),
        expiresAt: new Date(Date.now() + ttl),
        ipAddress: ip ? String(ip).slice(0, 64) : null,
        userAgent: userAgent ? String(userAgent).slice(0, 300) : null,
      },
    });
    return { token, session };
  }

  /** Resolve a raw cookie token into a live session (sliding expiration). */
  async resolveSession(token) {
    if (!token || typeof token !== 'string' || token.length > 200) return null;
    const tokenHash = hashToken(token, this.config.secrets.session);
    const session = await this.prisma.session.findUnique({ where: { tokenHash }, include: SESSION_INCLUDE });
    if (!session) return null;
    const now = Date.now();
    if (session.expiresAt.getTime() <= now) {
      await this.prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }
    if (session.user.status === 'DISABLED') return null;

    // Slide the window when more than half of the TTL has elapsed.
    const ttl = session.scope === 'ONBOARDING' ? this.config.session.onboardingTtlMs : this.config.session.ttlMs;
    if (session.expiresAt.getTime() - now < ttl / 2) {
      const expiresAt = new Date(now + ttl);
      await this.prisma.session.update({ where: { id: session.id }, data: { expiresAt, lastSeenAt: new Date() } });
      session.expiresAt = expiresAt;
      session.refreshed = true;
    }
    return session;
  }

  async revokeSessionByToken(token) {
    if (!token) return;
    const tokenHash = hashToken(token, this.config.secrets.session);
    await this.prisma.session.deleteMany({ where: { tokenHash } });
  }

  async revokeAllSessions(userId, { exceptSessionId, tx = this.prisma } = {}) {
    const where = { userId };
    if (exceptSessionId) where.id = { not: exceptSessionId };
    const { count } = await tx.session.deleteMany({ where });
    return count;
  }

  async listSessions(userId) {
    return this.prisma.session.findMany({
      where: { userId, scope: 'FULL', expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, ipAddress: true, userAgent: true },
    });
  }

  // ------------------------------------------------------------------- login

  /**
   * Login with CNPJ (company, one login per company) or CPF (pessoa física,
   * collaborator). E-mail is still accepted for accounts created before.
   * Every failure answers the same way, so documents can't be enumerated.
   */
  async login(identifier, password, meta = {}) {
    const raw = String(identifier || '').trim();
    const digits = onlyDigits(raw);
    let where = null;
    if (raw.includes('@')) where = { email: raw.toLowerCase() };
    else if (digits.length === 11 || digits.length === 14) where = { loginId: digits };
    const user = where ? await this.prisma.user.findUnique({ where }) : null;
    if (!user || !user.passwordHash) {
      await burnPasswordCheck(password);
      throw unauthorized('CPF/CNPJ ou senha incorretos.');
    }
    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) throw unauthorized('CPF/CNPJ ou senha incorretos.');
    if (user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_INACTIVE', 'Sua conta ainda não foi ativada.');

    const { token, session } = await this.createSession(user.id, { scope: 'FULL', ...meta });
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { token, session, user };
  }

  // -------------------------------------------------------------- activation

  /** Create a one-time activation token. Returns the plaintext (never stored). */
  async issueActivationToken(userId, tx = this.prisma) {
    const token = generateToken();
    await tx.activationToken.create({
      data: {
        userId,
        tokenHash: hashToken(token, this.config.secrets.activation),
        expiresAt: new Date(Date.now() + this.config.tokens.activationTtlMs),
      },
    });
    return token;
  }

  async #findValidToken(model, token, secret) {
    if (!token || typeof token !== 'string' || token.length > 200) throw notFound('Link inválido.');
    const record = await this.prisma[model].findUnique({
      where: { tokenHash: hashToken(token, secret) },
      include: { user: { select: { id: true, email: true, name: true, status: true, companyId: true } } },
    });
    if (!record) throw notFound('Link inválido ou já utilizado.');
    if (record.usedAt) throw gone('Este link já foi utilizado.');
    if (record.expiresAt.getTime() <= Date.now()) throw gone('Este link expirou.');
    return record;
  }

  async inspectActivationToken(token) {
    const record = await this.#findValidToken('activationToken', token, this.config.secrets.activation);
    return { email: record.user.email, name: record.user.name, expiresAt: record.expiresAt };
  }

  /**
   * Consume an activation token, set the password (Argon2id), activate the
   * user and open a full session. The token is consumed atomically: two
   * concurrent requests with the same token cannot both succeed.
   */
  async activate(token, password, meta = {}) {
    const record = await this.#findValidToken('activationToken', token, this.config.secrets.activation);
    if (record.user.status === 'DISABLED') throw badRequest('Esta conta está desativada.');

    const subscription = await this.prisma.subscription.findUnique({ where: { companyId: record.user.companyId } });
    if (!subscription || subscription.status !== 'ACTIVE') {
      throw conflict('A assinatura ainda não está ativa.');
    }

    const passwordHash = await hashPassword(password);
    return this.prisma.$transaction(async (tx) => {
      const consumed = await tx.activationToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) throw gone('Este link já foi utilizado.');
      // Invalidate every other pending activation token for this user.
      await tx.activationToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      const user = await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, status: 'ACTIVE', passwordChangedAt: new Date(), lastLoginAt: new Date() },
      });
      await tx.session.deleteMany({ where: { userId: user.id, scope: 'ONBOARDING' } });
      const { token: sessionToken, session } = await this.createSession(user.id, { scope: 'FULL', ...meta }, tx);
      return { user, token: sessionToken, session };
    });
  }

  // ---------------------------------------------------------- password reset

  /** Always resolves the same way to avoid account enumeration. */
  async requestPasswordReset(email) {
    const user = await this.prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
    if (!user || user.status !== 'ACTIVE') return { sent: false };

    // Invalidate older outstanding reset tokens.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    const token = generateToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token, this.config.secrets.passwordReset),
        expiresAt: new Date(Date.now() + this.config.tokens.passwordResetTtlMs),
      },
    });
    const link = `${this.config.appUrl}/reset-password/${token}`;
    if (this.email) await this.email.passwordResetEmail({ to: user.email, name: user.name, link });
    return { sent: true, token };
  }

  async inspectResetToken(token) {
    const record = await this.#findValidToken('passwordResetToken', token, this.config.secrets.passwordReset);
    return { email: record.user.email, expiresAt: record.expiresAt };
  }

  async resetPassword(token, password) {
    const record = await this.#findValidToken('passwordResetToken', token, this.config.secrets.passwordReset);
    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) throw gone('Este link já foi utilizado.');
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash, passwordChangedAt: new Date() } });
      // A password reset signs out every device.
      await tx.session.deleteMany({ where: { userId: record.userId } });
    });
    return { ok: true };
  }

  async changePassword(userId, currentPassword, newPassword, currentSessionId) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, currentPassword))) {
      throw badRequest('Senha atual incorreta.');
    }
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: new Date() } }),
      this.prisma.session.deleteMany({ where: { userId, id: { not: currentSessionId } } }),
    ]);
    return { ok: true };
  }
}
