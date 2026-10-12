import { getPrisma } from '../db.js';
import { notFound } from '../errors.js';
import { ActivityService } from './activityService.js';
import { SalesIntelligenceService } from '../engine/SalesIntelligenceService.js';
import { OPPORTUNITY_STATUS_LABELS } from '@autopix/shared';

const LIST_SELECT = {
  id: true,
  targetCompanyName: true,
  targetWebsite: true,
  industry: true,
  city: true,
  state: true,
  score: true,
  confidence: true,
  priority: true,
  signal: true,
  signalType: true,
  estimatedMinValue: true,
  estimatedMaxValue: true,
  matchingServices: true,
  status: true,
  isDemo: true,
  createdAt: true,
  updatedAt: true,
  sources: { select: { type: true, title: true }, take: 1, orderBy: { retrievedAt: 'asc' } },
};

export class OpportunityService {
  constructor({ prisma = getPrisma() } = {}) {
    this.prisma = prisma;
    this.activity = new ActivityService({ prisma });
    this.sales = new SalesIntelligenceService();
  }

  async list(companyId, { status, priority, q, sort = 'recent', page = 1, pageSize = 24 } = {}) {
    const where = { companyId };
    if (status) where.status = status;
    else where.status = { not: 'ARCHIVED' };
    if (priority) where.priority = priority;
    if (q) {
      where.OR = [
        { targetCompanyName: { contains: q, mode: 'insensitive' } },
        { industry: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        { signal: { contains: q, mode: 'insensitive' } },
      ];
    }
    const orderBy =
      sort === 'score'
        ? [{ score: 'desc' }, { createdAt: 'desc' }]
        : sort === 'value'
          ? [{ estimatedMaxValue: { sort: 'desc', nulls: 'last' } }, { score: 'desc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }];
    const [items, total] = await Promise.all([
      this.prisma.opportunity.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, select: LIST_SELECT }),
      this.prisma.opportunity.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(companyId, id) {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id, companyId },
      include: {
        sources: { orderBy: { retrievedAt: 'asc' } },
        contacts: { orderBy: { createdAt: 'asc' } },
        signals: { orderBy: { detectedAt: 'asc' } },
        activityEvents: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, type: true, title: true, description: true, severity: true, source: true, createdAt: true, isDemo: true },
        },
      },
    });
    if (!opportunity) throw notFound('Oportunidade não encontrada.');
    return opportunity;
  }

  async update(companyId, id, { status, notes, generateApproach }, { userId } = {}) {
    const current = await this.prisma.opportunity.findFirst({ where: { id, companyId } });
    if (!current) throw notFound('Oportunidade não encontrada.');
    const data = {};
    if (status && status !== current.status) data.status = status;
    if (notes !== undefined && notes !== current.notes) data.notes = notes;
    if (generateApproach) {
      const company = await this.prisma.company.findUnique({ where: { id: companyId } });
      data.suggestedApproach = this.sales.buildApproach({
        profile: company,
        candidate: {
          name: current.targetCompanyName,
          industry: current.industry,
          city: current.city,
        },
        signal: { type: current.signalType, title: current.signal },
        matchingServices: current.matchingServices,
        estimate: { min: current.estimatedMinValue, max: current.estimatedMaxValue },
        variant: Date.now(),
      });
    }
    if (!Object.keys(data).length) return this.get(companyId, id);

    await this.prisma.opportunity.update({ where: { id }, data });
    if (data.status) {
      await this.activity.record({
        companyId,
        userId,
        opportunityId: id,
        type: 'OPPORTUNITY',
        title: `Status alterado para ${OPPORTUNITY_STATUS_LABELS[data.status]}`,
        description: current.targetCompanyName,
        source: 'user',
        severity: data.status === 'WON' ? 'SUCCESS' : 'INFO',
        isDemo: current.isDemo,
        metadata: { from: current.status, to: data.status },
      });
    }
    if (data.suggestedApproach) {
      await this.activity.record({
        companyId,
        userId,
        agentKey: 'SALES',
        opportunityId: id,
        type: 'OPPORTUNITY',
        title: 'Abordagem comercial sugerida',
        description: current.targetCompanyName,
        source: 'Sales Intelligence',
        isDemo: current.isDemo,
      });
    }
    if (data.notes !== undefined && !data.status && !data.suggestedApproach) {
      await this.activity.record({
        companyId,
        userId,
        opportunityId: id,
        type: 'OPPORTUNITY',
        title: 'Nota atualizada',
        description: current.targetCompanyName,
        source: 'user',
        isDemo: current.isDemo,
      });
    }
    return this.get(companyId, id);
  }
}
