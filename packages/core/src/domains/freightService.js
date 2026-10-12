import { deepLinks, formatBRL } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { conflict, notFound } from '../errors.js';

/** FreightSource contract: find(request) → [{origin,destination,pickupDate,cargo,weightKg,price,isReturnLoad,carrierName}] */
export class DemoFreightSource {
  name = 'demo';
  async find(request) {
    const day = request.date ? new Date(request.date) : new Date(Date.now() + 86_400_000);
    const base = [
      { cargo: 'Bobinas de aço', weightKg: 24000, price: 3800, carrierName: 'Transportadora Rota Azul (DEMO)' },
      { cargo: 'Paletes de alimentos', weightKg: 12000, price: 2100, carrierName: 'Logística Horizonte Sul (DEMO)' },
    ];
    const out = base.map((b) => ({ ...b, origin: request.origin, destination: request.destination, pickupDate: day, isReturnLoad: false }));
    out.push({
      cargo: 'Carga de retorno — embalagens',
      weightKg: 8000,
      price: 1400,
      carrierName: 'Cargas Serra Clara (DEMO)',
      origin: request.destination,
      destination: request.origin,
      pickupDate: new Date(day.getTime() + 86_400_000),
      isReturnLoad: true,
    });
    return out;
  }
}

export class FreightService {
  constructor({ prisma = getPrisma(), config = getConfig(), events, sources } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.events = events;
    // Real freight marketplaces plug in here; demo source only in DEMO_MODE.
    this.sources = sources ?? (config.demoMode ? [new DemoFreightSource()] : []);
  }

  async createRequest({ company, user, origin, destination, date, cargo }) {
    const isDemo = this.config.demoMode;
    const request = await this.prisma.freightRequest.create({
      data: { companyId: company.id, origin, destination, date: date ? new Date(date) : null, cargo: cargo || null, isDemo },
    });
    await this.events.publish({
      type: 'FREIGHT_REQUEST_CREATED',
      companyId: company.id,
      userId: user.id,
      aggregateType: 'freightRequest',
      aggregateId: request.id,
      isDemo,
      payload: { origin, destination, date },
      activity: {
        type: 'SEARCH',
        title: `Busca de carga: ${origin} → ${destination}`,
        description: this.sources.length ? 'Procurando cargas compatíveis.' : 'Nenhuma fonte de cargas configurada ainda.',
        source: 'Freight',
      },
    });

    const matches = [];
    for (const source of this.sources) {
      for (const m of await source.find(request)) {
        const match = await this.prisma.freightMatch.create({
          data: { ...m, companyId: company.id, requestId: request.id, source: source.name, isDemo },
        });
        matches.push(match);
        await this.events.publish({
          type: match.isReturnLoad ? 'RETURN_LOAD_FOUND' : 'FREIGHT_MATCH_CREATED',
          companyId: company.id,
          aggregateType: 'freightMatch',
          aggregateId: match.id,
          isDemo,
          payload: { origin: match.origin, destination: match.destination, price: match.price, link: deepLinks.freightMatch(match.id) },
          activity: {
            type: 'OPPORTUNITY',
            title: match.isReturnLoad ? 'Carga de retorno encontrada' : 'Carga compatível encontrada',
            description: `${match.origin} → ${match.destination}${match.price ? ` · ${formatBRL(match.price)}` : ''}`,
            source: source.name === 'demo' ? 'Fonte DEMO' : source.name,
            severity: 'SUCCESS',
          },
        });
      }
    }
    return { request, matches };
  }

  async list(companyId) {
    const [requests, matches] = await Promise.all([
      this.prisma.freightRequest.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.freightMatch.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 60 }),
    ]);
    return { requests, matches };
  }

  async getMatch(companyId, id) {
    const m = await this.prisma.freightMatch.findFirst({ where: { id, companyId }, include: { request: true } });
    if (!m) throw notFound('Carga não encontrada.');
    return m;
  }

  async transition({ companyId, userId, id, to, from, eventType, title }) {
    const m = await this.getMatch(companyId, id);
    if (!from.includes(m.status)) {
      if (m.status === to) return m;
      throw conflict('Esta carga não está disponível para esta ação.');
    }
    const updated = await this.prisma.freightMatch.update({ where: { id }, data: { status: to } });
    await this.events.publish({
      type: eventType,
      companyId,
      userId,
      aggregateType: 'freightMatch',
      aggregateId: id,
      isDemo: m.isDemo,
      payload: { status: to, link: deepLinks.freightMatch(id) },
      activity: { type: 'OPPORTUNITY', title, description: `${m.origin} → ${m.destination}`, source: 'Freight' },
    });
    return updated;
  }
}
