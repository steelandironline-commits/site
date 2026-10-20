import { onlyDigits } from '@autopix/shared';
import { urlFor } from '@autopix/areas/urls';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { generateToken, hashToken } from '../security/tokens.js';
import { hashPassword, verifyPassword, burnPasswordCheck } from '../security/password.js';
import { AppError, badRequest, conflict, gone, notFound, unauthorized, unavailable } from '../errors.js';
import { createOtp, hashOtp, verifyOtp } from '../security/otp.js';
import { areaOfUser, hostAccepts } from '../security/area.js';

const LOGIN_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

/** O que `areaOfUser` precisa de um usuário: a flag de admin e o tipo da empresa dona. */
const AREA_SELECT = { isPlatformAdmin: true, company: { select: { accountType: true } } };

const WRONG_AREA_MESSAGE = 'Esta sessão não vale neste endereço. Entre novamente.';

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
      company: { select: { id: true, name: true, accountType: true, onboardingStep: true, onboardingCompletedAt: true, city: true, state: true } },
    },
  },
};

export class AuthService {
  constructor({ prisma = getPrisma(), config = getConfig(), email, whatsappMessenger } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.email = email;
    this.whatsappMessenger = whatsappMessenger;
  }

  // ---------------------------------------------------------------- sessions

  /**
   * Opens a session and records its area (the token's "aud"): ADMIN for a platform admin, else
   * the area of the owning company. `hostArea` is `req.area`. In area mode the session is created
   * only when that host accepts the user's area (acceptedAreas); the login flows check it first
   * and answer like a wrong password, so this is the last line of defence, not the user-facing
   * path. In legacy mode every host accepts every area: the area is just recorded.
   */
  async createSession(userId, { scope = 'FULL', hostArea = null, ip, userAgent } = {}, tx = this.prisma) {
    const owner = await tx.user.findUnique({ where: { id: userId }, select: AREA_SELECT });
    if (!owner) throw notFound('Usuário não encontrado.');
    const area = areaOfUser(owner);
    if (!hostAccepts(hostArea, area, this.config)) throw new AppError(403, 'WRONG_AREA', WRONG_AREA_MESSAGE);
    const token = generateToken();
    const ttl = scope === 'ONBOARDING' ? this.config.session.onboardingTtlMs : this.config.session.ttlMs;
    const session = await tx.session.create({
      data: {
        userId,
        scope,
        area,
        tokenHash: hashToken(token, this.config.secrets.session),
        expiresAt: new Date(Date.now() + ttl),
        ipAddress: ip ? String(ip).slice(0, 64) : null,
        userAgent: userAgent ? String(userAgent).slice(0, 300) : null,
      },
    });
    return { token, session };
  }

  /**
   * Resolve a raw cookie token into a live session (sliding expiration).
   *
   * Area mode (ARQUITETURA 6.3) adds the checks that the cookie name alone does not give, because a
   * bearer token is not tied to a host:
   *  - a session without area is invalid (fail closed; it is left alone, it only expires);
   *  - the stored area must be the area of its owner, or the session is revoked: a forged or
   *    stale "aud" never authenticates and never survives;
   *  - the host must accept that area, or the answer is 403 WRONG_AREA.
   * Legacy mode skips all of it: old sessions (no area) stay valid, nothing changes.
   */
  async resolveSession(token, { hostArea = null } = {}) {
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

    if (this.config.areas?.enabled) {
      if (!session.area) return null;
      let ownerArea = null;
      try {
        ownerArea = areaOfUser(session.user);
      } catch {
        // Owner without a company type: nothing to compare with, so the session is not valid.
      }
      if (session.area !== ownerArea) {
        await this.prisma.session.delete({ where: { id: session.id } }).catch(() => {});
        return null;
      }
      if (!hostAccepts(hostArea, session.area, this.config)) throw new AppError(403, 'WRONG_AREA', WRONG_AREA_MESSAGE);
    }

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
   * Every failure answers the same way, so documents can't be enumerated. In area mode an
   * account of another area is "unknown" here: same message, same status, and the password
   * check is burned instead of done, so the time is the same too.
   */
  async login(identifier, password, meta = {}) {
    const raw = String(identifier || '').trim();
    const digits = onlyDigits(raw);
    let where = null;
    if (raw.includes('@')) where = { email: raw.toLowerCase() };
    else if (digits.length === 11 || digits.length === 14) where = { loginId: digits };
    const found = where ? await this.prisma.user.findUnique({ where, include: { company: { select: { accountType: true } } } }) : null;
    const user = found && hostAccepts(meta.hostArea, areaOfUser(found), this.config) ? found : null;
    if (!user || !user.passwordHash) {
      await burnPasswordCheck(password);
      throw unauthorized('CPF/CNPJ ou senha incorretos.');
    }
    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) throw unauthorized('CPF/CNPJ ou senha incorretos.');
    if (user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_INACTIVE', 'Sua conta ainda não foi ativada.');

    const connection = await this.prisma.whatsAppConnection.findUnique({ where: { userId: user.id } });
    if (connection?.status === 'VERIFIED') {
      const provider = this.whatsappMessenger?.provider;
      if (!provider?.enabled || (provider.name !== 'mock' && !provider.templates?.authentication)) {
        throw unavailable('A verificação por WhatsApp requer o provedor da Meta e um template de autenticação aprovado.');
      }
      return this.#startLoginChallenge(user, connection, meta);
    }

    const { token, session } = await this.createSession(user.id, { scope: 'FULL', ...meta });
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { token, session, user, mfaRequired: false };
  }

  async #startLoginChallenge(user, connection, meta = {}) {
    const code = createOtp();
    const expiresAt = new Date(Date.now() + LOGIN_CHALLENGE_TTL_MS);
    await this.prisma.loginChallenge.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } });
    const challenge = await this.prisma.loginChallenge.create({
      data: {
        userId: user.id,
        codeHash: 'pending',
        area: areaOfUser(user),
        expiresAt,
        ipAddress: meta.ip ? String(meta.ip).slice(0, 64) : null,
        userAgent: meta.userAgent ? String(meta.userAgent).slice(0, 300) : null,
      },
    });
    await this.prisma.loginChallenge.update({ where: { id: challenge.id }, data: { codeHash: hashOtp(code, challenge.id, this.config.secrets.session) } });
    const sent = await this.whatsappMessenger.send(connection, 'sendAuthenticationCode', [{ code }]);
    if (sent.status !== 'SENT') {
      await this.prisma.loginChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
      throw unavailable('Não foi possível enviar o código pelo WhatsApp. Tente novamente mais tarde.');
    }
    return { mfaRequired: true, challengeId: challenge.id, expiresAt };
  }

  async verifyLoginCode(challengeId, code, meta = {}) {
    const challenge = await this.prisma.loginChallenge.findUnique({ where: { id: challengeId }, include: { user: true } });
    if (!challenge || challenge.consumedAt) throw unauthorized('Código inválido ou expirado. Entre novamente.');
    // Area mode: the code is only good on the host where the login began. Anywhere else (or on a
    // challenge from before the areas) it is just an invalid code, and no attempt is spent.
    if (this.config.areas?.enabled && (!challenge.area || !hostAccepts(meta.hostArea, challenge.area, this.config))) {
      throw unauthorized('Código inválido ou expirado. Entre novamente.');
    }
    if (challenge.expiresAt <= new Date()) {
      await this.prisma.loginChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: new Date() } });
      throw gone('Este código expirou. Entre novamente para receber outro.');
    }
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) throw unauthorized('Muitas tentativas. Entre novamente para receber outro código.');
    if (!verifyOtp(code, challenge.id, this.config.secrets.session, challenge.codeHash)) {
      await this.prisma.loginChallenge.updateMany({ where: { id: challenge.id, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } }, data: { attempts: { increment: 1 } } });
      throw badRequest('Código incorreto.');
    }
    if (challenge.user.status !== 'ACTIVE') throw unauthorized('Código inválido ou expirado. Entre novamente.');
    return this.prisma.$transaction(async (tx) => {
      const used = await tx.loginChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: OTP_MAX_ATTEMPTS } },
        data: { consumedAt: new Date() },
      });
      if (used.count !== 1) throw unauthorized('Código inválido ou expirado. Entre novamente.');
      const { token, session } = await this.createSession(challenge.userId, { scope: 'FULL', ...meta }, tx);
      const user = await tx.user.update({ where: { id: challenge.userId }, data: { lastLoginAt: new Date() } });
      return { token, session, user };
    });
  }

  // -------------------------------------------------------------- activation

  /** Create a one-time activation token. Returns the plaintext (never stored). */
  async issueActivationToken(userId, tx = this.prisma) {
    return (await this.issueActivation(userId, tx)).token;
  }

  /**
   * Same, and also says which area the link belongs to (the owner's area, stored on the token).
   * Build the link with `activationLink(token, area)` after the transaction.
   */
  async issueActivation(userId, tx = this.prisma) {
    const owner = await tx.user.findUnique({ where: { id: userId }, select: AREA_SELECT });
    if (!owner) throw notFound('Usuário não encontrado.');
    const area = areaOfUser(owner);
    const token = generateToken();
    await tx.activationToken.create({
      data: {
        userId,
        area,
        tokenHash: hashToken(token, this.config.secrets.activation),
        expiresAt: new Date(Date.now() + this.config.tokens.activationTtlMs),
      },
    });
    return { token, area };
  }

  /** Absolute activation link: on the host of the account's area (APP_URL in legacy mode). */
  activationLink(token, area) {
    return urlFor(area, `/activate/${token}`, this.config);
  }

  async #findValidToken(model, token, secret, hostArea = null) {
    if (!token || typeof token !== 'string' || token.length > 200) throw notFound('Link inválido.');
    const record = await this.prisma[model].findUnique({
      where: { tokenHash: hashToken(token, secret) },
      include: { user: { select: { id: true, email: true, name: true, status: true, companyId: true, ...AREA_SELECT } } },
    });
    if (!record) throw notFound('Link inválido ou já utilizado.');
    // Area mode: a link works only on the host of its area (a token from before the areas takes
    // its owner's). Anywhere else it answers exactly like a token that does not exist, before the
    // used/expired answers, so it reveals nothing.
    if (this.config.areas?.enabled && !hostAccepts(hostArea, record.area ?? areaOfUser(record.user), this.config)) {
      throw notFound('Link inválido ou já utilizado.');
    }
    if (record.usedAt) throw gone('Este link já foi utilizado.');
    if (record.expiresAt.getTime() <= Date.now()) throw gone('Este link expirou.');
    return record;
  }

  async inspectActivationToken(token, { hostArea = null } = {}) {
    const record = await this.#findValidToken('activationToken', token, this.config.secrets.activation, hostArea);
    return { email: record.user.email, name: record.user.name, expiresAt: record.expiresAt };
  }

  /**
   * Consume an activation token, set the password (Argon2id), activate the
   * user and open a full session. The token is consumed atomically: two
   * concurrent requests with the same token cannot both succeed.
   */
  async activate(token, password, meta = {}) {
    const record = await this.#findValidToken('activationToken', token, this.config.secrets.activation, meta.hostArea);
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
        data: { passwordHash, status: 'ACTIVE', passwordChangedAt: new Date(), lastLoginAt: new Date(), emailVerifiedAt: new Date() },
      });
      await tx.session.deleteMany({ where: { userId: user.id, scope: 'ONBOARDING' } });
      const { token: sessionToken, session } = await this.createSession(user.id, { scope: 'FULL', ...meta }, tx);
      return { user, token: sessionToken, session };
    });
  }

  // ---------------------------------------------------------- password reset

  /**
   * Always resolves the same way to avoid account enumeration. In area mode an account of another
   * area is treated as unknown: nothing is stored and no e-mail goes out.
   */
  async requestPasswordReset(email, { hostArea = null } = {}) {
    const user = await this.prisma.user.findUnique({ where: { email: String(email).toLowerCase() }, include: { company: { select: { accountType: true } } } });
    if (!user || user.status !== 'ACTIVE') return { sent: false };
    const area = areaOfUser(user);
    if (!hostAccepts(hostArea, area, this.config)) return { sent: false };

    // Invalidate older outstanding reset tokens.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    const token = generateToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        area,
        tokenHash: hashToken(token, this.config.secrets.passwordReset),
        expiresAt: new Date(Date.now() + this.config.tokens.passwordResetTtlMs),
      },
    });
    const link = urlFor(area, `/reset-password/${token}`, this.config);
    if (this.email) await this.email.passwordResetEmail({ to: user.email, name: user.name, link });
    return { sent: true, token };
  }

  async inspectResetToken(token, { hostArea = null } = {}) {
    const record = await this.#findValidToken('passwordResetToken', token, this.config.secrets.passwordReset, hostArea);
    return { email: record.user.email, expiresAt: record.expiresAt };
  }

  async resetPassword(token, password, { hostArea = null } = {}) {
    const record = await this.#findValidToken('passwordResetToken', token, this.config.secrets.passwordReset, hostArea);
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
