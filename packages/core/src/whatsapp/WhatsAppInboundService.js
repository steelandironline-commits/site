import { WHATSAPP_DECISIONS, deepLinks } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { describeResult } from '../actions/definitions.js';
import { parseCommandPayload, parseDecisionPayload } from './WhatsAppProvider.js';
import { logger } from '../logger.js';

const LINK_FOR = { opportunity: deepLinks.opportunity, freight: deepLinks.freightMatch, workforce: deepLinks.workforceMatch, payment: deepLinks.payment };

/**
 * WhatsAppController logic:
 *   webhook (signature verified) → dedupe → identify VERIFIED number →
 *   button → ActionEngine | text → WhatsAppCommandService → reply.
 * Unverified numbers can only complete the linking challenge.
 */
export class WhatsAppInboundService {
  constructor({ prisma = getPrisma(), provider, connections, commands, engine, messenger }) {
    this.prisma = prisma;
    this.provider = provider;
    this.connections = connections;
    this.commands = commands;
    this.engine = engine;
    this.messenger = messenger;
  }

  async processWebhook(req) {
    const inbound = await this.provider.handleWebhook(req); // throws on bad signature
    const results = [];
    for (const msg of inbound) results.push(await this.handle(msg));
    return results;
  }

  async handle(msg) {
    // Idempotency: providers retry deliveries.
    const stored = await this.prisma.whatsAppMessage.createMany({
      data: [
        {
          direction: 'INBOUND',
          phoneNumber: String(msg.from),
          kind: msg.type,
          body: msg.type === 'button' ? { buttonId: msg.buttonId, title: msg.buttonTitle } : { length: (msg.text || '').length },
          providerMessageId: msg.messageId,
          status: 'RECEIVED',
        },
      ],
      skipDuplicates: true,
    });
    if (!stored.count) return { duplicate: true };

    let connection = await this.connections.findVerifiedByPhone(msg.from);
    if (connection) {
      await this.prisma.whatsAppMessage.update({ where: { providerMessageId: msg.messageId }, data: { connectionId: connection.id } });
    }

    if (!connection) {
      const v = await this.connections.verifyInbound(msg.from, msg.text);
      const to = { to: String(msg.from) };
      const reply = (text) => this.messenger.send(v.connection || null, 'sendText', [text], to);
      switch (v.outcome) {
        case 'VERIFIED':
          connection = v.connection;
          await this.messenger.reply(connection, '✅ WhatsApp vinculado ao TemPix. Envie “ajuda” para ver o que posso fazer.');
          return { verified: true, connectionId: connection.id };
        case 'WRONG_CODE':
          await reply('Código incorreto. Confira o código exibido no app TemPix.');
          return { verified: false, reason: 'wrong_code' };
        case 'EXPIRED':
          await reply('Este código expirou. Gere um novo em Configurações → WhatsApp.');
          return { verified: false, reason: 'expired' };
        case 'LOCKED':
          await reply('Muitas tentativas. Gere um novo código no app.');
          return { verified: false, reason: 'locked' };
        case 'NO_CODE':
          await reply('Para vincular, envie a mensagem com o código exibido no app (ex.: TEMPIX 123456).');
          return { verified: false, reason: 'no_code' };
        default:
          await reply('Este número não está vinculado ao TemPix. Vincule em Configurações → WhatsApp no app.');
          return { verified: false, reason: 'unknown_number' };
      }
    }

    try {
      if (msg.type === 'button') return await this.#button(connection, msg);
      if (msg.type === 'text') {
        await this.commands.handleText(connection, msg.text);
        return { handled: 'text' };
      }
      await this.messenger.reply(connection, 'Por enquanto entendo apenas mensagens de texto e botões.');
      return { handled: 'unsupported' };
    } catch (err) {
      logger.warn('whatsapp inbound failed', { err });
      await this.messenger.reply(connection, `Não foi possível concluir: ${err.expose ? err.message : 'erro inesperado.'}`);
      return { error: err.message };
    }
  }

  async #button(connection, msg) {
    const cmd = parseCommandPayload(msg.buttonId);
    if (cmd) {
      await this.commands.resolvePending(connection, cmd.id, cmd.op);
      return { handled: 'command', op: cmd.op };
    }
    const d = parseDecisionPayload(msg.buttonId);
    if (!d) {
      await this.messenger.reply(connection, 'Botão não reconhecido.');
      return { handled: 'unknown_button' };
    }
    const action = WHATSAPP_DECISIONS[d.decision]?.[d.kind];
    const link = this.provider.link((LINK_FOR[d.kind] || (() => '/app'))(d.id));
    if (!action) {
      // VER ROTA / ABRIR TEMPIX: navigation only, no state change.
      await this.messenger.reply(connection, `Abra no TemPix: ${link}`);
      return { handled: 'link' };
    }
    const out = await this.engine.execute({
      action,
      input: { id: d.id },
      channel: 'WHATSAPP',
      actor: { userId: connection.userId, whatsappConnectionId: connection.id },
    });
    if (out.status === 'CONFIRMATION_REQUIRED') {
      await this.messenger.reply(connection, `🔒 Confirme no app TemPix: ${this.provider.link(out.challenge.confirmPath)}`);
      return { handled: 'challenge', action };
    }
    await this.messenger.reply(connection, `${describeResult(action, out.result)}\n${link}`);
    return { handled: 'action', action, status: out.status };
  }
}
