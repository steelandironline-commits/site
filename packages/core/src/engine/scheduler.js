import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { JobQueue } from './jobQueue.js';
import { SubscriptionService } from '../services/subscriptionService.js';

/**
 * Periodic housekeeping + scheduling:
 *  - expire subscriptions past their period,
 *  - recover jobs from crashed workers,
 *  - enqueue a search for every ACTIVE company whose last run is older than
 *    SEARCH_INTERVAL_MINUTES.
 *
 * Area mode (ARQUITETURA 6.6): the opportunity search is a CNPJ product, and a PERSON account also
 * holds an ACTIVE subscription (free access), so only COMPANY accounts are scheduled. Legacy mode
 * schedules every ACTIVE subscription, as before.
 */
export class Scheduler {
  constructor({ prisma = getPrisma(), config = getConfig() } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.queue = new JobQueue({ prisma });
    this.subscriptions = new SubscriptionService({ prisma, config });
  }

  async tick() {
    const expired = await this.subscriptions.sweepExpired();
    const recovered = await this.queue.recoverStale();
    const cutoff = new Date(Date.now() - this.config.search.intervalMinutes * 60_000);

    const active = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE', company: { agentsPaused: false, ...(this.config.areas?.enabled ? { accountType: 'COMPANY' } : {}) } },
      select: { companyId: true },
    });
    let enqueued = 0;
    for (const { companyId } of active) {
      const recent = await this.prisma.searchJob.findFirst({
        where: {
          companyId,
          OR: [{ status: { in: ['QUEUED', 'RUNNING'] } }, { createdAt: { gt: cutoff } }],
        },
        select: { id: true },
      });
      if (recent) continue;
      const { created } = await this.queue.enqueue(companyId, { trigger: 'SCHEDULED', isDemo: this.config.demoMode });
      if (created) enqueued += 1;
    }
    return { expired, recovered, enqueued };
  }
}
