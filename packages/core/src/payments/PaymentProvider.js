import { FinancialError, capabilityError } from './errors.js';

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
/** Canonical capability flags — the UI renders only what is true. */
export const NO_CAPABILITIES = Object.freeze({
  pix: false,
  pixWebhook: false,
  paymentStatus: false,
  split: false,
  payout: false,
  refund: false,
  partialRefund: false,
  bbPayRedirect: false,
  recurringPix: false,
  protectedFlow: false,
});

export class PaymentProvider {
  /** @type {string} */
  name = 'abstract';

  /** Human label for UI ("Processado por …"). */
  label = 'Parceiro financeiro';

  /** Only the mock provider in non-production environments sets this. */
  supportsSimulation = false;

  /** True when talking to a sandbox/homologation environment. */
  isSandbox = false;

  /**
   * Capability discovery. Never report a capability the current
   * credentials/contract do not actually support.
   * @returns {{capabilities: typeof NO_CAPABILITIES, reasons: Record<string,string>}}
   */
  getCapabilities() {
    return { capabilities: { ...NO_CAPABILITIES }, reasons: {} };
  }

  has(capability) {
    return Boolean(this.getCapabilities().capabilities[capability]);
  }

  // Optional operations — default: clean capability error, never a fake success.
  // eslint-disable-next-line no-unused-vars
  async getPixCharge(providerPaymentId) {
    throw capabilityError('paymentStatus');
  }

  // eslint-disable-next-line no-unused-vars
  async cancelPixCharge(providerPaymentId) {
    throw capabilityError('pix');
  }

  // eslint-disable-next-line no-unused-vars
  async createSplit({ payment, allocations, idempotencyKey }) {
    throw new FinancialError('SPLIT_NOT_SUPPORTED');
  }

  // eslint-disable-next-line no-unused-vars
  async createPayout({ amountCents, beneficiary, idempotencyKey, description }) {
    throw new FinancialError('PAYOUT_NOT_SUPPORTED');
  }

  // eslint-disable-next-line no-unused-vars
  async createPaymentRedirect({ payment, returnUrl }) {
    throw capabilityError('bbPayRedirect');
  }

  /** Authenticity check only (no parsing); handleWebhook calls it. */
  // eslint-disable-next-line no-unused-vars
  validateWebhook(req) {
    return true;
  }

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
   * Refund (full or partial) a confirmed charge.
   * @returns {Promise<{providerRefundId:string, status:'PROCESSING'|'COMPLETED'|'FAILED'}>}
   */
  // eslint-disable-next-line no-unused-vars
  async refundPayment(providerPaymentId, { amountCents, idempotencyKey, reason } = {}) {
    throw capabilityError('refund');
  }

  /** Current state of a refund previously requested. */
  // eslint-disable-next-line no-unused-vars
  async getRefundStatus(providerPaymentId, providerRefundId) {
    throw capabilityError('refund');
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
