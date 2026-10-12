import { getPrisma } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';

export const ARRIVAL_RADIUS_M = 300;
export const NEAR_RADIUS_M = 5_000;
const MAX_ACCURACY_M = 2_000;

/** Small offline gazetteer (city centroids) used to set geofences. */
const CITIES = {
  santos: [-23.9608, -46.3336],
  campinas: [-22.9056, -47.0608],
  'sao paulo': [-23.5505, -46.6333],
  guarulhos: [-23.4538, -46.5333],
  cubatao: [-23.8911, -46.4247],
  jundiai: [-23.1857, -46.8978],
  sorocaba: [-23.5015, -47.4526],
  'sao jose dos campos': [-23.1896, -45.8841],
  'ribeirao preto': [-21.1775, -47.8103],
  'rio de janeiro': [-22.9068, -43.1729],
  'belo horizonte': [-19.9167, -43.9345],
  curitiba: [-25.4284, -49.2733],
  paranagua: [-25.5163, -48.5225],
  joinville: [-26.3045, -48.8487],
  itajai: [-26.9078, -48.6619],
  florianopolis: [-27.5954, -48.548],
  'porto alegre': [-30.0346, -51.2177],
  goiania: [-16.6869, -49.2648],
  brasilia: [-15.7939, -47.8828],
  salvador: [-12.9777, -38.5016],
  recife: [-8.0476, -34.877],
};

export function normalizeCity(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s*[-/,]\s*[a-z]{2}\s*$/, '')
    .trim();
}

export function geocodeCity(name) {
  const c = CITIES[normalizeCity(name)];
  return c ? { lat: c[0], lng: c[1] } : null;
}

export function haversineM(a, b) {
  const R = 6_371_000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * TripService — freight operational tracking with explicit consent.
 * GPS is OPERATIONAL EVIDENCE only: arriving at the destination notifies the
 * buyer, it NEVER confirms delivery or releases money. Coordinates are visible
 * only to the carrier company; the buyer sees milestones.
 */
export class TripService {
  constructor({ prisma = getPrisma(), events, audit, transactions, protectedPayments } = {}) {
    this.prisma = prisma;
    this.events = events;
    this.audit = audit;
    this.transactions = transactions;
    this.protectedPayments = protectedPayments;
  }

  async #match(companyId, matchId) {
    const m = await this.prisma.freightMatch.findFirst({ where: { id: matchId, companyId } });
    if (!m) throw notFound('Carga não encontrada.');
    if (!['ACCEPTED', 'DRIVER_ARRIVED', 'COMPLETED'].includes(m.status)) throw conflict('Aceite a carga antes de iniciar o transporte.');
    return m;
  }

  async #activeTransaction(matchId, tx = this.prisma) {
    return tx.marketplaceTransaction.findFirst({ where: { referenceType: 'freightMatch', referenceId: matchId, status: { notIn: ['CANCELLED', 'DRAFT'] } }, orderBy: { createdAt: 'desc' } });
  }

  async #milestone(m, type, { tripStatus, userId, source, title, notifyBuyer = false, lat = null, lng = null }, tx) {
    await tx.tripEvent.create({ data: { freightMatchId: m.id, companyId: m.companyId, type, source, recordedByUserId: userId ?? null, latitude: lat, longitude: lng } });
    if (tripStatus) await tx.freightMatch.update({ where: { id: m.id }, data: { tripStatus } });
    const t = await this.#activeTransaction(m.id, tx);
    if (t) {
      await this.transactions.timeline(t.id, { type: 'TRIP', title, metadata: { tripEvent: type } }, tx);
      await this.transactions.publishBoth(t, { type, userId, payload: { matchId: m.id, link: `/app/pay/transactions/${t.id}` } }, tx, {
        sellerActivity: { type: 'SYSTEM', title, description: `${m.origin} → ${m.destination}`, source: 'Transporte' },
        buyerActivity: notifyBuyer ? { type: 'SYSTEM', title, description: `${m.origin} → ${m.destination}`, source: 'Transporte' } : null,
      });
    } else {
      await this.events.publish({ type, companyId: m.companyId, userId, aggregateType: 'freightMatch', aggregateId: m.id, payload: { link: `/app/freight` }, activity: { type: 'SYSTEM', title, description: `${m.origin} → ${m.destination}`, source: 'Transporte' } }, tx);
    }
  }

  /** Driver/carrier consents to location sharing for THIS trip only. */
  async consent({ user, company, matchId }) {
    const m = await this.#match(company.id, matchId);
    const pickup = m.pickupLat != null ? null : geocodeCity(m.origin);
    const dest = m.destLat != null ? null : geocodeCity(m.destination);
    return this.prisma.freightMatch.update({
      where: { id: m.id },
      data: {
        trackingConsentAt: m.trackingConsentAt || new Date(),
        trackingConsentUserId: m.trackingConsentUserId || user.id,
        ...(pickup ? { pickupLat: pickup.lat, pickupLng: pickup.lng } : {}),
        ...(dest ? { destLat: dest.lat, destLng: dest.lng } : {}),
      },
    });
  }

  async revokeConsent({ company, matchId }) {
    const m = await this.#match(company.id, matchId);
    return this.prisma.freightMatch.update({ where: { id: m.id }, data: { trackingConsentAt: null } });
  }

  async start({ user, company, matchId, source = 'WEB' }) {
    const m = await this.#match(company.id, matchId);
    if (m.tripStatus !== 'NOT_STARTED') return m;
    await this.prisma.$transaction((tx) => this.#milestone(m, 'DRIVER_EN_ROUTE_PICKUP', { tripStatus: 'EN_ROUTE_PICKUP', userId: user.id, source, title: 'Motorista a caminho da coleta', notifyBuyer: true }, tx));
    return this.prisma.freightMatch.findUnique({ where: { id: m.id } });
  }

  async markLoaded({ user, company, matchId, source = 'WEB' }) {
    const m = await this.#match(company.id, matchId);
    if (!['NOT_STARTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP'].includes(m.tripStatus)) throw conflict('A carga já foi carregada.');
    await this.prisma.$transaction(async (tx) => {
      await this.#milestone(m, 'CARGO_LOADED', { tripStatus: 'LOADED', userId: user.id, source, title: 'Carga carregada', notifyBuyer: true }, tx);
      await this.#milestone(m, 'TRIP_STARTED', { tripStatus: 'IN_TRANSIT', userId: user.id, source, title: 'Viagem iniciada' }, tx);
    });
    return this.prisma.freightMatch.findUnique({ where: { id: m.id } });
  }

  /**
   * Record a location sample (requires consent). Geofences produce
   * milestones; nothing here touches payment state.
   */
  async recordLocation({ user, company, matchId, latitude, longitude, accuracyM = null, source = 'PWA' }) {
    if (![latitude, longitude].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw badRequest('Coordenadas inválidas.');
    const m = await this.#match(company.id, matchId);
    if (!m.trackingConsentAt) throw forbidden('Autorize o compartilhamento de localização para esta viagem.');
    if (m.tripStatus === 'DELIVERED') return { ignored: 'delivered', tripStatus: m.tripStatus };
    if (accuracyM != null && accuracyM > MAX_ACCURACY_M) return { ignored: 'low_accuracy', tripStatus: m.tripStatus };
    const here = { lat: latitude, lng: longitude };
    const milestones = [];

    await this.prisma.$transaction(async (tx) => {
      await tx.tripEvent.create({ data: { freightMatchId: m.id, companyId: m.companyId, type: 'LOCATION_UPDATE', latitude, longitude, accuracyM, source, recordedByUserId: user.id } });
      if (['NOT_STARTED', 'EN_ROUTE_PICKUP'].includes(m.tripStatus) && m.pickupLat != null && haversineM(here, { lat: m.pickupLat, lng: m.pickupLng }) <= ARRIVAL_RADIUS_M) {
        await this.#milestone(m, 'DRIVER_ARRIVED_PICKUP', { tripStatus: 'AT_PICKUP', userId: user.id, source: 'GEOFENCE', title: 'Motorista chegou à coleta', notifyBuyer: true, lat: latitude, lng: longitude }, tx);
        milestones.push('DRIVER_ARRIVED_PICKUP');
      }
      if (['LOADED', 'IN_TRANSIT'].includes(m.tripStatus) && m.destLat != null) {
        const dist = haversineM(here, { lat: m.destLat, lng: m.destLng });
        if (dist <= NEAR_RADIUS_M) {
          const near = await tx.tripEvent.count({ where: { freightMatchId: m.id, type: 'NEAR_DESTINATION' } });
          if (!near) {
            await this.#milestone(m, 'NEAR_DESTINATION', { userId: user.id, source: 'GEOFENCE', title: 'Transporte próximo ao destino', notifyBuyer: true, lat: latitude, lng: longitude }, tx);
            milestones.push('NEAR_DESTINATION');
          }
        }
        if (dist <= ARRIVAL_RADIUS_M) {
          // Arrival = evidence + buyer notification. NOT delivery, NOT release.
          await this.#milestone(m, 'DRIVER_ARRIVED_DESTINATION', { tripStatus: 'AT_DESTINATION', userId: user.id, source: 'GEOFENCE', title: '🚛 O transporte chegou ao destino.', notifyBuyer: true, lat: latitude, lng: longitude }, tx);
          milestones.push('DRIVER_ARRIVED_DESTINATION');
        }
      }
    });
    const fresh = await this.prisma.freightMatch.findUnique({ where: { id: m.id }, select: { tripStatus: true } });
    return { recorded: true, tripStatus: fresh.tripStatus, milestones };
  }

  /**
   * Buyer confirms delivery. This records the human confirmation and moves
   * the transaction to the release path — the release itself is a separate,
   * step-up-confirmed action.
   */
  async confirmDelivery({ user, company, transactionId, source = 'WEB', ip }) {
    const t = await this.transactions.load(transactionId, company.id);
    if (this.transactions.roleOf(t, company.id) !== 'BUYER') throw forbidden('Apenas o cliente confirma a entrega.');
    if (t.referenceType !== 'freightMatch') throw badRequest('Esta transação não é um frete.');
    const m = await this.prisma.freightMatch.findUnique({ where: { id: t.referenceId } });
    if (!m) throw notFound('Carga não encontrada.');
    if (!['AT_DESTINATION', 'IN_TRANSIT', 'LOADED'].includes(m.tripStatus)) throw conflict('O transporte ainda não chegou ao destino.');
    await this.prisma.$transaction(async (tx) => {
      await this.#milestone(m, 'DELIVERY_CONFIRMED', { tripStatus: 'DELIVERED', userId: user.id, source, title: 'Entrega confirmada pelo cliente' }, tx);
      // The carrier's arrival/milestones count as the seller's completion report.
      if (!t.sellerCompletedAt) await tx.marketplaceTransaction.update({ where: { id: t.id }, data: { sellerCompletedAt: new Date(), serviceStartedAt: t.serviceStartedAt || new Date() } });
    });
    return this.protectedPayments.confirmCompletion({ user, company, id: t.id, source, ip });
  }

  async get({ company, matchId }) {
    const m = await this.prisma.freightMatch.findFirst({
      where: { id: matchId, companyId: company.id },
      include: { tripEvents: { orderBy: { createdAt: 'desc' }, take: 50 } },
    });
    if (!m) throw notFound('Carga não encontrada.');
    return m;
  }
}
