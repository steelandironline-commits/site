import { WhatsAppProvider } from './WhatsAppProvider.js';
import { parseCloudWebhook } from './CloudApiWhatsAppProvider.js';
import { generateToken, hmacHex, safeEqual } from '../security/tokens.js';
import { WebhookSignatureError } from '../payments/PaymentProvider.js';

/**
 * Development/test provider: records outbound messages in memory and
 * accepts Cloud-API-shaped webhooks signed with a local secret. Refused in
 * production by configuration.
 */
export class MockWhatsAppProvider extends WhatsAppProvider {
  name = 'mock';

  constructor({ secret, ...rest }) {
    super(rest);
    this.secret = secret;
    this.sent = [];
  }

  async transport(message) {
    const messageId = `wamid.mock.${generateToken(10)}`;
    this.sent.push({ messageId, ...message });
    if (this.sent.length > 200) this.sent.shift();
    return { messageId };
  }

  sign(rawBody) {
    return `sha256=${hmacHex(this.secret, rawBody)}`;
  }

  /** Build a signed inbound webhook (button or text), for local tests. */
  buildInbound({ from, text, buttonId, buttonTitle, messageId = `wamid.in.${generateToken(8)}` }) {
    const message = buttonId
      ? { from, id: messageId, timestamp: String(Math.floor(Date.now() / 1000)), type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: buttonId, title: buttonTitle || 'OK' } } }
      : { from, id: messageId, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } };
    const body = { object: 'whatsapp_business_account', entry: [{ id: 'mock', changes: [{ field: 'messages', value: { contacts: [{ wa_id: from, profile: { name: 'Teste' } }], messages: [message] } }] }] };
    const rawBody = JSON.stringify(body);
    return { headers: { 'x-hub-signature-256': this.sign(rawBody), 'content-type': 'application/json' }, rawBody, body };
  }

  async handleWebhook({ headers, rawBody, body }) {
    const raw = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody ?? '');
    if (!safeEqual(headers['x-hub-signature-256'], this.sign(raw))) throw new WebhookSignatureError();
    return parseCloudWebhook(body);
  }
}

/** Used when no credentials are configured: nothing is sent, nothing is accepted. */
export class DisabledWhatsAppProvider extends WhatsAppProvider {
  name = 'disabled';
  enabled = false;

  async transport() {
    const err = new Error('WhatsApp não configurado');
    err.skipped = true;
    throw err;
  }

  async handleWebhook() {
    throw new WebhookSignatureError('WhatsApp não configurado');
  }
}
