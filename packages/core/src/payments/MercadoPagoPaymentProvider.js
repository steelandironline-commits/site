import { PaymentProvider, PaymentProviderError, WebhookSignatureError, header, NO_CAPABILITIES } from './PaymentProvider.js';
import { hmacHex, safeEqual } from '../security/tokens.js';

const STATUS_MAP = {
  approved: 'CONFIRMED',
  pending: 'PENDING',
  in_process: 'PENDING',
  authorized: 'PENDING',
  in_mediation: 'PENDING',
  rejected: 'FAILED',
  cancelled: 'CANCELED',
  refunded: 'REFUNDED',
  charged_back: 'REFUNDED',
};

/**
 * Mercado Pago adapter — Pix through the Payments API.
 * Docs: https://www.mercadopago.com.br/developers/pt/docs/checkout-api/integration-configuration/integrate-with-pix
 *
 * Webhook authenticity: `x-signature: ts=<ts>,v1=<hmac>` where hmac is
 * HMAC-SHA256(secret, "id:<data.id>;request-id:<x-request-id>;ts:<ts>;").
 * The notification only carries the payment id, so the authoritative status
 * is always re-fetched from the API before anything is persisted.
 */
export class MercadoPagoPaymentProvider extends PaymentProvider {
  name = 'mercadopago';

  constructor({ accessToken, webhookSecret, apiUrl, notificationUrl, fetchImpl = globalThis.fetch } = {}) {
    super();
    if (!accessToken) throw new Error('Mercado Pago requires PAYMENT_ACCESS_TOKEN');
    if (!webhookSecret) throw new Error('Mercado Pago requires PAYMENT_WEBHOOK_SECRET');
    this.accessToken = accessToken;
    this.webhookSecret = webhookSecret;
    this.apiUrl = (apiUrl || 'https://api.mercadopago.com').replace(/\/$/, '');
    this.notificationUrl = notificationUrl;
    this.fetch = fetchImpl;
  }

  async #request(path, { method = 'GET', body, idempotencyKey } = {}) {
    const res = await this.fetch(`${this.apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new PaymentProviderError(`Mercado Pago ${method} ${path} failed (${res.status})`, {
        status: res.status,
        provider: this.name,
      });
    }
    return data;
  }

  static normalizeStatus(status) {
    return STATUS_MAP[status] || 'PENDING';
  }

  async createPixCharge({ paymentId, amountCents, description, payer, idempotencyKey, expiresAt }) {
    const [firstName, ...rest] = String(payer.name || 'Cliente').split(' ');
    const data = await this.#request('/v1/payments', {
      method: 'POST',
      idempotencyKey,
      body: {
        transaction_amount: Number((amountCents / 100).toFixed(2)),
        description,
        payment_method_id: 'pix',
        external_reference: paymentId,
        notification_url: this.notificationUrl,
        date_of_expiration: expiresAt.toISOString().replace('Z', '-00:00'),
        payer: {
          email: payer.email,
          first_name: firstName,
          last_name: rest.join(' ') || undefined,
          ...(payer.cnpj ? { identification: { type: 'CNPJ', number: payer.cnpj } } : {}),
        },
      },
    });
    const tx = data.point_of_interaction?.transaction_data || {};
    if (!tx.qr_code) throw new PaymentProviderError('Mercado Pago did not return a Pix code', { provider: this.name });
    return {
      providerPaymentId: String(data.id),
      status: MercadoPagoPaymentProvider.normalizeStatus(data.status),
      qrCodeBase64: tx.qr_code_base64 || null,
      copyPaste: tx.qr_code,
      expiresAt: data.date_of_expiration ? new Date(data.date_of_expiration) : expiresAt,
      metadata: { mpStatus: data.status },
    };
  }

  async getPaymentStatus(providerPaymentId) {
    const data = await this.#request(`/v1/payments/${encodeURIComponent(providerPaymentId)}`);
    return {
      status: MercadoPagoPaymentProvider.normalizeStatus(data.status),
      paidAt: data.date_approved ? new Date(data.date_approved) : null,
      amountCents: data.transaction_amount != null ? Math.round(Number(data.transaction_amount) * 100) : null,
      raw: { status: data.status, status_detail: data.status_detail },
    };
  }

  getCapabilities() {
    return {
      capabilities: { ...NO_CAPABILITIES, pix: true, pixWebhook: true, paymentStatus: true, refund: true, partialRefund: true },
      reasons: { split: 'Split Mercado Pago (marketplace) não integrado', payout: 'Não suportado', protectedFlow: 'Não habilitado' },
    };
  }

  async refundPayment(providerPaymentId, { amountCents, idempotencyKey } = {}) {
    const data = await this.#request(`/v1/payments/${encodeURIComponent(providerPaymentId)}/refunds`, {
      method: 'POST',
      body: amountCents ? { amount: Number((amountCents / 100).toFixed(2)) } : {},
      idempotencyKey: idempotencyKey || `refund-${providerPaymentId}`,
    });
    return { providerRefundId: String(data.id), status: data.status === 'approved' ? 'COMPLETED' : 'PROCESSING' };
  }

  async getRefundStatus(providerPaymentId) {
    const { status } = await this.getPaymentStatus(providerPaymentId);
    return { status: status === 'REFUNDED' ? 'COMPLETED' : 'PROCESSING' };
  }

  verifySignature({ headers, dataId }) {
    const signature = header(headers, 'x-signature');
    const requestId = header(headers, 'x-request-id') || '';
    if (!signature) throw new WebhookSignatureError();
    const parts = Object.fromEntries(
      String(signature)
        .split(',')
        .map((p) => p.trim().split('='))
        .filter((p) => p.length === 2),
    );
    if (!parts.ts || !parts.v1) throw new WebhookSignatureError();
    const id = /^[a-z0-9]+$/i.test(dataId) ? String(dataId).toLowerCase() : dataId;
    let manifest = '';
    if (id) manifest += `id:${id};`;
    if (requestId) manifest += `request-id:${requestId};`;
    manifest += `ts:${parts.ts};`;
    if (!safeEqual(parts.v1, hmacHex(this.webhookSecret, manifest))) throw new WebhookSignatureError();
  }

  async handleWebhook({ headers, body = {}, query = {} }) {
    const dataId = query['data.id'] ?? body?.data?.id;
    this.verifySignature({ headers, dataId: dataId ? String(dataId) : '' });
    const kind = body.type || query.type || body.topic;
    if (kind !== 'payment' || !dataId) return [];

    const { status, paidAt, raw } = await this.getPaymentStatus(String(dataId));
    return [
      {
        // Status-scoped id: repeated notifications for the same state are no-ops.
        providerEventId: `payment:${dataId}:${status}`,
        providerPaymentId: String(dataId),
        type: body.action || 'payment.updated',
        status,
        paidAt,
        payload: { action: body.action, notificationId: body.id, ...raw },
      },
    ];
  }
}
