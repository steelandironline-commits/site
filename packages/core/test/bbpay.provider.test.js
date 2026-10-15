import { describe, it, expect } from 'vitest';
import { BbPayPaymentProvider } from '../src/payments/providers/bb-pay.provider.js';
import { FinancialError } from '../src/payments/errors.js';
import { loadConfig } from '../src/config.js';

const SECRET = 'bbpay-webhook-secret-0123456789abcdef0123';
const provider = () => new BbPayPaymentProvider({ bbPay: { environment: 'production', convenio: '421378', webhookSecret: SECRET } });

/** Sample payload from the BB developer portal ("PAGAMENTO BB PAY"). */
const sample = (over = {}) => ({
  codigoEvento: 1,
  dadosEvento: {
    numeroConvenio: 421378,
    numeroSolicitacao: 56789,
    numeroPagamento: 123456,
    codigoEstadoPagamento: 200,
    timestampPagamento: '2022-02-23T13:02:55.00000',
    valorOriginal: 100.2,
    valorLiquidoRecebedor: 100.2,
    codigoTipoPagamento: 'PIX',
    dataRepasse: '2022-02-25',
    numeroDocumentoPagador: 5544562701,
    nomePagador: 'NOME DO PAGADOR',
    e2eId: 'E00000000202110222016549061422',
  },
  ...over,
});

describe('BB Pay webhook', () => {
  it('turns a paid event into a confirmation of our request, with the amount in cents and no payer data', async () => {
    const [ev] = await provider().handleWebhook({ query: { token: SECRET }, body: sample() });
    expect(ev).toMatchObject({ providerPaymentId: '56789', status: 'CONFIRMED', amountCents: 10020, providerEventId: 'bbpay:56789:123456:1' });
    expect(ev.paidAt.toISOString()).toBe('2022-02-23T16:02:55.000Z');
    expect(JSON.stringify(ev.payload)).not.toMatch(/NOME DO PAGADOR|5544562701/);
  });

  it('maps returned, unauthorized and contested events', async () => {
    const status = async (c) => (await provider().handleWebhook({ query: { token: SECRET }, body: sample({ codigoEvento: c }) }))[0].status;
    expect(await status(2)).toBe('REFUNDED');
    expect(await status(3)).toBe('FAILED');
    expect(await status(4)).toBe('CONTESTED');
  });

  it('refuses a wrong token, another convênio and malformed bodies', async () => {
    await expect(provider().handleWebhook({ query: { token: 'x' }, body: sample() })).rejects.toBeInstanceOf(FinancialError);
    await expect(provider().handleWebhook({ query: {}, body: sample() })).rejects.toBeInstanceOf(FinancialError);
    const other = sample();
    other.dadosEvento.numeroConvenio = 999999;
    await expect(provider().handleWebhook({ query: { token: SECRET }, body: other })).rejects.toThrow();
    await expect(provider().handleWebhook({ query: { token: SECRET }, body: { codigoEvento: 9, dadosEvento: {} } })).rejects.toThrow();
  });

  it('never claims it can create a Pix before the request API is implemented', async () => {
    const p = provider();
    expect(p.has('pix')).toBe(false);
    expect(p.has('pixWebhook')).toBe(true);
    await expect(p.createPixCharge({})).rejects.toThrow();
  });

  it('requires the secret and the convênio in production', () => {
    const base = { NODE_ENV: 'production', DATABASE_URL: 'postgres://x', APP_URL: 'https://x', SESSION_SECRET: 's'.repeat(40), ACTIVATION_TOKEN_SECRET: 'a'.repeat(40), PASSWORD_RESET_SECRET: 'p'.repeat(40), PAYMENT_PROVIDER: 'bb_pay' };
    expect(() => loadConfig(base)).toThrow(/BB_PAY_CONVENIO/);
    expect(() => loadConfig({ ...base, BB_WEBHOOK_SECRET: SECRET, BB_PAY_CONVENIO: '421.378' })).not.toThrow();
    expect(loadConfig({ ...base, BB_WEBHOOK_SECRET: SECRET, BB_PAY_CONVENIO: '421.378' }).bbPay.convenio).toBe('421378');
  });
});
