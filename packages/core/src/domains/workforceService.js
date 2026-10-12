import { deepLinks } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { conflict, notFound } from '../errors.js';

/** WorkforceSource contract: find(demand) → [{professionalName, role, city, experienceYears, rating}] */
export class DemoWorkforceSource {
  name = 'demo';
  async find(demand) {
    const names = ['Profissional Alfa (DEMO)', 'Profissional Beta (DEMO)', 'Profissional Gama (DEMO)', 'Profissional Delta (DEMO)'];
    return names.slice(0, Math.min(names.length, demand.quantity + 1)).map((n, i) => ({
      professionalName: n,
      role: demand.role,
      city: demand.location || null,
      experienceYears: 3 + i * 2,
      rating: Number((4.9 - i * 0.2).toFixed(1)),
    }));
  }
}

export class WorkforceService {
  constructor({ prisma = getPrisma(), config = getConfig(), events, sources } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.events = events;
    this.sources = sources ?? (config.demoMode ? [new DemoWorkforceSource()] : []);
  }

  async createDemand({ company, user, role, quantity, startDate, location, notes }) {
    const isDemo = this.config.demoMode;
    const demand = await this.prisma.workforceDemand.create({
      data: {
        companyId: company.id,
        role,
        quantity,
        startDate: startDate ? new Date(startDate) : null,
        location: location || [company.city, company.state].filter(Boolean).join(' - ') || null,
        notes: notes || null,
        isDemo,
      },
    });
    await this.events.publish({
      type: 'WORKFORCE_DEMAND_CREATED',
      companyId: company.id,
      userId: user.id,
      aggregateType: 'workforceDemand',
      aggregateId: demand.id,
      isDemo,
      payload: { role, quantity },
      activity: {
        type: 'SEARCH',
        title: `Demanda: ${quantity} × ${role}`,
        description: this.sources.length ? 'Procurando profissionais compatíveis.' : 'Nenhuma fonte de profissionais configurada ainda.',
        source: 'Workforce',
      },
    });
    const matches = [];
    for (const source of this.sources) {
      for (const p of await source.find(demand)) {
        const match = await this.prisma.workforceMatch.create({
          data: { ...p, companyId: company.id, demandId: demand.id, source: source.name, isDemo },
        });
        matches.push(match);
        await this.events.publish({
          type: 'WORKFORCE_MATCH_CREATED',
          companyId: company.id,
          aggregateType: 'workforceMatch',
          aggregateId: match.id,
          isDemo,
          payload: { role: match.role, link: deepLinks.workforceMatch(match.id) },
          activity: {
            type: 'OPPORTUNITY',
            title: 'Profissional compatível',
            description: `${match.professionalName} · ${match.role}`,
            source: source.name === 'demo' ? 'Fonte DEMO' : source.name,
          },
        });
      }
    }
    return { demand, matches };
  }

  async list(companyId) {
    return this.prisma.workforceDemand.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { matches: { orderBy: { rating: 'desc' } } },
    });
  }

  async getMatch(companyId, id) {
    const m = await this.prisma.workforceMatch.findFirst({ where: { id, companyId }, include: { demand: true } });
    if (!m) throw notFound('Profissional não encontrado.');
    return m;
  }

  async transition({ companyId, userId, id, to, from, title }) {
    const m = await this.getMatch(companyId, id);
    if (!from.includes(m.status)) {
      if (m.status === to) return m;
      throw conflict('Este profissional não está disponível para esta ação.');
    }
    const updated = await this.prisma.workforceMatch.update({ where: { id }, data: { status: to } });
    await this.events.publish({
      type: to === 'COMPLETED' ? 'SERVICE_COMPLETED' : 'WORKFORCE_MATCH_UPDATED',
      companyId,
      userId,
      aggregateType: 'workforceMatch',
      aggregateId: id,
      isDemo: m.isDemo,
      payload: { status: to, link: deepLinks.workforceMatch(id) },
      activity: { type: 'OPPORTUNITY', title, description: `${m.professionalName} · ${m.role}`, source: 'Workforce' },
    });
    return updated;
  }
}
