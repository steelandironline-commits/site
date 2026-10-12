import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
import { getPaymentProvider, resetPaymentProviders, DisabledPaymentProvider } from '../src/payments/index.js';
import { PAYMENTS_UNAVAILABLE_MESSAGE } from '../src/payments/DisabledPaymentProvider.js';

const prodBase = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://x@localhost/x',
  APP_URL: 'https://app.autopix.example',
  API_URL: 'https://app.autopix.example',
  SESSION_SECRET: 's'.repeat(48),
  ACTIVATION_TOKEN_SECRET: 'a'.repeat(48),
  PASSWORD_RESET_SECRET: 'r'.repeat(48),
  EMAIL_PROVIDER: 'console',
};

describe('gateway disabled (PAYMENT_PROVIDER=none)', () => {
  it('production boots without any payment credential, for web and worker', () => {
    expect(() => loadConfig({ ...prodBase, PAYMENT_PROVIDER: 'none' })).not.toThrow();
    expect(() => loadConfig({ ...prodBase, PAYMENT_PROVIDER: 'none', PROCESS_ROLE: 'worker' })).not.toThrow();
  });

  it('production still refuses mock and a real gateway without its credential', () => {
    expect(() => loadConfig({ ...prodBase, PAYMENT_PROVIDER: 'mock' })).toThrow(/mock/);
    expect(() => loadConfig({ ...prodBase, PAYMENT_PROVIDER: 'mercadopago' })).toThrow(/PAYMENT_ACCESS_TOKEN/);
  });

  it('reports every capability as unavailable, with a reason', () => {
    const p = getPaymentProvider('none', loadConfig({ ...prodBase, PAYMENT_PROVIDER: 'none' }));
    expect(p).toBeInstanceOf(DisabledPaymentProvider);
    const { capabilities, reasons } = p.getCapabilities();
    expect(Object.values(capabilities).every((v) => v === false)).toBe(true);
    expect(reasons.pix).toMatch(/desativado/);
    resetPaymentProviders();
  });

  it('fails closed: no charge, no status, no webhook', async () => {
    const p = new DisabledPaymentProvider();
    await expect(p.createPixCharge({ paymentId: 'p', amountCents: 100 })).rejects.toMatchObject({ status: 503, message: PAYMENTS_UNAVAILABLE_MESSAGE });
    await expect(p.getPaymentStatus('x')).rejects.toMatchObject({ status: 503 });
    await expect(p.handleWebhook({ headers: {}, body: {} })).rejects.toMatchObject({ status: 404 });
  });
});
