import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { accountTypeForHost } from '../security/area.js';

const DAY = 86_400_000;

export class DashboardService {
  constructor({ prisma = getPrisma(), config = getConfig() } = {}) {
    this.prisma = prisma;
    this.config = config;
  }

  /**
   * Every metric is computed from stored data — nothing is hardcoded.
   *
   * Area mode (ARQUITETURA 6.6): the KPIs are the company's (opportunities, search jobs, signals) and
   * belong to the CNPJ area; the CPF gets an empty overview and no company table is read. `area` comes
   * from the caller; missing or unknown is an error. Legacy mode: the same overview as always.
   */
  async overview(companyId, { area } = {}) {
    if (this.config?.areas?.enabled) {
      const accountType = accountTypeForHost(area);
      if (!accountType) throw new TypeError(`DashboardService: área inválida: ${String(area)}`);
      if (accountType === 'PERSON') return { metrics: {}, pipeline: {}, flow: {}, latestJob: null };
    }
    const openStatuses = ['NEW', 'RESEARCHING', 'CONTACTED', 'INTERESTED', 'PROPOSAL'];
    const since24h = new Date(Date.now() - DAY);
    const [total, high, potential, analyzed, won, last24h, byStatus, recentJobs, latestJob, signals24h] = await Promise.all([
      this.prisma.opportunity.count({ where: { companyId, status: { not: 'ARCHIVED' } } }),
      this.prisma.opportunity.count({ where: { companyId, priority: 'HIGH', status: { in: openStatuses } } }),
      this.prisma.opportunity.aggregate({
        where: { companyId, status: { in: openStatuses } },
        _sum: { estimatedMaxValue: true, estimatedMinValue: true },
      }),
      this.prisma.searchJob.aggregate({ where: { companyId }, _sum: { companiesAnalyzed: true } }),
      this.prisma.opportunity.aggregate({ where: { companyId, status: 'WON' }, _sum: { estimatedMinValue: true }, _count: true }),
      this.prisma.opportunity.count({ where: { companyId, createdAt: { gte: since24h } } }),
      this.prisma.opportunity.groupBy({ by: ['status'], where: { companyId }, _count: true }),
      this.prisma.searchJob.findMany({
        where: { companyId, status: 'COMPLETED', finishedAt: { gte: since24h } },
        select: { companiesAnalyzed: true, signalsDetected: true, opportunitiesCreated: true },
      }),
      this.prisma.searchJob.findFirst({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, runAt: true, startedAt: true, finishedAt: true, trigger: true },
      }),
      this.prisma.companySignal.count({ where: { companyId, detectedAt: { gte: since24h } } }),
    ]);

    const flow24h = recentJobs.reduce(
      (acc, j) => ({
        analyzed: acc.analyzed + j.companiesAnalyzed,
        signals: acc.signals + j.signalsDetected,
        opportunities: acc.opportunities + j.opportunitiesCreated,
      }),
      { analyzed: 0, signals: 0, opportunities: 0 },
    );

    return {
      metrics: {
        opportunities: total,
        highPriority: high,
        potentialValue: potential._sum.estimatedMaxValue ?? 0,
        potentialMinValue: potential._sum.estimatedMinValue ?? 0,
        companiesAnalyzed: analyzed._sum.companiesAnalyzed ?? 0,
        won: won._count,
        wonValue: won._sum.estimatedMinValue ?? 0,
        newLast24h: last24h,
      },
      pipeline: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      flow: {
        market: flow24h.analyzed,
        search: recentJobs.length,
        signals: signals24h,
        opportunities: flow24h.opportunities,
        sales: (byStatus.find((s) => s.status === 'WON')?._count ?? 0) + (byStatus.find((s) => s.status === 'PROPOSAL')?._count ?? 0),
      },
      latestJob,
    };
  }
}
