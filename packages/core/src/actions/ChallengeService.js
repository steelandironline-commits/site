import { getPrisma } from '../db.js';
import { verifyPassword } from '../security/password.js';
import { badRequest, conflict, forbidden, gone, notFound } from '../errors.js';
import { verifyOtp } from '../security/otp.js';

const MAX_ATTEMPTS = 5;

/**
 * SensitiveActionChallenge lifecycle. Users confirm inside an authenticated
 * web/PWA session with their account password or a WhatsApp one-time code.
 */
export class ChallengeService {
  constructor({ prisma = getPrisma(), engine }) {
    this.prisma = prisma;
    this.engine = engine;
  }

  async get(id, userId) {
    const c = await this.prisma.sensitiveActionChallenge.findFirst({
      where: { id, userId },
      select: { id: true, action: true, summary: true, status: true, requestedVia: true, mechanism: true, expiresAt: true, createdAt: true, result: true },
    });
    if (!c) throw notFound('Confirmação não encontrada.');
    if (c.status === 'PENDING' && c.expiresAt < new Date()) {
      await this.prisma.sensitiveActionChallenge.update({ where: { id }, data: { status: 'EXPIRED' } });
      c.status = 'EXPIRED';
    }
    return c;
  }

  async confirm(id, { user, session, password, ip }) {
    if (!session || session.scope !== 'FULL') throw forbidden('Entre no TemPix para confirmar.');
    const c = await this.prisma.sensitiveActionChallenge.findFirst({ where: { id, userId: user.id } });
    if (!c) throw notFound('Confirmação não encontrada.');
    if (c.status !== 'PENDING') throw conflict('Esta confirmação já foi utilizada.');
    if (c.mechanism === 'WHATSAPP_OTP') throw badRequest('Use o código enviado ao WhatsApp para confirmar esta ação.');
    if (c.expiresAt < new Date()) {
      await this.prisma.sensitiveActionChallenge.update({ where: { id }, data: { status: 'EXPIRED' } });
      throw gone('Esta confirmação expirou. Solicite a ação novamente.');
    }
    if (c.attempts >= MAX_ATTEMPTS) throw forbidden('Muitas tentativas. Solicite a ação novamente.');

    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
    const ok = await verifyPassword(dbUser.passwordHash, password || '');
    if (!ok) {
      await this.prisma.sensitiveActionChallenge.update({ where: { id }, data: { attempts: { increment: 1 } } });
      throw badRequest('Senha incorreta.');
    }
    const marked = await this.prisma.sensitiveActionChallenge.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedSessionId: session.id },
    });
    if (marked.count !== 1) throw conflict('Esta confirmação já foi utilizada.');

    try {
      const out = await this.engine.execute({
        action: c.action,
        input: c.input,
        channel: 'WEB',
        actor: { userId: user.id, sessionId: session.id, sessionScope: session.scope },
        challengeId: c.id,
        meta: { ip },
      });
      await this.prisma.sensitiveActionChallenge.update({ where: { id }, data: { result: { status: out.status } } });
      return out;
    } catch (err) {
      await this.prisma.sensitiveActionChallenge.update({ where: { id }, data: { status: 'FAILED', result: { error: err.message } } });
      throw err;
    }
  }

  async confirmWhatsApp(id, { user, session, code, ip }) {
    if (!session || session.scope !== 'FULL') throw forbidden('Entre no TemPix para confirmar.');
    const c = await this.prisma.sensitiveActionChallenge.findFirst({ where: { id, userId: user.id } });
    if (!c) throw notFound('Confirmação não encontrada.');
    if (c.status !== 'PENDING') throw conflict('Esta confirmação já foi utilizada.');
    if (c.mechanism !== 'WHATSAPP_OTP') throw conflict('Esta confirmação usa a senha da conta.');
    if (c.expiresAt < new Date()) {
      await this.prisma.sensitiveActionChallenge.update({ where: { id }, data: { status: 'EXPIRED' } });
      throw gone('Esta confirmação expirou. Solicite a ação novamente.');
    }
    if (c.attempts >= MAX_ATTEMPTS) throw forbidden('Muitas tentativas. Solicite a ação novamente.');
    if (!verifyOtp(code, c.id, this.engine.config.secrets.session, c.verificationCodeHash)) {
      await this.prisma.sensitiveActionChallenge.updateMany({ where: { id, status: 'PENDING', attempts: { lt: MAX_ATTEMPTS } }, data: { attempts: { increment: 1 } } });
      throw badRequest('Código incorreto.');
    }
    const marked = await this.prisma.sensitiveActionChallenge.updateMany({
      where: { id, userId: user.id, status: 'PENDING', mechanism: 'WHATSAPP_OTP', attempts: { lt: MAX_ATTEMPTS }, expiresAt: { gt: new Date() } },
      data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedSessionId: session.id },
    });
    if (marked.count !== 1) throw conflict('Esta confirmação já foi utilizada.');

    try {
      const out = await this.engine.execute({
        action: c.action,
        input: c.input,
        channel: 'WEB',
        actor: { userId: user.id, sessionId: session.id, sessionScope: session.scope },
        challengeId: c.id,
        meta: { ip },
      });
      await this.prisma.sensitiveActionChallenge.update({ where: { id }, data: { result: { status: out.status } } });
      return out;
    } catch (err) {
      await this.prisma.sensitiveActionChallenge.update({ where: { id }, data: { status: 'FAILED', result: { error: err.message } } });
      throw err;
    }
  }

  async cancel(id, userId) {
    const { count } = await this.prisma.sensitiveActionChallenge.updateMany({
      where: { id, userId, status: 'PENDING' },
      data: { status: 'CANCELED' },
    });
    if (!count) throw conflict('Nada para cancelar.');
    return { canceled: true };
  }
}
