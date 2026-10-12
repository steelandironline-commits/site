// Register the TemPix Pix webhook for the configured BB Pix key (run once per environment).
//
//   PAYMENT_PROVIDER=banco_do_brasil BB_*=… node scripts/bb-register-webhook.js
//
// Registers  <API_URL>/api/webhooks/payment/banco-do-brasil?token=<BB_WEBHOOK_SECRET>
// BB appends "/pix" when notifying; that path is served too. The token is a
// shared secret printed only in redacted form. The handler re-fetches every
// charge from the BB API before changing state, so a forged call cannot
// confirm a payment.
import { getConfig, getPaymentProvider } from '@autopix/core';

const config = getConfig();
if (config.payment.provider !== 'banco_do_brasil') {
  console.error('PAYMENT_PROVIDER must be banco_do_brasil.');
  process.exit(1);
}
if (!config.bb.webhookSecret || config.bb.webhookSecret.length < 32) {
  console.error('BB_WEBHOOK_SECRET (>= 32 characters) is required.');
  process.exit(1);
}
const base = String(config.apiUrl || '').replace(/\/$/, '');
if (!/^https:\/\//.test(base) && config.bb.environment === 'production') {
  console.error('API_URL must be https in production.');
  process.exit(1);
}
const url = `${base}/api/webhooks/payment/banco-do-brasil?token=${encodeURIComponent(config.bb.webhookSecret)}`;
const provider = getPaymentProvider('banco_do_brasil', config);
try {
  await provider.registerWebhook(url);
  console.log(`Webhook registered (${config.bb.environment}): ${base}/api/webhooks/payment/banco-do-brasil?token=[redacted]`);
} catch (err) {
  console.error(`Registration failed: ${err.code || err.name}`);
  process.exit(1);
}
