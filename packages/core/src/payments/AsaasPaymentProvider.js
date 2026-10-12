import { PaymentProvider, PaymentProviderError, WebhookSignatureError, header } from './PaymentProvider.js';
import { safeEqual } from '../security/tokens.js';

const STATUS_MAP = {
  RECEIVED: 'CONFIRMED',
  CONFIRMED: 'CONFIRMED',
  RECEIVED_IN_CASH: 'CONFIRMED',
  PENDING: 'PENDING',
  AWAITING_RISK_ANALYSIS: 'PENDING',
  OVERDUE: 'EXPIRED',
  REFUNDED: 'REFUNDED',
  REFUND_REQUESTED: 'REFUNDED',
  REFUND_IN_PROGRESS: 'REFUNDED',
  CHARGEBACK_REQUESTED: 'REFUNDED',
  DELETED: 'CANCELED',
};

/**
 * Asaas adapter — Pix charges via /v3/payments (billingType PIX).
 * Docs: https://docs.asaas.com/
 *
 * Webhook authenticity: Asaas sends the token configured on the webhook in
 * the `asaas-access-token` header. The status is re-fetched from the API.
 * Asaas also supports subscriptions (Pix Automático path) — the
 * subscription methods are ready for that migration.
 */
export class AsaasPaymentProvider extends PaymentProvider {
  name = 'asaas';

  constructor({ accessToken, webhookSecret, apiUrl, fetchImpl = globalThis.fetch } = {}) {
    super();
    if (!accessToken) throw new Error('Asaas requires PAYMENT_ACCESS_TOKEN');
    if (!webhookSecret) throw new Error('Asaas requires PAYMENT_WEBHOOK_SECRET');
    this.accessToken = accessToken;
    this.webhookSecret = webhookSecret;
    this.apiUrl = (apiUrl || 'https://api.asaas.com/v3').replace(/\/$/, '');
    this.fetch = fetchImpl;
  }

  async #request(path, { method = 'GET', body } = {}) {
    const res = await this.fetch(`${this.apiUrl}${path}`, {
      method,
      headers: { access_token: this.accessToken, 'Content-Type': 'application/json', 'User-Agent': 'AutoPix' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new PaymentProviderError(`Asaas ${method} ${path} failed (${res.status})`, { status: res.status, provider: this.name });
    }
    return data;
  }

  static normalizeStatus(status) {
    return STATUS_MAP[status] || 'PENDING';
  }

  async #ensureCustomer(payer, externalReference) {
    if (!payer.cnpj) throw new PaymentProviderError('Asaas requires the payer CNPJ', { provider: this.name });
    const found = await this.#request(`/customers?cpfCnpj=${encodeURIComponent(payer.cnpj)}&limit=1`);
    if (found.data?.[0]?.id) return found.data[0].id;
    const created = await this.#request('/customers', {
      method: 'POST',
      body: { name: payer.name, email: payer.email, cpfCnpj: payer.cnpj, externalReference },
    });
    return created.id;
  }

  async createPixCharge({ paymentId, amountCents, description, payer, expiresAt }) {
    const customer = await this.#ensureCustomer(payer, payer.companyId);
    const dueDate = new Date(expiresAt).toISOString().slice(0, 10);
    const charge = await this.#request('/payments', {
      method: 'POST',
      body: {
        customer,
        billingType: 'PIX',
        value: Number((amountCents / 100).toFixed(2)),
        dueDate,
        description,
        externalReference: paymentId,
      },
    });
    const qr = await this.#request(`/payments/${encodeURIComponent(charge.id)}/pixQrCode`);
    return {
      providerPaymentId: String(charge.id),
      status: AsaasPaymentProvider.normalizeStatus(charge.status),
      qrCodeBase64: qr.encodedImage || null,
      copyPaste: qr.payload,
      expiresAt: qr.expirationDate ? new Date(qr.expirationDate) : expiresAt,
      metadata: { customer },
    };
  }

  async getPaymentStatus(providerPaymentId) {
    const data = await this.#request(`/payments/${encodeURIComponent(providerPaymentId)}`);
    return {
      status: AsaasPaymentProvider.normalizeStatus(data.status),
      paidAt: data.paymentDate ? new Date(data.paymentDate) : null,
      raw: { status: data.status },
    };
  }

  async handleWebhook({ headers, body = {} }) {
    const token = header(headers, 'asaas-access-token');
    if (!token || !safeEqual(token, this.webhookSecret)) throw new WebhookSignatureError();
    const payment = body.payment;
    if (!payment?.id || !String(body.event || '').startsWith('PAYMENT_')) return [];
    const { status, paidAt, raw } = await this.getPaymentStatus(String(payment.id));
    return [
      {
        providerEventId: body.id ? String(body.id) : `${body.event}:${payment.id}:${status}`,
        providerPaymentId: String(payment.id),
        type: body.event,
        status,
        paidAt,
        payload: { event: body.event, ...raw },
      },
    ];
  }

  /** Pix transfer to the merchant key (POST /transfers). */
  async releaseFunds({ amountCents, pixKey, pixKeyType, description }) {
    const data = await this.#request('/transfers', {
      method: 'POST',
      body: {
        value: Number((amountCents / 100).toFixed(2)),
        operationType: 'PIX',
        pixAddressKey: pixKey,
        pixAddressKeyType: pixKeyType || 'EVP',
        description: description || 'AutoPix — liberação de pagamento protegido',
      },
    });
    return { transferId: String(data.id) };
  }

  async refundPayment(providerPaymentId) {
    await this.#request(`/payments/${encodeURIComponent(providerPaymentId)}/refund`, { method: 'POST', body: {} });
    return { refunded: true };
  }

  async cancelSubscription(subscription) {
    if (subscription?.providerSubscriptionId) {
      await this.#request(`/subscriptions/${encodeURIComponent(subscription.providerSubscriptionId)}`, { method: 'DELETE' });
      return { canceled: true, providerAction: 'deleted' };
    }
    return { canceled: true, providerAction: 'none' };
  }

  async getSubscriptionStatus(subscription) {
    if (!subscription?.providerSubscriptionId) return null;
    const data = await this.#request(`/subscriptions/${encodeURIComponent(subscription.providerSubscriptionId)}`);
    return { status: data.status, nextDueDate: data.nextDueDate };
  }
}
