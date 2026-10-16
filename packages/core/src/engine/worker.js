import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';
import { JobQueue } from './jobQueue.js';
import { Scheduler } from './scheduler.js';
import { AgentOrchestrator } from './AgentOrchestrator.js';
import { ensureAgents } from '../services/agentRegistry.js';
import { buildPlatform } from '../platform.js';

/**
 * Background worker loop. Runs in its own Railway service (apps/worker) or
 * embedded in the API process when EMBEDDED_WORKER=true.
 */
export function startWorker({ pollMs = 3000, scheduleMs = 60_000, reconcileMs = 60_000, concurrency = 2 } = {}) {
  const prisma = getPrisma();
  const config = getConfig();
  const queue = new JobQueue({ prisma });
  const scheduler = new Scheduler({ prisma, config });
  const platform = buildPlatform({ prisma, config });
  const events = platform.events;
  const orchestrator = new AgentOrchestrator({ prisma, config, events });

  let stopping = false;
  let running = 0;
  const timers = [];

  async function processOne() {
    const job = await queue.claim();
    if (!job) return false;
    running += 1;
    const started = Date.now();
    try {
      logger.info('job started', { jobId: job.id, companyId: job.companyId, trigger: job.trigger });
      const stats = await orchestrator.runJob(job);
      await queue.complete(job.id, {
        companiesAnalyzed: stats.companiesAnalyzed,
        signalsDetected: stats.signalsDetected,
        opportunitiesCreated: stats.opportunitiesCreated,
        isDemo: config.demoMode,
      });
      logger.info('job completed', { jobId: job.id, ms: Date.now() - started, ...stats });
    } catch (err) {
      logger.error('job failed', { jobId: job.id, err });
      await queue.fail(job, err).catch(() => {});
      await events
        .publish({
          type: 'AGENT_ERROR',
          companyId: job.companyId,
          aggregateType: 'searchJob',
          aggregateId: job.id,
          isDemo: config.demoMode,
          payload: { attempt: job.attempts },
          activity: {
            jobId: job.id,
            type: 'AGENT',
            title: 'Falha em um ciclo de busca',
            description: 'O ciclo será repetido automaticamente.',
            source: 'AgentOrchestrator',
            severity: 'ERROR',
          },
        })
        .catch(() => {});
    } finally {
      running -= 1;
    }
    return true;
  }

  async function pollLoop() {
    if (stopping) return;
    try {
      while (!stopping && running < concurrency) {
        const claimed = await processOne();
        if (!claimed) break;
      }
    } catch (err) {
      logger.error('worker poll failed', { err });
    }
    if (!stopping) timers.push(setTimeout(pollLoop, pollMs));
  }

  async function eventLoop() {
    if (stopping) return;
    try {
      await events.dispatchPending();
    } catch (err) {
      logger.error('event dispatch failed', { err });
    }
    if (!stopping) timers.push(setTimeout(eventLoop, 2000));
  }

  async function scheduleLoop() {
    if (stopping) return;
    try {
      const r = await scheduler.tick();
      if (r.enqueued || r.expired || r.recovered) logger.info('scheduler tick', r);
    } catch (err) {
      logger.error('scheduler tick failed', { err });
    }
    if (!stopping) timers.push(setTimeout(scheduleLoop, scheduleMs));
  }

  // PaymentReconciliationJob: missed webhooks, refunds in flight, divergences.
  async function reconcileLoop() {
    if (stopping) return;
    try {
      const r = await platform.reconciliation.run();
      if (r.repaired || r.flagged || r.errors) logger.info('reconciliation run', r);
      // Signup fees paid from another account: keep trying to give them back.
      const back = await platform.payments.retryPayerReturns();
      if (back.returned) logger.info('payer mismatch returns', back);
    } catch (err) {
      logger.error('reconciliation failed', { code: err.code || err.name });
    }
    if (!stopping) timers.push(setTimeout(reconcileLoop, reconcileMs));
  }

  (async () => {
    await ensureAgents(prisma);
    await platform.commissions.ensureDefaults();
    logger.info('worker started', { demoMode: config.demoMode, intervalMinutes: config.search.intervalMinutes });
    scheduleLoop();
    pollLoop();
    eventLoop();
    reconcileLoop();
  })().catch((err) => logger.error('worker boot failed', { err }));

  return {
    async stop() {
      stopping = true;
      timers.forEach(clearTimeout);
      const deadline = Date.now() + 20_000;
      while (running > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    },
  };
}
