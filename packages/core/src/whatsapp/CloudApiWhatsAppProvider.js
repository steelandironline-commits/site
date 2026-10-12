import { WhatsAppProvider } from './WhatsAppProvider.js';
import { hmacHex, safeEqual } from '../security/tokens.js';
import { WebhookSignatureError } from '../payments/PaymentProvider.js';

/**
 * WhatsApp Business Platform — Cloud API (graph.facebook.com).
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 * Webhooks are authenticated with X-Hub-Signature-256 (HMAC-SHA256 of the
 * raw body with the App Secret).
 */
export class CloudApiWhatsAppProvider extends WhatsAppProvider {
  name = 'cloud';

  constructor({ accessToken, phoneNumberId, appSecret, verifyToken, apiVersion = 'v21.0', fetchImpl = globalThis.fetch, ...rest }) {
    super(rest);
    if (!accessToken || !phoneNumberId || !appSecret) throw new Error('WhatsApp Cloud API requires access token, phone number id and app secret');
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
    this.appSecret = appSecret;
    this.verifyToken = verifyToken;
    this.apiVersion = apiVersion;
    this.fetch = fetchImpl;
  }

  async transport(message) {
    const res = await this.fetch(`https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(`WhatsApp Cloud API ${res.status}: ${data?.error?.message || 'error'}`.slice(0, 300));
      err.providerStatus = res.status;
      throw err;
    }
    return { messageId: data.messages?.[0]?.id || null };
  }

  verifySubscription(query) {
    if (query['hub.mode'] === 'subscribe' && this.verifyToken && safeEqual(query['hub.verify_token'], this.verifyToken)) {
      return String(query['hub.challenge'] ?? '');
    }
    return null;
  }

  verifySignature(headers, rawBody) {
    const sig = String(headers['x-hub-signature-256'] || '');
    const expected = `sha256=${hmacHex(this.appSecret, rawBody)}`;
    if (!sig || !safeEqual(sig, expected)) throw new WebhookSignatureError();
  }

  async handleWebhook({ headers, rawBody, body }) {
    this.verifySignature(headers, Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody ?? '')));
    return parseCloudWebhook(body);
  }
}

/** Normalize a Cloud API webhook body into inbound messages. */
export function parseCloudWebhook(body) {
  const out = [];
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const contacts = Object.fromEntries((value.contacts || []).map((c) => [c.wa_id, c]));
      for (const m of value.messages || []) {
        const base = { messageId: m.id, from: m.from, contactId: m.from, name: contacts[m.from]?.profile?.name, timestamp: m.timestamp };
        if (m.type === 'text') out.push({ ...base, type: 'text', text: m.text?.body || '' });
        else if (m.type === 'interactive' && m.interactive?.button_reply) {
          out.push({ ...base, type: 'button', buttonId: m.interactive.button_reply.id, buttonTitle: m.interactive.button_reply.title });
        } else if (m.type === 'interactive' && m.interactive?.list_reply) {
          out.push({ ...base, type: 'button', buttonId: m.interactive.list_reply.id, buttonTitle: m.interactive.list_reply.title });
        } else if (m.type === 'button') {
          out.push({ ...base, type: 'button', buttonId: m.button?.payload, buttonTitle: m.button?.text });
        } else out.push({ ...base, type: 'unsupported', kind: m.type });
      }
    }
  }
  return out;
}
