import { AGENTS } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { getAgentMap } from './agentRegistry.js';

const DAY = 86_400_000;

export class AgentService {
  constructor({ prisma = getPrisma(), config = getConfig() } = {}) {
    this.prisma = prisma;
    this.config = config;
  }

  /** Per-company agent status derived from AgentRun history. */
  async list(companyId) {
    const agents = await getAgentMap(this.prisma);
    const since = new Date(Date.now() - DAY);
    const sub = await this.prisma.subscription.findUnique({ where: { companyId }, select: { status: true } });
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { agentsPaused: true } });
    const active = sub?.status === 'ACTIVE' && !company?.agentsPaused;

    const result = [];
    for (const def of AGENTS) {
      const agent = agents[def.key];
      const [lastRun, runsToday, errorsToday, avg, events] = await Promise.all([
        this.prisma.agentRun.findFirst({ where: { agentId: agent.id, companyId }, orderBy: { startedAt: 'desc' } }),
        this.prisma.agentRun.count({ where: { agentId: agent.id, companyId, startedAt: { gte: since } } }),
        this.prisma.agentRun.count({ where: { agentId: agent.id, companyId, status: 'FAILED', startedAt: { gte: since } } }),
        this.prisma.agentRun.aggregate({
          where: { agentId: agent.id, companyId, status: 'SUCCEEDED' },
          _avg: { durationMs: true },
        }),
        this.prisma.activityEvent.count({ where: { agentId: agent.id, companyId, createdAt: { gte: since } } }),
      ]);

      let status = 'IDLE';
      if (!agent.enabled || !active) status = 'PAUSED';
      else if (lastRun?.status === 'RUNNING') status = 'RUNNING';
      else if (lastRun?.status === 'FAILED') status = 'ERROR';
      else if (lastRun && Date.now() - lastRun.startedAt.getTime() < this.config.search.intervalMinutes * 60_000 * 1.5) {
        status = 'ACTIVE';
      }

      result.push({
        key: def.key,
        name: def.name,
        title: def.title,
        description: def.description,
        status,
        lastRunAt: lastRun?.startedAt ?? null,
        lastRunStatus: lastRun?.status ?? null,
        lastError: lastRun?.status === 'FAILED' ? lastRun.error : null,
        jobsToday: runsToday,
        errorsToday,
        eventsToday: events,
        avgDurationMs: avg._avg.durationMs ? Math.round(avg._avg.durationMs) : null,
      });
    }
    return result;
  }

  async runs(companyId, { limit = 50, agent } = {}) {
    const where = { companyId };
    if (agent) {
      const agents = await getAgentMap(this.prisma);
      if (agents[agent]) where.agentId = agents[agent].id;
    }
    return this.prisma.agentRun.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        durationMs: true,
        error: true,
        metrics: true,
        jobId: true,
        agent: { select: { key: true, name: true } },
      },
    });
  }
}
