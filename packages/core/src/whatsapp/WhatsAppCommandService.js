import { deepLinks, formatBRL, formatCents } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { describeResult } from '../actions/definitions.js';
import { commandPayload } from './WhatsAppProvider.js';
import { logger } from '../logger.js';

const PENDING_TTL_MS = 10 * 60 * 1000;
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit' }) : null);

export const HELP_TEXT = [
  'AutoPix no WhatsApp — exemplos:',
  '• quais oportunidades apareceram hoje?',
  '• quanto tenho em negócios abertos?',
  '• procura carga de Santos para São Paulo amanhã',
  '• preciso de 3 soldadores segunda',
  '• gere um Pix de 1400',
].join('\n');

/**
 * Natural-language commands. Pipeline:
 *   parse intent → validate parameters → (confirmation for state changes)
 *   → ActionEngine.execute(channel WHATSAPP) → reply.
 * The parser never touches state; only the ActionEngine does.
 */
export class WhatsAppCommandService {
  constructor({ prisma = getPrisma(), parser, engine, messenger }) {
    this.prisma = prisma;
    this.parser = parser;
    this.engine = engine;
    this.messenger = messenger;
  }

  actorFor(connection) {
    return { userId: connection.userId, whatsappConnectionId: connection.id };
  }

  async run(connection, action, input) {
    return this.engine.execute({ action, input, channel: 'WHATSAPP', actor: this.actorFor(connection) });
  }

  async handleText(connection, text) {
    const parsed = await this.parser.parse(text);
    const p = parsed.params || {};
    switch (parsed.intent) {
      case 'CONFIRM':
      case 'CANCEL': {
        const pending = await this.prisma.whatsAppPendingCommand.findFirst({
          where: { connectionId: connection.id, status: 'PENDING', expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
        });
        if (!pending) return this.messenger.reply(connection, 'Não há nenhuma ação aguardando confirmação.');
        return this.resolvePending(connection, pending.id, parsed.intent === 'CONFIRM' ? 'confirm' : 'cancel');
      }
      case 'LIST_TODAY_OPPORTUNITIES': {
        const { result } = await this.run(connection, 'LIST_TODAY_OPPORTUNITIES', { limit: 5 });
        if (!result.total) return this.messenger.reply(connection, 'Nenhuma oportunidade nova nas últimas 24h. Seus agentes continuam procurando.');
        const lines = result.items.map(
          (o, i) => `${i + 1}. ${o.targetCompanyName} — ${o.score}% · ${formatBRL(o.estimatedMaxValue)}${o.isDemo ? ' [DEMO]' : ''}\n   ${this.messenger.provider.link(deepLinks.opportunity(o.id))}`,
        );
        return this.messenger.reply(connection, `📈 ${result.total} oportunidade(s) nas últimas 24h:\n\n${lines.join('\n')}`);
      }
      case 'GET_OPEN_PIPELINE_VALUE': {
        const { result } = await this.run(connection, 'GET_OPEN_PIPELINE_VALUE', {});
        return this.messenger.reply(connection, describeResult('GET_OPEN_PIPELINE_VALUE', result));
      }
      case 'CREATE_PIX':
        if (!p.amountCents) return this.messenger.reply(connection, 'Qual o valor do Pix? Ex.: “gere um Pix de 1400”.');
        return this.askConfirmation(connection, 'CREATE_PIX', { amountCents: p.amountCents, ...(p.description ? { description: p.description } : {}) }, `Gerar uma cobrança Pix de ${formatCents(p.amountCents)}?`);
      case 'SEARCH_FREIGHT':
        if (!p.origin || !p.destination) return this.messenger.reply(connection, 'Informe a rota. Ex.: “procura carga de Santos para São Paulo amanhã”.');
        return this.askConfirmation(
          connection,
          'CREATE_FREIGHT_REQUEST',
          { origin: p.origin, destination: p.destination, ...(p.date ? { date: p.date } : {}) },
          `Procurar cargas ${p.origin} → ${p.destination}${p.date ? ` (${fmtDay(p.date)})` : ''}?`,
        );
      case 'CREATE_WORKFORCE_DEMAND': {
        const startDate = p.startDate || p.date;
        if (!p.role || !p.quantity) return this.messenger.reply(connection, 'Diga a quantidade e a função. Ex.: “preciso de 3 soldadores segunda”.');
        return this.askConfirmation(
          connection,
          'CREATE_WORKFORCE_DEMAND',
          { role: p.role, quantity: p.quantity, ...(startDate ? { startDate } : {}) },
          `Criar demanda: ${p.quantity} × ${p.role}${startDate ? ` a partir de ${fmtDay(startDate)}` : ''}?`,
        );
      }
      case 'HELP':
        return this.messenger.reply(connection, HELP_TEXT);
      default:
        return this.messenger.reply(connection, `Não entendi. ${HELP_TEXT}`);
    }
  }

  async askConfirmation(connection, action, params, summary) {
    // Only one pending command at a time per number.
    await this.prisma.whatsAppPendingCommand.updateMany({ where: { connectionId: connection.id, status: 'PENDING' }, data: { status: 'SUPERSEDED' } });
    const pending = await this.prisma.whatsAppPendingCommand.create({
      data: { connectionId: connection.id, intent: action, params, summary, expiresAt: new Date(Date.now() + PENDING_TTL_MS) },
    });
    return this.messenger.send(connection, 'sendInteractiveMessage', [
      {
        body: `${summary}\n\nResponda SIM para confirmar.`,
        buttons: [
          { id: commandPayload('confirm', pending.id), title: 'CONFIRMAR' },
          { id: commandPayload('cancel', pending.id), title: 'CANCELAR' },
        ],
      },
    ]);
  }

  async resolvePending(connection, pendingId, op) {
    const claimed = await this.prisma.whatsAppPendingCommand.updateMany({
      where: { id: pendingId, connectionId: connection.id, status: 'PENDING', expiresAt: { gt: new Date() } },
      data: { status: op === 'confirm' ? 'CONFIRMED' : 'CANCELED' },
    });
    if (claimed.count !== 1) return this.messenger.reply(connection, 'Esta solicitação expirou ou já foi respondida.');
    if (op === 'cancel') return this.messenger.reply(connection, 'Cancelado. Nada foi alterado.');

    const pending = await this.prisma.whatsAppPendingCommand.findUnique({ where: { id: pendingId } });
    try {
      const out = await this.run(connection, pending.intent, pending.params);
      if (out.status === 'CONFIRMATION_REQUIRED') {
        return this.messenger.reply(
          connection,
          `🔒 Por segurança, confirme no app AutoPix:\n${this.messenger.provider.link(out.challenge.confirmPath)}`,
        );
      }
      if (pending.intent === 'CREATE_PIX') {
        const payment = out.result.payment;
        return this.messenger.send(connection, 'sendPaymentNotification', [
          { payment, title: '✅ Pix gerado', link: deepLinks.payment(payment.id), includePixCode: true },
        ]);
      }
      return this.messenger.reply(connection, describeResult(pending.intent, out.result));
    } catch (err) {
      logger.warn('whatsapp command failed', { intent: pending.intent, err });
      return this.messenger.reply(connection, `Não foi possível concluir: ${err.expose ? err.message : 'erro inesperado.'}`);
    }
  }
}
