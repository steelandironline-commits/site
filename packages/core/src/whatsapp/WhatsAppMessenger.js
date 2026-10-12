import { getPrisma } from '../db.js';
import { logger } from '../logger.js';

/**
 * Sends through the configured WhatsAppProvider and records every outbound
 * message (QUEUED → SENT | FAILED | SKIPPED) in WhatsAppMessage.
 */
export class WhatsAppMessenger {
  constructor({ prisma = getPrisma(), provider }) {
    this.prisma = prisma;
    this.provider = provider;
  }

  /** method: provider method name; args: its arguments after `to`. */
  async send(connection, method, args = [], { domainEventId = null, to } = {}) {
    const phone = to || connection?.providerContactId || connection?.phoneNumber;
    const record = await this.prisma.whatsAppMessage.create({
      data: {
        connectionId: connection?.id ?? null,
        direction: 'OUTBOUND',
        phoneNumber: phone,
        kind: method,
        status: 'QUEUED',
        domainEventId,
      },
    });
    if (!this.provider.enabled) {
      await this.prisma.whatsAppMessage.update({ where: { id: record.id }, data: { status: 'SKIPPED', error: 'provider disabled' } });
      return { status: 'SKIPPED', id: record.id };
    }
    try {
      const { messageId } = await this.provider[method](phone, ...args);
      await this.prisma.whatsAppMessage.update({ where: { id: record.id }, data: { status: 'SENT', providerMessageId: messageId } });
      return { status: 'SENT', id: record.id, messageId };
    } catch (err) {
      logger.warn('whatsapp send failed', { method, err });
      await this.prisma.whatsAppMessage.update({
        where: { id: record.id },
        data: { status: err.skipped ? 'SKIPPED' : 'FAILED', error: String(err.message).slice(0, 500) },
      });
      return { status: err.skipped ? 'SKIPPED' : 'FAILED', id: record.id };
    }
  }

  reply(connection, text, opts) {
    return this.send(connection, 'sendText', [text], opts);
  }
}

/** NotificationRouter channel adapter for WhatsApp. */
export class WhatsAppNotifier {
  constructor({ messenger }) {
    this.messenger = messenger;
  }

  async notify(connection, event, entity, message) {
    const opts = { domainEventId: event.id };
    let out;
    switch (event.type) {
      case 'OPPORTUNITY_CREATED':
      case 'OPPORTUNITY_HIGH_PRIORITY':
        if (!entity) return 'SKIPPED';
        out = await this.messenger.send(connection, 'sendOpportunityNotification', [{ opportunity: entity, link: message.url }], opts);
        break;
      case 'FREIGHT_MATCH_CREATED':
      case 'RETURN_LOAD_FOUND':
        if (!entity) return 'SKIPPED';
        out = await this.messenger.send(connection, 'sendFreightMatchNotification', [{ match: entity, link: message.url }], opts);
        break;
      case 'WORKFORCE_MATCH_CREATED':
        if (!entity) return 'SKIPPED';
        out = await this.messenger.send(connection, 'sendWorkforceMatchNotification', [{ match: entity, link: message.url }], opts);
        break;
      default:
        if (event.aggregateType === 'transaction' || event.aggregateType === 'freightMatch') {
          // Financial/trip updates: text + deep link only. Release is never a WhatsApp button.
          const link = this.messenger.provider.link(message.url);
          out = await this.messenger.reply(connection, [message.title, message.body, message.cta ? `[${message.cta}] ${link}` : link].filter(Boolean).join('\n'), opts);
        } else if (event.aggregateType === 'payment' && entity) {
          out = await this.messenger.send(connection, 'sendPaymentNotification', [{ payment: entity, title: message.title, link: message.url }], opts);
        } else {
          out = await this.messenger.reply(connection, `${message.title}\n${message.body}\n${this.messenger.provider.link(message.url)}`.trim(), opts);
        }
    }
    return out.status;
  }
}
