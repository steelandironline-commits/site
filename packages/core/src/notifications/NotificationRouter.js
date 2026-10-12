import { DOMAIN_EVENTS, deepLinks, formatCents } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';
import { PreferenceService } from './PreferenceService.js';

/** TemPix Pay copy (section 17). Deep links only — never an action button for money. */
const PAY_COPY = {
  PAYMENT_CREATED: (p) => ({ title: '💳 Cobrança TemPix criada', body: p.amountCents ? formatCents(p.amountCents) : '', cta: 'ABRIR COBRANÇA' }),
  PAYMENT_RECEIVED: (p) => ({ title: '✅ Pix recebido', body: p.amountCents ? formatCents(p.amountCents) : '' }),
  PAYMENT_EXPIRED: () => ({ title: '⌛ Pix expirado', body: 'Gere uma nova cobrança no TemPix.' }),
  PAYMENT_CANCELLED: () => ({ title: 'Cobrança cancelada', body: '' }),
  PROTECTED_PAYMENT_CREATED: () => ({ title: '🛡️ Pagamento recebido e aguardando conclusão.', body: 'Pagamento protegido · processado pelo parceiro financeiro.' }),
  SERVICE_COMPLETED: (p) => (p.audience === 'BUYER' ? { title: 'O prestador informou a conclusão.', body: 'Confirme no TemPix.' } : { title: 'Conclusão informada', body: '' }),
  PROTECTED_PAYMENT_RELEASE_REQUESTED: (p) =>
    p.audience === 'BUYER' ? { title: 'Pagamento pronto para liberação. Confirme no TemPix.', body: '' } : { title: 'Liberação aguardando o cliente', body: '' },
  PROTECTED_PAYMENT_RELEASED: (p) => ({ title: '✅ Pagamento liberado', body: p.amountCents ? `${formatCents(p.amountCents)} · processado pelo parceiro financeiro` : '' }),
  PAYMENT_REFUNDED: (p) => ({ title: '↩️ Reembolso concluído', body: p.amountCents ? formatCents(p.amountCents) : '' }),
  PAYOUT_CONFIRMED: (p) => ({ title: '✅ Repasse confirmado', body: p.amountCents ? formatCents(p.amountCents) : '' }),
  DISPUTE_OPENED: () => ({ title: '⚠️ Disputa aberta', body: 'A liberação está congelada até a análise.' }),
  DISPUTE_RESOLVED: () => ({ title: 'Disputa resolvida', body: 'Veja a decisão no TemPix.' }),
  DRIVER_ARRIVED_DESTINATION: () => ({ title: '🚛 O transporte chegou ao destino.', body: 'Confira a carga e confirme a entrega no TemPix.' }),
  NEAR_DESTINATION: () => ({ title: '🚚 Transporte próximo ao destino', body: '' }),
  DRIVER_ARRIVED_PICKUP: () => ({ title: '📍 Motorista chegou à coleta', body: '' }),
  CARGO_LOADED: () => ({ title: '📦 Carga carregada', body: '' }),
  DRIVER_EN_ROUTE_PICKUP: () => ({ title: '🚚 Motorista a caminho da coleta', body: '' }),
};

/** Event → human message + deep link (no secrets, no permanent tokens). */
export function composeNotification(event, entity) {
  const meta = DOMAIN_EVENTS[event.type] || {};
  const p = event.payload || {};
  if (PAY_COPY[event.type] && (event.aggregateType === 'transaction' || p.link)) {
    const c = PAY_COPY[event.type](p);
    const sandbox = entity?.isSandbox ? ' [SANDBOX]' : '';
    return { title: `${c.title}${sandbox}`, body: c.body, url: p.link || '/app/pay', cta: c.cta || 'ABRIR NO TEMPIX' };
  }
  switch (event.type) {
    case 'OPPORTUNITY_CREATED':
    case 'OPPORTUNITY_HIGH_PRIORITY':
      return {
        title: meta.title,
        body: entity ? `${entity.targetCompanyName} · match ${entity.score}%` : 'Nova oportunidade no painel.',
        url: deepLinks.opportunity(event.aggregateId),
      };
    case 'FREIGHT_MATCH_CREATED':
    case 'RETURN_LOAD_FOUND':
    case 'DRIVER_ARRIVED':
      return { title: meta.title, body: entity ? `${entity.origin} → ${entity.destination}` : '', url: deepLinks.freightMatch(event.aggregateId) };
    case 'WORKFORCE_MATCH_CREATED':
      return { title: meta.title, body: entity ? `${entity.professionalName} · ${entity.role}` : '', url: deepLinks.workforceMatch(event.aggregateId) };
    case 'SENSITIVE_ACTION_REQUESTED':
      return { title: meta.title, body: p.summary || 'Confirme a ação no app.', url: deepLinks.challenge(event.aggregateId) };
    default:
      if (event.aggregateType === 'payment') {
        return {
          title: meta.title,
          body: [p.amountCents ? formatCents(p.amountCents) : null, p.reference].filter(Boolean).join(' · '),
          url: deepLinks.payment(event.aggregateId),
        };
      }
      return { title: meta.title || event.type, body: '', url: '/app/activity' };
  }
}

/**
 * NotificationRouter — EventEngine handler. For every non-silent event it
 * fans out to the company's users on each channel they enabled. Deliveries
 * are unique per (event, user, channel), so retries never double-send.
 * IN_APP is the activity feed itself (written when the event is published).
 */
export class NotificationRouter {
  constructor({ prisma = getPrisma(), config = getConfig(), preferences, whatsapp, email, push } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.preferences = preferences ?? new PreferenceService({ prisma });
    this.whatsapp = whatsapp; // WhatsAppNotifier
    this.email = email; // EmailService
    this.push = push; // PushService
  }

  async #entity(event) {
    const id = event.aggregateId;
    if (!id) return null;
    switch (event.aggregateType) {
      case 'opportunity':
        return this.prisma.opportunity.findUnique({ where: { id } });
      case 'freightMatch':
        return this.prisma.freightMatch.findUnique({ where: { id } });
      case 'workforceMatch':
        return this.prisma.workforceMatch.findUnique({ where: { id } });
      case 'payment':
        return this.prisma.payment.findUnique({ where: { id } });
      case 'transaction':
        return this.prisma.marketplaceTransaction.findUnique({ where: { id }, select: { id: true, isSandbox: true, isDemo: true } });
      default:
        return null;
    }
  }

  async handle(event) {
    const meta = DOMAIN_EVENTS[event.type];
    if (!meta || meta.silent || !event.companyId) return;
    // A subscription's own payment events concern the account, not a customer charge.
    if (event.type === 'PAYMENT_CREATED' && ['SUBSCRIPTION', 'SIGNUP_FEE'].includes(event.payload?.kind)) return;
    // High-priority supersedes the generic "created" notification on push/WhatsApp.
    const supersededByHighPriority = event.type === 'OPPORTUNITY_CREATED' && event.payload?.priority === 'HIGH';

    const users = await this.prisma.user.findMany({
      where: { companyId: event.companyId, status: 'ACTIVE', ...(event.type === 'SENSITIVE_ACTION_REQUESTED' ? { id: event.userId } : {}) },
      include: { whatsappConnection: true },
    });
    const entity = await this.#entity(event);
    const message = composeNotification(event, entity);

    for (const user of users) {
      for (const channel of ['WHATSAPP', 'PUSH', 'EMAIL']) {
        if (supersededByHighPriority && channel !== 'EMAIL') continue;
        if (!(await this.preferences.isEnabled(user.id, channel, meta.category))) continue;
        const created = await this.prisma.notificationDelivery.createMany({
          data: [{ domainEventId: event.id, userId: user.id, channel, status: 'QUEUED' }],
          skipDuplicates: true,
        });
        if (!created.count) continue; // already delivered/attempted
        let status = 'SKIPPED';
        let error = null;
        try {
          if (channel === 'WHATSAPP') status = await this.#whatsapp(user, event, entity, message);
          if (channel === 'PUSH') status = this.push ? await this.push.sendToUser(user.id, { ...message, tag: event.type }) : 'SKIPPED';
          if (channel === 'EMAIL') status = await this.#email(user, message);
        } catch (err) {
          status = 'FAILED';
          error = String(err.message || err).slice(0, 500);
          logger.warn('notification delivery failed', { channel, eventId: event.id, err });
        }
        await this.prisma.notificationDelivery.update({
          where: { domainEventId_userId_channel: { domainEventId: event.id, userId: user.id, channel } },
          data: { status, error },
        });
      }
    }
  }

  async #whatsapp(user, event, entity, message) {
    const conn = user.whatsappConnection;
    if (!this.whatsapp || !conn || conn.status !== 'VERIFIED') return 'SKIPPED';
    return this.whatsapp.notify(conn, event, entity, message);
  }

  async #email(user, message) {
    if (!this.email || this.config.email.provider !== 'resend') return 'SKIPPED';
    const ok = await this.email.send({
      to: user.email,
      subject: `TemPix — ${message.title}`,
      text: `${message.title}\n${message.body}\n\n${this.config.appUrl}${message.url}`,
    });
    return ok ? 'SENT' : 'FAILED';
  }
}
