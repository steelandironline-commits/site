import { getPrisma } from '../db.js';
import { ACTIVITY_CHANNEL } from '../realtime/channel.js';
import { getAgentMap } from './agentRegistry.js';
import { logger } from '../logger.js';

export const ACTIVITY_SELECT = {
  id: true,
  companyId: true,
  agentId: true,
  opportunityId: true,
  jobId: true,
  type: true,
  title: true,
  description: true,
  source: true,
  severity: true,
  isDemo: true,
  metadata: true,
  createdAt: true,
  agent: { select: { key: true, name: true } },
};

/**
 * ActivityService — the single write path for activity events. Every event
 * is persisted first and then announced through pg_notify, so the realtime
 * stream only ever carries events that actually exist in the database.
 */
export class ActivityService {
  constructor({ prisma = getPrisma() } = {}) {
    this.prisma = prisma;
  }

  async record(input, tx = this.prisma) {
    const {
      companyId,
      userId = null,
      agentKey = null,
      opportunityId = null,
      jobId = null,
      type,
      title,
      description = null,
      source = null,
      severity = 'INFO',
      metadata = null,
      isDemo = false,
    } = input;
    if (!companyId || !type || !title) throw new Error('ActivityService.record: companyId, type and title are required');

    let agentId = null;
    if (agentKey) {
      const agents = await getAgentMap(this.prisma);
      agentId = agents[agentKey]?.id ?? null;
    }

    const event = await tx.activityEvent.create({
      data: {
        companyId,
        userId,
        agentId,
        opportunityId,
        jobId,
        type,
        title: String(title).slice(0, 300),
        description: description ? String(description).slice(0, 2000) : null,
        source,
        severity,
        metadata: metadata ?? undefined,
        isDemo,
      },
      select: ACTIVITY_SELECT,
    });

    try {
      const payload = JSON.stringify({ id: event.id, companyId });
      await tx.$executeRaw`SELECT pg_notify(${ACTIVITY_CHANNEL}, ${payload})`;
    } catch (err) {
      // Notification failure must never lose the event; pollers will pick it up.
      logger.warn('activity notify failed', { err });
    }
    return event;
  }

  async list(companyId, { type, q, before, limit = 50 } = {}) {
    const where = { companyId };
    if (type) where.type = type;
    if (before) where.createdAt = { lt: new Date(before) };
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { source: { contains: q, mode: 'insensitive' } },
      ];
    }
    const items = await this.prisma.activityEvent.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: ACTIVITY_SELECT,
    });
    const hasMore = items.length > limit;
    return { items: items.slice(0, limit), hasMore };
  }

  async since(companyId, sinceDate, limit = 100) {
    return this.prisma.activityEvent.findMany({
      where: { companyId, createdAt: { gt: sinceDate } },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: ACTIVITY_SELECT,
    });
  }

  async getById(id) {
    return this.prisma.activityEvent.findUnique({ where: { id }, select: ACTIVITY_SELECT });
  }
}
