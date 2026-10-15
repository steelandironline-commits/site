/*
 * Checks the Banco do Brasil Pix integration against the HOMOLOGATION (sandbox) API.
 *
 * Run from the repo root with the sandbox credentials in a local file that is
 * never committed (.env.sandbox matches .gitignore):
 *
 *   node --env-file=.env.sandbox scripts/bb-sandbox-check.mjs
 *
 * .env.sandbox needs BB_ENVIRONMENT=sandbox and the BB_* credentials
 * (BB_CLIENT_ID, BB_CLIENT_SECRET, BB_DEVELOPER_APPLICATION_KEY, BB_PIX_KEY,
 * BB_WEBHOOK_SECRET). The BB_*_ENABLED flags are for contract features
 * (split, payout, BB Pay, protected payment); they stay false here.
 *
 * It refuses to run unless BB_ENVIRONMENT=sandbox and the API host is the
 * homologation host, so it cannot move real money. It prints statuses and
 * identifiers only, never credentials or tokens.
 */
import { loadConfig } from '../packages/core/src/config.js';
import { getPaymentProvider, resetPaymentProviders } from '../packages/core/src/payments/index.js';

const env = { ...process.env, PAYMENT_PROVIDER: 'banco_do_brasil', NODE_ENV: 'development' };
const config = loadConfig(env);
const bb = config.bb;

if (bb.environment !== 'sandbox' || !/\.hm\.bb\.com\.br|sandbox/i.test(`${bb.apiBaseUrl} ${bb.oauthUrl}`)) {
  console.error('Recusado: este script só roda contra o ambiente de homologação (BB_ENVIRONMENT=sandbox).');
  process.exit(1);
}

resetPaymentProviders();
const provider = getPaymentProvider('banco_do_brasil', config);
const pixReason = provider.getCapabilities().reasons.pix;
if (pixReason) {
  console.error('Pix ainda não pode ser testado:', pixReason);
  process.exit(1);
}
const paymentId = `sandbox-${Date.now()}`;

try {
  console.log('1/2 criando cobrança Pix de R$ 1,00 no sandbox…');
  const charge = await provider.createPixCharge({
    paymentId,
    amountCents: 100,
    description: 'Teste de integração TemPix (sandbox)',
    payer: {},
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });
  console.log('   ok · txid:', charge.txid ?? charge.providerId ?? '(ver resposta)');

  console.log('2/2 consultando a mesma cobrança…');
  const status = await provider.getPaymentStatus(charge.txid ?? charge.providerId);
  console.log('   ok · status:', status.status ?? status);
  console.log('Integração Pix (sandbox) respondeu corretamente.');
} catch (err) {
  // Only the stable error code and message: never the request, headers or tokens.
  console.error('Falhou:', err.code ?? err.name, '-', err.message);
  process.exit(1);
}
