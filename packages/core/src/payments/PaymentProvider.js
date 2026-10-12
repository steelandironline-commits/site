/**
 * PaymentProvider — vendor-independent payment contract.
 *
 * Every adapter normalizes vendor-specific states to the internal
 * PaymentStatus enum: PENDING | CONFIRMED | FAILED | EXPIRED | REFUNDED | CANCELED.
 *
 * Adapters must be stateless with respect to our database: they talk to the
 * vendor and return normalized data. Persistence, idempotency and
 * subscription activation live in PaymentService.
 */
export class PaymentProvider {
  /** @type {string} */
  name = 'abstract';

  /** Only the mock provider in non-production environments sets this. */
  supportsSimulation = false;

  /**
   * @param {object} input
   * @param {string} input.paymentId        internal Payment id (external reference)
   * @param {number} input.amountCents
   * @param {string} input.description
   * @param {{name:string,email:string,cnpj?:string|null}} input.payer
   * @param {string} input.idempotencyKey
   * @param {Date}   input.expiresAt
   * @returns {Promise<{providerPaymentId:string, status:string, qrCodeBase64:string|null, copyPaste:string, expiresAt:Date|null, metadata?:object}>}
   */
  // eslint-disable-next-line no-unused-vars
  async createPixCharge(input) {
    throw new Error(`${this.name}.createPixCharge not implemented`);
  }

  /** @returns {Promise<{status:string, paidAt?:Date|null, raw?:object}>} */
  // eslint-disable-next-line no-unused-vars
  async getPaymentStatus(providerPaymentId) {
    throw new Error(`${this.name}.getPaymentStatus not implemented`);
  }

  /**
   * Verify the webhook authenticity and normalize it.
   * Must throw WebhookSignatureError when verification fails.
   * @param {{headers:object, rawBody:Buffer|string, body:object, query:object}} req
   * @returns {Promise<Array<{providerEventId:string, providerPaymentId:string, type:string, status:string|null, paidAt?:Date|null, payload?:object}>>}
   */
  // eslint-disable-next-line no-unused-vars
  async handleWebhook(req) {
    throw new Error(`${this.name}.handleWebhook not implemented`);
  }

  /**
   * Pay out held funds to the merchant's Pix key (protected payments).
   * @returns {Promise<{transferId:string}>}
   */
  // eslint-disable-next-line no-unused-vars
  async releaseFunds({ amountCents, pixKey, pixKeyType, description }) {
    throw new PaymentProviderError(`${this.name} não suporta liberação de fundos`, { provider: this.name });
  }

  /** Refund a confirmed charge. */
  // eslint-disable-next-line no-unused-vars
  async refundPayment(providerPaymentId) {
    throw new PaymentProviderError(`${this.name} não suporta estorno`, { provider: this.name });
  }

  /** One-off Pix has nothing to cancel at the vendor; recurring adapters override. */
  // eslint-disable-next-line no-unused-vars
  async cancelSubscription(subscription) {
    return { canceled: true, providerAction: 'none' };
  }

  /** Return vendor-side subscription state, or null when the vendor has none (one-off Pix). */
  // eslint-disable-next-line no-unused-vars
  async getSubscriptionStatus(subscription) {
    return null;
  }
}

export class WebhookSignatureError extends Error {
  constructor(message = 'Invalid webhook signature') {
    super(message);
    this.name = 'WebhookSignatureError';
    this.status = 401;
    this.code = 'INVALID_SIGNATURE';
    this.expose = true;
  }
}

export class PaymentProviderError extends Error {
  constructor(message, { status, provider } = {}) {
    super(message);
    this.name = 'PaymentProviderError';
    this.providerStatus = status;
    this.provider = provider;
  }
}

export function header(headers, name) {
  if (!headers) return undefined;
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}
