import { formatBRL, formatCents, formatRange } from '@autopix/shared';

/** Button payload: ap1:<DECISION>:<kind>:<entityId>  (kind: o|f|w|p) */
export function decisionPayload(decision, kind, id) {
  return `ap1:${decision.replace(/\s+/g, '_')}:${kind}:${id}`;
}

export function parseDecisionPayload(payload) {
  const m = /^ap1:([A-Z_]+):([ofwp]):([A-Za-z0-9_-]{1,64})$/.exec(String(payload || ''));
  if (!m) return null;
  const kinds = { o: 'opportunity', f: 'freight', w: 'workforce', p: 'payment' };
  return { decision: m[1].replace(/_/g, ' '), kind: kinds[m[2]], id: m[3] };
}

/** cmd:<confirm|cancel>:<pendingCommandId> */
export const commandPayload = (op, id) => `cmd:${op}:${id}`;
export function parseCommandPayload(payload) {
  const m = /^cmd:(confirm|cancel):([A-Za-z0-9_-]{1,64})$/.exec(String(payload || ''));
  return m ? { op: m[1], id: m[2] } : null;
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * WhatsAppProvider — official WhatsApp Business Platform boundary.
 * Concrete providers implement `transport(payload)` (Cloud API message
 * object) and `handleWebhook()`. Message composition lives here so every
 * provider sends identical content.
 *
 * Note: business-initiated messages outside the 24h customer-service window
 * require approved templates; when a template name is configured the
 * notification helpers use it, otherwise they send interactive messages.
 */
export class WhatsAppProvider {
  name = 'abstract';
  enabled = true;

  constructor({ templates = {}, appUrl = '' } = {}) {
    this.templates = templates;
    this.appUrl = appUrl;
  }

  // eslint-disable-next-line no-unused-vars
  async transport(message) {
    throw new Error(`${this.name}.transport not implemented`);
  }

  // eslint-disable-next-line no-unused-vars
  async handleWebhook(req) {
    throw new Error(`${this.name}.handleWebhook not implemented`);
  }

  /** GET verification handshake (Meta). Returns the challenge or null. */
  // eslint-disable-next-line no-unused-vars
  verifySubscription(query) {
    return null;
  }

  base(to) {
    return { messaging_product: 'whatsapp', recipient_type: 'individual', to };
  }

  async sendText(to, text) {
    return this.transport({ ...this.base(to), type: 'text', text: { body: clip(text, 4096), preview_url: true } });
  }

  /** Up to 3 reply buttons (WhatsApp limit), titles ≤ 20 chars. */
  async sendInteractiveMessage(to, { body, buttons, header, footer }) {
    return this.transport({
      ...this.base(to),
      type: 'interactive',
      interactive: {
        type: 'button',
        ...(header ? { header: { type: 'text', text: clip(header, 60) } } : {}),
        body: { text: clip(body, 1024) },
        ...(footer ? { footer: { text: clip(footer, 60) } } : {}),
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: clip(b.title, 20) } })),
        },
      },
    });
  }

  async sendTemplate(to, { name, language = this.templates.language || 'pt_BR', bodyParams = [], quickReplies = [], urlButtons = [] }) {
    const components = [];
    if (bodyParams.length) components.push({ type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: String(t) })) });
    quickReplies.forEach((payload, index) =>
      components.push({ type: 'button', sub_type: 'quick_reply', index: String(index), parameters: [{ type: 'payload', payload }] }),
    );
    urlButtons.forEach((value, index) =>
      components.push({ type: 'button', sub_type: 'url', index: String(index), parameters: [{ type: 'text', text: String(value) }] }),
    );
    return this.transport({ ...this.base(to), type: 'template', template: { name, language: { code: language }, components } });
  }

  /** Authentication template: the same OTP fills the body and copy-code button. */
  async sendAuthenticationCode(to, { code }) {
    const name = this.templates.authentication || (this.name === 'mock' ? 'mock_authentication_code' : null);
    if (!name) throw new Error('WHATSAPP_TEMPLATE_AUTH is required for OTP delivery');
    return this.sendTemplate(to, { name, bodyParams: [code], urlButtons: [code] });
  }

  link(path) {
    return `${this.appUrl}${path}`;
  }

  async #decision(to, { template, header, body, params, buttons }) {
    if (template) {
      return this.sendTemplate(to, { name: template, bodyParams: params, quickReplies: buttons.map((b) => b.id) });
    }
    return this.sendInteractiveMessage(to, { header, body, buttons, footer: 'TemPix' });
  }

  async sendOpportunityNotification(to, { opportunity: o, link }) {
    const value = formatRange(o.estimatedMinValue, o.estimatedMaxValue);
    const place = [o.city, o.state].filter(Boolean).join('/');
    return this.#decision(to, {
      template: this.templates.opportunity,
      header: o.priority === 'HIGH' ? 'Oportunidade · ALTA PRIORIDADE' : 'Nova oportunidade',
      body: `${o.targetCompanyName}${place ? ` (${place})` : ''}\nMatch ${o.score}% · ${o.signal}\nPotencial: ${value}${o.isDemo ? '\n[DEMO]' : ''}\n\n${this.link(link)}`,
      params: [o.targetCompanyName, `${o.score}%`, o.signal, value],
      buttons: [
        { id: decisionPayload('ANALISAR', 'o', o.id), title: 'ANALISAR' },
        { id: decisionPayload('ABORDAR', 'o', o.id), title: 'ABORDAR' },
        { id: decisionPayload('DESCARTAR', 'o', o.id), title: 'DESCARTAR' },
      ],
    });
  }

  async sendFreightMatchNotification(to, { match: m, link }) {
    return this.#decision(to, {
      template: this.templates.freight,
      header: m.isReturnLoad ? 'Carga de retorno encontrada' : 'Carga compatível',
      body: `${m.origin} → ${m.destination}\n${m.cargo || 'Carga geral'}${m.price ? ` · ${formatBRL(m.price)}` : ''}${m.isDemo ? '\n[DEMO]' : ''}\n\n${this.link(link)}`,
      params: [m.origin, m.destination, m.price ? formatBRL(m.price) : '—'],
      buttons: [
        { id: decisionPayload('TENHO INTERESSE', 'f', m.id), title: 'TENHO INTERESSE' },
        { id: decisionPayload('VER ROTA', 'f', m.id), title: 'VER ROTA' },
        { id: decisionPayload('RECUSAR', 'f', m.id), title: 'RECUSAR' },
      ],
    });
  }

  async sendWorkforceMatchNotification(to, { match: m, link }) {
    return this.#decision(to, {
      template: this.templates.workforce,
      header: 'Profissional compatível',
      body: `${m.professionalName} · ${m.role}${m.city ? ` · ${m.city}` : ''}${m.isDemo ? '\n[DEMO]' : ''}\n\n${this.link(link)}`,
      params: [m.professionalName, m.role],
      buttons: [
        { id: decisionPayload('CONVIDAR', 'w', m.id), title: 'CONVIDAR' },
        { id: decisionPayload('RECUSAR', 'w', m.id), title: 'RECUSAR' },
        { id: decisionPayload('ABRIR TEMPIX', 'w', m.id), title: 'ABRIR TEMPIX' },
      ],
    });
  }

  /** Payment notification. Never includes provider credentials. */
  async sendPaymentNotification(to, { payment: p, title, link, includePixCode = false }) {
    const lines = [title || 'Pagamento', `Valor: ${formatCents(p.amountCents)}`];
    if (p.reference) lines.push(`Referência: ${p.reference}`);
    if (includePixCode && p.pixCopyPaste) lines.push('', 'Pix copia e cola:', p.pixCopyPaste);
    lines.push('', `Detalhes: ${this.link(link)}`);
    if (this.templates.payment && !includePixCode) {
      return this.sendTemplate(to, { name: this.templates.payment, bodyParams: [title || 'Pagamento', formatCents(p.amountCents), p.reference || '—'] });
    }
    return this.sendText(to, lines.join('\n'));
  }
}
