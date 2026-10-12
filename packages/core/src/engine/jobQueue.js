import os from 'node:os';
import { getPrisma } from '../db.js';

/**
 * Postgres-backed job queue for SearchJob rows.
 * Claiming uses `FOR UPDATE SKIP LOCKED`, so several worker replicas can run
 * safely without Redis. Stale RUNNING jobs (crashed worker) are re-queued.
 */
export class JobQueue {
  constructor({ prisma = getPrisma(), workerId = `${os.hostname()}:${process.pid}` } = {}) {
    this.prisma = prisma;
    this.workerId = workerId;
  }

  /** Enqueue a search for a company unless one is already queued/running. */
  async enqueue(companyId, { trigger = 'SCHEDULED', runAt = new Date(), isDemo = false, configVersion = 1 } = {}, tx = this.prisma) {
    const existing = await tx.searchJob.findFirst({
      where: { companyId, status: { in: ['QUEUED', 'RUNNING'] } },
      select: { id: true, status: true },
    });
    if (existing) {
      if (existing.status === 'QUEUED' && trigger !== 'SCHEDULED') {
        // Pull an existing queued job forward for user-driven triggers.
        await tx.searchJob.update({ where: { id: existing.id }, data: { runAt, trigger, configVersion, isDemo } });
      }
      return { job: existing, created: false };
    }
    const job = await tx.searchJob.create({ data: { companyId, trigger, runAt, isDemo, configVersion } });
    return { job, created: true };
  }

  /** Atomically claim the next due job. */
  async claim() {
    const rows = await this.prisma.$queryRaw`
      UPDATE "SearchJob" SET
        status = 'RUNNING',
        "lockedAt" = NOW(),
        "lockedBy" = ${this.workerId},
        "startedAt" = NOW(),
        attempts = attempts + 1,
        "updatedAt" = NOW()
      WHERE id = (
        SELECT id FROM "SearchJob"
        WHERE status = 'QUEUED' AND "runAt" <= NOW()
        ORDER BY "runAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;
    if (!rows.length) return null;
    return this.prisma.searchJob.findUnique({ where: { id: rows[0].id } });
  }

  async complete(jobId, stats = {}) {
    return this.prisma.searchJob.update({
      where: { id: jobId },
      data: { status: 'COMPLETED', finishedAt: new Date(), lockedAt: null, lockedBy: null, error: null, ...stats },
    });
  }

  async fail(job, error) {
    const retry = job.attempts < job.maxAttempts;
    const backoffMs = Math.min(30 * 60_000, 60_000 * 2 ** job.attempts);
    return this.prisma.searchJob.update({
      where: { id: job.id },
      data: {
        status: retry ? 'QUEUED' : 'FAILED',
        runAt: retry ? new Date(Date.now() + backoffMs) : job.runAt,
        finishedAt: retry ? null : new Date(),
        lockedAt: null,
        lockedBy: null,
        error: String(error?.message || error).slice(0, 1000),
      },
    });
  }

  /** Re-queue jobs whose worker died mid-run. */
  async recoverStale(maxAgeMs = 15 * 60_000) {
    const { count } = await this.prisma.searchJob.updateMany({
      where: { status: 'RUNNING', lockedAt: { lt: new Date(Date.now() - maxAgeMs) } },
      data: { status: 'QUEUED', lockedAt: null, lockedBy: null },
    });
    return count;
  }
}
