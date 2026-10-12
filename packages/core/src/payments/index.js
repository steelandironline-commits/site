import { getConfig } from '../config.js';
import { MockPaymentProvider } from './MockPaymentProvider.js';
import { MercadoPagoPaymentProvider } from './MercadoPagoPaymentProvider.js';
import { AsaasPaymentProvider } from './AsaasPaymentProvider.js';
import { BancoDoBrasilPaymentProvider } from './providers/banco-do-brasil.provider.js';

export { PaymentProvider, WebhookSignatureError, PaymentProviderError } from './PaymentProvider.js';
export { MockPaymentProvider, MercadoPagoPaymentProvider, AsaasPaymentProvider, BancoDoBrasilPaymentProvider };
export { NO_CAPABILITIES } from './PaymentProvider.js';
export { FinancialError, FINANCIAL_ERRORS, withRetry, capabilityError } from './errors.js';
export { BancoDoBrasilAuthService } from './providers/banco-do-brasil.auth.js';
export { txidFor, refundIdFor } from './providers/banco-do-brasil.provider.js';

const instances = new Map();

/** Build (and memoize) a provider adapter by name. */
export function getPaymentProvider(name, config = getConfig()) {
  const key = normalizeProviderName(name || config.payment.provider);
  if (instances.has(key)) return instances.get(key);
  let provider;
  switch (key) {
    case 'mock':
      if (config.isProduction) throw new Error('Mock payments are disabled in production');
      provider = new MockPaymentProvider({ webhookSecret: config.payment.webhookSecret, isProduction: config.isProduction, capabilities: config.mockCapabilities });
      break;
    case 'mercadopago':
      provider = new MercadoPagoPaymentProvider({
        accessToken: config.payment.accessToken,
        webhookSecret: config.payment.webhookSecret,
        apiUrl: config.payment.apiUrl,
        notificationUrl: `${config.apiUrl}/api/webhooks/payment/mercadopago`,
      });
      break;
    case 'asaas':
      provider = new AsaasPaymentProvider({
        accessToken: config.payment.accessToken,
        webhookSecret: config.payment.webhookSecret,
        apiUrl: config.payment.apiUrl,
      });
      break;
    case 'banco_do_brasil':
      provider = new BancoDoBrasilPaymentProvider({ bb: config.bb });
      break;
    default:
      throw new Error(`Unknown payment provider: ${key}`);
  }
  instances.set(key, provider);
  return provider;
}

/** Only the configured provider may receive webhooks. */
export function normalizeProviderName(name) {
  return String(name || '').toLowerCase().replace(/-/g, '_');
}

export function isWebhookProviderAllowed(name, config = getConfig()) {
  return normalizeProviderName(name) === config.payment.provider;
}

export function resetPaymentProviders() {
  instances.clear();
}
