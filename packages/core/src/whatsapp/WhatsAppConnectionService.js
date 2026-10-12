import crypto from 'node:crypto';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { hashToken, safeEqual } from '../security/tokens.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { normalizePhone, phoneVariants, maskPhone } from './phone.js';

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/**
 * Secure WhatsApp linking: the signed-in user registers a number and gets a
 * one-time code; ownership is proven when a message containing that code
 * ARRIVES FROM that number through the verified provider webhook.
 * A linked number identifies the user for low-risk actions only — financial
 * actions always require step-up confirmation in the authenticated app.
 */
export class WhatsAppConnectionService {
  constructor({ prisma = getPrisma(), config = getConfig(), events, provider } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.events = events;
    this.provider = provider;
  }

  #hash(code) {
    return hashToken(`wa:${code}`, this.config.secrets.session);
  }

  view(conn) {
    if (!conn) return null;
    return {
      id: conn.id,
      phoneNumber: maskPhone(conn.phoneNumber),
      status: conn.status,
      provider: conn.provider,
      verifiedAt: conn.verifiedAt,
      verificationExpiresAt: conn.status === 'PENDING' ? conn.verificationExpiresAt : null,
      createdAt: conn.createdAt,
    };
  }

  async get(userId) {
    return this.view(await this.prisma.whatsAppConnection.findUnique({ where: { userId } }));
  }

  async start(user, rawPhone) {
    const phoneNumber = normalizePhone(rawPhone);
    if (!phoneNumber) throw badRequest('Número de WhatsApp inválido.', { fields: { phoneNumber: 'Use DDD + número' } });
    const variants = phoneVariants(phoneNumber);
    const taken = await this.prisma.whatsAppConnection.findFirst({ where: { phoneNumber: { in: variants }, NOT: { userId: user.id } } });
    if (taken?.status === 'VERIFIED') throw conflict('Este número já está vinculado a outra conta.');
    if (taken) await this.prisma.whatsAppConnection.delete({ where: { id: taken.id } }); // stale pending claim

    const code = String(crypto.randomInt(100000, 1000000));
    const data = {
      phoneNumber,
      provider: this.provider?.name || this.config.whatsapp.provider,
      status: 'PENDING',
      verifiedAt: null,
      providerContactId: null,
      verificationCodeHash: this.#hash(code),
      verificationExpiresAt: new Date(Date.now() + CODE_TTL_MS),
      verificationAttempts: 0,
    };
    const conn = await this.prisma.whatsAppConnection.upsert({ where: { userId: user.id }, update: data, create: { userId: user.id, ...data } });
    const business = this.config.whatsapp.businessNumber;
    const text = `TEMPIX ${code}`;
    return {
      connection: this.view(conn),
      // Shown only to the authenticated user; worthless without the phone.
      verification: {
        code,
        message: text,
        businessNumber: business,
        waLink: business ? `https://wa.me/${business}?text=${encodeURIComponent(text)}` : null,
        expiresAt: data.verificationExpiresAt,
      },
    };
  }

  async revoke(userId) {
    const conn = await this.prisma.whatsAppConnection.findUnique({ where: { userId } });
    if (!conn) throw notFound('Nenhum WhatsApp vinculado.');
    await this.prisma.whatsAppConnection.delete({ where: { id: conn.id } });
    return { revoked: true };
  }

  async findVerifiedByPhone(from) {
    return this.prisma.whatsAppConnection.findFirst({
      where: { status: 'VERIFIED', OR: [{ phoneNumber: { in: phoneVariants(from) } }, { providerContactId: String(from) }] },
      include: { user: true },
    });
  }

  /** Try to verify a PENDING connection from an inbound message. */
  async verifyInbound(from, text) {
    const match = /(\d{6})/.exec(String(text || ''));
    const conn = await this.prisma.whatsAppConnection.findFirst({
      where: { status: 'PENDING', phoneNumber: { in: phoneVariants(from) } },
    });
    if (!conn) return { outcome: 'NO_PENDING' };
    if (!match) return { outcome: 'NO_CODE', connection: conn };
    if (conn.verificationAttempts >= MAX_ATTEMPTS) return { outcome: 'LOCKED', connection: conn };
    if (!conn.verificationExpiresAt || conn.verificationExpiresAt < new Date()) return { outcome: 'EXPIRED', connection: conn };
    if (!safeEqual(this.#hash(match[1]), conn.verificationCodeHash)) {
      await this.prisma.whatsAppConnection.update({ where: { id: conn.id }, data: { verificationAttempts: { increment: 1 } } });
      return { outcome: 'WRONG_CODE', connection: conn };
    }
    const verified = await this.prisma.whatsAppConnection.update({
      where: { id: conn.id },
      data: { status: 'VERIFIED', verifiedAt: new Date(), providerContactId: String(from), verificationCodeHash: null, verificationExpiresAt: null },
      include: { user: true },
    });
    await this.events?.publish({
      type: 'WHATSAPP_LINKED',
      companyId: verified.user.companyId,
      userId: verified.userId,
      aggregateType: 'whatsappConnection',
      aggregateId: verified.id,
      activity: { type: 'SYSTEM', title: 'WhatsApp conectado', description: maskPhone(verified.phoneNumber), source: 'whatsapp', severity: 'SUCCESS' },
    });
    return { outcome: 'VERIFIED', connection: verified };
  }
}
