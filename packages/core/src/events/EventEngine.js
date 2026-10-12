import { DOMAIN_EVENTS } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { logger } from '../logger.js';
import { ActivityService } from '../services/activityService.js';

const MAX_ATTEMPTS = 5;

/**
 * EventEngine — domain event architecture.
 *
 *  publish():  stores the event (inside the caller's transaction when given)
 *              and, optionally, the dashboard ActivityEvent that represents it.
 *  dispatch:   handlers (notifications: WhatsApp, e-mail, push…) run
 *              asynchronously from the stored row — at-least-once, with
 *              retries; handlers must be idempotent (deliveries are unique
 *              per event/user/channel).
 */
export class EventEngine {
  constructor({ prisma = getPrisma(), handlers = [], autoDispatch = true } = {}) {
    this.prisma = prisma;
    this.autoDispatch = autoDispatch;
    this.activity = new ActivityService({ prisma });
    this.handlers = [...handlers];
  }

  use(handler) {
    this.handlers.push(handler);
    return this;
  }

  /**
   * @param {object} e
   * @param {string} e.type            one of DOMAIN_EVENTS
   * @param {string} e.companyId
   * @param {string} [e.userId]
   * @param {string} [e.aggregateType] e.g. 'opportunity', 'payment'
   * @param {string} [e.aggregateId]
   * @param {object} [e.payload]       safe, non-secret data
   * @param {object} [e.activity]      ActivityService.record input (minus ids)
   */
  async publish({ type, companyId, userId = null, aggregateType = null, aggregateId = null, payload = null, isDemo = false, activity = null }, tx = this.prisma) {
    if (!DOMAIN_EVENTS[type]) throw new Error(`Unknown domain event type: ${type}`);
    const event = await tx.domainEvent.create({
      data: { type, companyId, userId, aggregateType, aggregateId, payload: payload ?? undefined, isDemo },
    });
    if (activity) {
      await this.activity.record(
        {
          companyId,
          userId,
          isDemo,
          ...activity,
          metadata: { ...(activity.metadata || {}), domainEventId: event.id, eventType: type },
        },
        tx,
      );
    }
    return event;
  }

  /** Claim and process pending events. Safe to run from several processes. */
  async dispatchPending({ limit = 25 } = {}) {
    const claimed = await this.prisma.$queryRaw`
      UPDATE "DomainEvent" SET "lockedAt" = NOW(), attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM "DomainEvent"
        WHERE "processedAt" IS NULL
          AND attempts < ${MAX_ATTEMPTS}
          AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - INTERVAL '5 minutes')
        ORDER BY "createdAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;
    let processed = 0;
    for (const { id } of claimed) {
      const event = await this.prisma.domainEvent.findUnique({ where: { id } });
      try {
        for (const h of this.handlers) await h.handle(event);
        await this.prisma.domainEvent.update({ where: { id }, data: { processedAt: new Date(), lockedAt: null, error: null } });
        processed += 1;
      } catch (err) {
        logger.error('domain event handler failed', { eventId: id, type: event.type, err });
        await this.prisma.domainEvent.update({
          where: { id },
          data: { lockedAt: null, error: String(err.message || err).slice(0, 1000) },
        });
      }
    }
    return processed;
  }

  /** Fire-and-forget dispatch after a request; the worker is the safety net. */
  kick() {
    if (!this.autoDispatch) return;
    setImmediate(() => this.dispatchPending().catch((err) => logger.warn('event dispatch kick failed', { err })));
  }

  async list(companyId, { limit = 50, before } = {}) {
    return this.prisma.domainEvent.findMany({
      where: { companyId, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, type: true, aggregateType: true, aggregateId: true, payload: true, isDemo: true, createdAt: true, processedAt: true },
    });
  }
}
