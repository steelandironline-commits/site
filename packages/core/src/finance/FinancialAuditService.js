import crypto from 'node:crypto';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';

const SOURCES = new Set(['WEB', 'PWA', 'WHATSAPP', 'SYSTEM', 'WORKER', 'ADMIN', 'API']);

/**
 * Append-only financial audit trail (UPDATE/DELETE blocked by a DB trigger).
 * IPs are stored as keyed hashes; no unnecessary personal data.
 */
export class FinancialAuditService {
  constructor({ prisma = getPrisma(), config = getConfig() } = {}) {
    this.prisma = prisma;
    this.config = config;
  }

  hashIp(ip) {
    return ip ? crypto.createHmac('sha256', this.config.secrets.session).update(`ip:${ip}`).digest('hex').slice(0, 32) : null;
  }

  async log({ action, source = 'SYSTEM', userId = null, companyId = null, transactionId = null, paymentId = null, ip, userAgent, metadata }, tx = this.prisma) {
    try {
      return await tx.financialAuditLog.create({
        data: {
          action,
          source: SOURCES.has(source) ? source : 'SYSTEM',
          userId,
          companyId,
          transactionId,
          paymentId,
          ipAddressHash: this.hashIp(ip),
          userAgent: userAgent ? String(userAgent).slice(0, 200) : null,
          metadata: metadata ?? undefined,
        },
      });
    } catch (err) {
      // Audit failures must be visible; inside a transaction they abort it.
      logger.error('financial audit log failed', { action, err });
      throw err;
    }
  }

  async list({ companyId, transactionId, paymentId, limit = 100 } = {}) {
    return this.prisma.financialAuditLog.findMany({
      where: { ...(companyId ? { companyId } : {}), ...(transactionId ? { transactionId } : {}), ...(paymentId ? { paymentId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

/** Map an ActionEngine channel/client to an audit source. */
export function auditSourceFor(channel, actor = {}) {
  if (channel === 'WHATSAPP') return 'WHATSAPP';
  if (channel === 'SYSTEM') return actor.worker ? 'WORKER' : 'SYSTEM';
  if (actor.admin) return 'ADMIN';
  if (actor.client === 'pwa') return 'PWA';
  if (channel === 'API') return 'API';
  return 'WEB';
}
