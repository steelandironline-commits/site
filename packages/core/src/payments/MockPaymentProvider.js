import QRCode from 'qrcode';
import { PaymentProvider, WebhookSignatureError, header } from './PaymentProvider.js';
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

  constructor({ webhookSecret, isProduction = false } = {}) {
    super();
    if (!webhookSecret) throw new Error('MockPaymentProvider requires a webhook secret');
    this.webhookSecret = webhookSecret;
    this.supportsSimulation = !isProduction;
    this.state = new Map();
  }

  async createPixCharge({ paymentId, amountCents, description, expiresAt }) {
    const providerPaymentId = `mock_${generateToken(12)}`;
    const copyPaste = buildBrCode({
      key: 'autopix-mock-nao-pagavel',
      amount: amountCents / 100,
      merchantName: 'AUTOPIX DEMO',
      merchantCity: 'SAO PAULO',
      txid: paymentId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25),
      description,
    });
    const qrCodeBase64 = (await QRCode.toDataURL(copyPaste, { margin: 1, width: 320, errorCorrectionLevel: 'M' })).replace(
      /^data:image\/png;base64,/,
      '',
    );
    this.state.set(providerPaymentId, { status: 'PENDING' });
    return { providerPaymentId, status: 'PENDING', qrCodeBase64, copyPaste, expiresAt, metadata: { mock: true } };
  }

  async getPaymentStatus(providerPaymentId) {
    return { status: this.state.get(providerPaymentId)?.status ?? 'PENDING', paidAt: null };
  }

  async releaseFunds({ amountCents, pixKey }) {
    if (!pixKey) throw new Error('pixKey required');
    return { transferId: `mock_tr_${generateToken(8)}`, amountCents };
  }

  async refundPayment(providerPaymentId) {
    this.state.set(providerPaymentId, { status: 'REFUNDED' });
    return { refunded: true };
  }

  sign(rawBody) {
    return hmacHex(this.webhookSecret, rawBody);
  }

  /** Build a signed webhook request for local simulation and tests. */
  buildWebhook(providerPaymentId, status = 'CONFIRMED', eventId = `evt_${generateToken(10)}`) {
    const body = {
      id: eventId,
      type: 'payment.updated',
      data: { paymentId: providerPaymentId, status, paidAt: status === 'CONFIRMED' ? new Date().toISOString() : null },
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
    const { paymentId, status, paidAt } = body.data || {};
    if (!body.id || !paymentId || !status) return [];
    this.state.set(paymentId, { status });
    return [
      {
        providerEventId: body.id,
        providerPaymentId: paymentId,
        type: body.type || 'payment.updated',
        status,
        paidAt: paidAt ? new Date(paidAt) : null,
        payload: { id: body.id, type: body.type, status },
      },
    ];
  }
}
