import { PaymentProvider, NO_CAPABILITIES } from './PaymentProvider.js';
import { unavailable, notFound } from '../errors.js';

export const PAYMENTS_UNAVAILABLE_MESSAGE = 'Pagamentos estão temporariamente indisponíveis. Tente novamente mais tarde.';

const REASON = 'Gateway de pagamento desativado nesta implantação.';

/**
 * DisabledPaymentProvider — used when PAYMENT_PROVIDER=none.
 * The app runs (landing, painel, WhatsApp, agentes), but no charge is ever
 * created, no status is ever claimed and no webhook is accepted. Nothing here
 * simulates a payment: every money operation fails closed with a clear message.
 */
export class DisabledPaymentProvider extends PaymentProvider {
  name = 'none';
  label = 'Gateway de pagamento desativado';
  isSandbox = false;

  getCapabilities() {
    const reasons = Object.fromEntries(Object.keys(NO_CAPABILITIES).map((k) => [k, REASON]));
    return { capabilities: { ...NO_CAPABILITIES }, reasons };
  }

  async createPixCharge() {
    throw unavailable(PAYMENTS_UNAVAILABLE_MESSAGE);
  }

  async getPaymentStatus() {
    throw unavailable(PAYMENTS_UNAVAILABLE_MESSAGE);
  }

  async handleWebhook() {
    throw notFound('Provedor não configurado.');
  }
}
