import QRCode from 'qrcode';
import { PaymentProvider, WebhookSignatureError, header, NO_CAPABILITIES } from './PaymentProvider.js';
import { FinancialError } from './errors.js';
import { buildBrCode } from './brcode.js';
import { generateToken, hmacHex, safeEqual } from '../security/tokens.js';

export const MOCK_SIGNATURE_HEADER = 'x-autopix-signature';

/**
 * MockPaymentProvider — development/test only.
 * Produces a structurally valid BR Code that points to a non-existent key,
 * so nothing can be paid. Confirmation only happens through a signed mock
 * webhook, which travels the exact same code path as real providers.
 * The config layer refuses PAYMENT_PROVIDER=mock in production and
 * supportsSimulation is hard-wired to false there.
 */
export class MockPaymentProvider extends PaymentProvider {
  name = 'mock';
  label = 'Provedor de teste (mock)';
  isSandbox = true;

  /**
   * @param {object} o
   * @param {string[]} [o.capabilities] e.g. ['protectedFlow','payout','split'] —
   *   lets development/tests exercise every flow. Defaults to Pix + refund only.
   */
  constructor({ webhookSecret, isProduction = false, capabilities = [] } = {}) {
    super();
    if (!webhookSecret) throw new Error('MockPaymentProvider requires a webhook secret');
    this.webhookSecret = webhookSecret;
    this.supportsSimulation = !isProduction;
    this.state = new Map();
    this.extra = new Set(capabilities);
    this.refunds = new Map();
    this.payouts = new Map();
  }

  getCapabilities() {
    const caps = { ...NO_CAPABILITIES, pix: true, pixWebhook: true, paymentStatus: true, refund: true, partialRefund: true };
    for (const c of this.extra) if (c in caps) caps[c] = true;
    return { capabilities: caps, reasons: {} };
  }

  async getPixCharge(providerPaymentId) {
    return this.getPaymentStatus(providerPaymentId);
  }

  async cancelPixCharge(providerPaymentId) {
    this.state.set(providerPaymentId, { ...(this.state.get(providerPaymentId) || {}), status: 'CANCELED' });
    return { status: 'CANCELED' };
  }

  async createSplit({ allocations, idempotencyKey }) {
    if (!this.has('split')) throw new FinancialError('SPLIT_NOT_SUPPORTED');
    return { providerSplitId: `mock_split_${idempotencyKey}`, allocations: allocations.map((a, i) => ({ ...a, providerAllocationId: `mock_alloc_${idempotencyKey}_${i}`, status: 'PROCESSING' })) };
  }

  async createPayout({ amountCents, idempotencyKey }) {
    if (!this.has('payout')) throw new FinancialError('PAYOUT_NOT_SUPPORTED');
    if (!this.payouts.has(idempotencyKey)) this.payouts.set(idempotencyKey, { providerPayoutId: `mock_po_${generateToken(8)}`, amountCents, status: 'COMPLETED' });
    return this.payouts.get(idempotencyKey);
  }

  async createPixCharge({ paymentId, amountCents, description, expiresAt }) {
    const providerPaymentId = `mock_${generateToken(12)}`;
    const copyPaste = buildBrCode({
      key: 'autopix-mock-nao-pagavel',
      amount: amountCents / 100,
      merchantName: 'TEMPIX DEMO',
      merchantCity: 'SAO PAULO',
      txid: paymentId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25),
      description,
    });
    const qrCodeBase64 = (await QRCode.toDataURL(copyPaste, { margin: 1, width: 320, errorCorrectionLevel: 'M' })).replace(
      /^data:image\/png;base64,/,
      '',
    );
    this.state.set(providerPaymentId, { status: 'PENDING', amountCents });
    return { providerPaymentId, status: 'PENDING', qrCodeBase64, copyPaste, expiresAt, metadata: { mock: true } };
  }

  async getPaymentStatus(providerPaymentId) {
    const st = this.state.get(providerPaymentId);
    return { status: st?.status ?? 'PENDING', paidAt: null, amountCents: st?.amountCents ?? null };
  }

  async refundPayment(providerPaymentId, { amountCents, idempotencyKey } = {}) {
    // Idempotent per key, like real providers.
    if (!this.refunds.has(idempotencyKey)) {
      this.refunds.set(idempotencyKey, { providerRefundId: `mock_rf_${idempotencyKey}`, status: 'PROCESSING', amountCents, providerPaymentId });
    }
    return this.refunds.get(idempotencyKey);
  }

  /** Test helper: the provider finishes processing a refund. */
  completeRefund(idempotencyKey) {
    const r = this.refunds.get(idempotencyKey);
    if (r) r.status = 'COMPLETED';
  }

  async getRefundStatus(providerPaymentId, providerRefundId) {
    const r = [...this.refunds.values()].find((x) => x.providerRefundId === providerRefundId);
    return { status: r?.status || 'FAILED' };
  }

  sign(rawBody) {
    return hmacHex(this.webhookSecret, rawBody);
  }

  /** Build a signed webhook request for local simulation and tests. */
  buildWebhook(providerPaymentId, status = 'CONFIRMED', eventId = `evt_${generateToken(10)}`, { amountCents } = {}) {
    const body = {
      id: eventId,
      type: 'payment.updated',
      data: { paymentId: providerPaymentId, status, paidAt: status === 'CONFIRMED' ? new Date().toISOString() : null, amountCents: amountCents ?? this.state.get(providerPaymentId)?.amountCents ?? null },
    };
    const rawBody = JSON.stringify(body);
    return { headers: { [MOCK_SIGNATURE_HEADER]: this.sign(rawBody), 'content-type': 'application/json' }, rawBody, body };
  }

  async handleWebhook({ headers, rawBody }) {
    const raw = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody ?? '');
    const signature = header(headers, MOCK_SIGNATURE_HEADER);
    if (!signature || !safeEqual(signature, this.sign(raw))) throw new WebhookSignatureError();
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new WebhookSignatureError('Malformed webhook body');
    }
    const { paymentId, status, paidAt, amountCents } = body.data || {};
    if (!body.id || !paymentId || !status) return [];
    this.state.set(paymentId, { ...(this.state.get(paymentId) || {}), status });
    return [
      {
        providerEventId: body.id,
        providerPaymentId: paymentId,
        type: body.type || 'payment.updated',
        status,
        paidAt: paidAt ? new Date(paidAt) : null,
        amountCents: Number.isInteger(amountCents) ? amountCents : null,
        payload: { id: body.id, type: body.type, status },
      },
    ];
  }
}
