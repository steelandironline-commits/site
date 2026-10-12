import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { MercadoPagoPaymentProvider } from '../src/payments/MercadoPagoPaymentProvider.js';
import { AsaasPaymentProvider } from '../src/payments/AsaasPaymentProvider.js';
import { MockPaymentProvider } from '../src/payments/MockPaymentProvider.js';
import { WebhookSignatureError } from '../src/payments/PaymentProvider.js';
import { buildBrCode, crc16 } from '../src/payments/brcode.js';
import { loadConfig } from '../src/config.js';
import { generateToken, hashToken } from '../src/security/tokens.js';

const jsonResponse = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });

describe('BR Code', () => {
  it('produces a payload with a valid CRC16', () => {
    const code = buildBrCode({ key: 'chave', amount: 597, merchantName: 'TemPix', merchantCity: 'São Paulo', txid: 'abc123' });
    expect(code.startsWith('000201')).toBe(true);
    expect(code).toContain('5406597.00');
    expect(crc16(code.slice(0, -4))).toBe(code.slice(-4));
  });
});

describe('MockPaymentProvider', () => {
  it('verifies HMAC signatures', async () => {
    const p = new MockPaymentProvider({ webhookSecret: 's'.repeat(40) });
    const wh = p.buildWebhook('mock_1', 'CONFIRMED', 'evt_1');
    const [event] = await p.handleWebhook(wh);
    expect(event).toMatchObject({ providerEventId: 'evt_1', providerPaymentId: 'mock_1', status: 'CONFIRMED' });
    await expect(p.handleWebhook({ ...wh, headers: { 'x-autopix-signature': 'bad' } })).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it('cannot simulate in production', () => {
    expect(new MockPaymentProvider({ webhookSecret: 'x', isProduction: true }).supportsSimulation).toBe(false);
  });
});

describe('MercadoPagoPaymentProvider', () => {
  const secret = 'mp-secret';
  const sign = (dataId, requestId, ts) =>
    crypto.createHmac('sha256', secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');

  it('creates a Pix charge with an idempotency key', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ id: 123, status: 'pending', point_of_interaction: { transaction_data: { qr_code: '000201...', qr_code_base64: 'iVBOR' } } }),
    );
    const p = new MercadoPagoPaymentProvider({ accessToken: 'tok', webhookSecret: secret, fetchImpl, notificationUrl: 'https://api/x' });
    const r = await p.createPixCharge({
      paymentId: 'pay_1',
      amountCents: 59700,
      description: 'TemPix',
      payer: { name: 'Ana Souza', email: 'ana@empresa.example' },
      idempotencyKey: 'idem-1',
      expiresAt: new Date(Date.now() + 1800_000),
    });
    expect(r).toMatchObject({ providerPaymentId: '123', status: 'PENDING', copyPaste: '000201...' });
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers['X-Idempotency-Key']).toBe('idem-1');
    expect(JSON.parse(init.body)).toMatchObject({ transaction_amount: 597, payment_method_id: 'pix', external_reference: 'pay_1' });
  });

  it('validates x-signature and re-fetches the authoritative status', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: 'approved', date_approved: '2026-01-01T10:00:00Z' }));
    const p = new MercadoPagoPaymentProvider({ accessToken: 'tok', webhookSecret: secret, fetchImpl });
    const ts = String(Date.now());
    const headers = { 'x-signature': `ts=${ts},v1=${sign('123', 'req-1', ts)}`, 'x-request-id': 'req-1' };
    const [event] = await p.handleWebhook({ headers, query: { 'data.id': '123', type: 'payment' }, body: { type: 'payment', data: { id: '123' } } });
    expect(event).toMatchObject({ providerPaymentId: '123', status: 'CONFIRMED', providerEventId: 'payment:123:CONFIRMED' });

    await expect(
      p.handleWebhook({ headers: { ...headers, 'x-signature': `ts=${ts},v1=${'0'.repeat(64)}` }, query: { 'data.id': '123' }, body: { type: 'payment' } }),
    ).rejects.toBeInstanceOf(WebhookSignatureError);
  });
});

describe('AsaasPaymentProvider', () => {
  it('checks the webhook access token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: 'RECEIVED', paymentDate: '2026-01-01' }));
    const p = new AsaasPaymentProvider({ accessToken: 'tok', webhookSecret: 'wh-token', fetchImpl });
    const body = { id: 'evt_9', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_9' } };
    const [event] = await p.handleWebhook({ headers: { 'asaas-access-token': 'wh-token' }, body });
    expect(event).toMatchObject({ providerEventId: 'evt_9', providerPaymentId: 'pay_9', status: 'CONFIRMED' });
    await expect(p.handleWebhook({ headers: { 'asaas-access-token': 'nope' }, body })).rejects.toBeInstanceOf(WebhookSignatureError);
  });
});

describe('config', () => {
  it('requires strong secrets and a real payment provider in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/SESSION_SECRET is required/);
    const ok = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://x/y',
      APP_URL: 'https://autopix.example',
      SESSION_SECRET: 'a'.repeat(40),
      ACTIVATION_TOKEN_SECRET: 'b'.repeat(40),
      PASSWORD_RESET_SECRET: 'c'.repeat(40),
      PAYMENT_PROVIDER: 'mercadopago',
      PAYMENT_ACCESS_TOKEN: 'tok',
      PAYMENT_WEBHOOK_SECRET: 'd'.repeat(40),
      DEMO_MODE: 'false',
    });
    expect(ok.isProduction).toBe(true);
    expect(ok.demoMode).toBe(false);
  });
});

describe('tokens', () => {
  it('generates 256-bit tokens and keyed hashes', () => {
    const t = generateToken();
    expect(Buffer.from(t, 'base64url')).toHaveLength(32);
    expect(hashToken(t, 'k1')).not.toBe(hashToken(t, 'k2'));
    expect(hashToken(t, 'k1')).toHaveLength(64);
  });
});
