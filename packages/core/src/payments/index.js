import { getConfig } from '../config.js';
import { MockPaymentProvider } from './MockPaymentProvider.js';
import { MercadoPagoPaymentProvider } from './MercadoPagoPaymentProvider.js';
import { AsaasPaymentProvider } from './AsaasPaymentProvider.js';

export { PaymentProvider, WebhookSignatureError, PaymentProviderError } from './PaymentProvider.js';
export { MockPaymentProvider, MercadoPagoPaymentProvider, AsaasPaymentProvider };

const instances = new Map();

/** Build (and memoize) a provider adapter by name. */
export function getPaymentProvider(name, config = getConfig()) {
  const key = name || config.payment.provider;
  if (instances.has(key)) return instances.get(key);
  let provider;
  switch (key) {
    case 'mock':
      if (config.isProduction) throw new Error('Mock payments are disabled in production');
      provider = new MockPaymentProvider({ webhookSecret: config.payment.webhookSecret, isProduction: config.isProduction });
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
    default:
      throw new Error(`Unknown payment provider: ${key}`);
  }
  instances.set(key, provider);
  return provider;
}

/** Only the configured provider may receive webhooks. */
export function isWebhookProviderAllowed(name, config = getConfig()) {
  return name === config.payment.provider;
}

export function resetPaymentProviders() {
  instances.clear();
}
