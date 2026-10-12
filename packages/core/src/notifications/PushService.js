import webpush from 'web-push';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';

/**
 * PushProvider boundary. Today: Web Push (VAPID) for the PWA.
 * Native FCM/APNs providers can implement the same `sendToUser` contract.
 */
export class PushService {
  constructor({ prisma = getPrisma(), config = getConfig(), transport } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.enabled = config.push.enabled || Boolean(transport);
    this.transport =
      transport ||
      (config.push.enabled
        ? (sub, payload) =>
            webpush.sendNotification(sub, payload, {
              vapidDetails: { subject: config.push.subject, publicKey: config.push.publicKey, privateKey: config.push.privateKey },
              TTL: 3600,
            })
        : null);
  }

  publicKey() {
    return this.config.push.enabled ? this.config.push.publicKey : null;
  }

  async subscribe(userId, { endpoint, keys, userAgent }) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId, p256dh: keys.p256dh, auth: keys.auth, userAgent },
      create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    });
  }

  async unsubscribe(userId, endpoint) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  /** @returns {'SENT'|'SKIPPED'} */
  async sendToUser(userId, { title, body, url, tag }) {
    if (!this.transport) return 'SKIPPED';
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (!subs.length) return 'SKIPPED';
    const payload = JSON.stringify({ title, body, url, tag });
    let sent = 0;
    for (const s of subs) {
      try {
        await this.transport({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        sent += 1;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        } else logger.warn('push send failed', { err });
      }
    }
    return sent ? 'SENT' : 'SKIPPED';
  }
}
