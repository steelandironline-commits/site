import { NOTIFICATION_CATEGORIES, NOTIFICATION_CHANNELS, defaultPreference } from '@autopix/shared';
import { getPrisma } from '../db.js';

/** NotificationPreference per user × channel × category (with defaults). */
export class PreferenceService {
  constructor({ prisma = getPrisma() } = {}) {
    this.prisma = prisma;
  }

  async matrix(userId) {
    const rows = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const stored = new Map(rows.map((r) => [`${r.channel}:${r.category}`, r.enabled]));
    const out = {};
    for (const channel of NOTIFICATION_CHANNELS) {
      out[channel] = {};
      for (const category of NOTIFICATION_CATEGORIES) {
        const key = `${channel}:${category}`;
        out[channel][category] = stored.has(key) ? stored.get(key) : defaultPreference(channel, category);
      }
    }
    return out;
  }

  /** changes: [{ channel, category, enabled }] */
  async update(userId, changes) {
    for (const { channel, category, enabled } of changes) {
      await this.prisma.notificationPreference.upsert({
        where: { userId_channel_category: { userId, channel, category } },
        update: { enabled },
        create: { userId, channel, category, enabled },
      });
    }
    return this.matrix(userId);
  }

  async isEnabled(userId, channel, category) {
    const row = await this.prisma.notificationPreference.findUnique({
      where: { userId_channel_category: { userId, channel, category } },
    });
    return row ? row.enabled : defaultPreference(channel, category);
  }
}
