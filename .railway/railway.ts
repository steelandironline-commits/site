// AutoPix — Railway Infrastructure as Code.
// Plan:  npx railway config plan    (requires the Railway CLI + `npm i -D railway`)
// Apply: npx railway config apply
//
// Three resources: PostgreSQL, the web/API service (serves the SPA + REST +
// SSE and runs migrations before each deploy) and the background worker.
import { defineRailway, github, group, postgres, preserve, project, service } from 'railway/iac';

export default defineRailway((ctx) => {
  const prod = ctx.environment === 'production';
  const repo = github('steelandironline-commits/site');

  const db = postgres('postgres');

  const shared = {
    NODE_ENV: 'production',
    DATABASE_URL: db.env.DATABASE_URL,
    // Secrets are set once in the Railway dashboard and kept as-is here.
    SESSION_SECRET: preserve(),
    ACTIVATION_TOKEN_SECRET: preserve(),
    PASSWORD_RESET_SECRET: preserve(),
    PAYMENT_PROVIDER: preserve(),
    PAYMENT_ACCESS_TOKEN: preserve(),
    APP_URL: preserve(),
    API_URL: preserve(),
    DEMO_MODE: prod ? 'false' : 'true',
    // WhatsApp Business Platform (Cloud API) + Web Push — optional.
    WHATSAPP_ACCESS_TOKEN: preserve(),
    WHATSAPP_PHONE_NUMBER_ID: preserve(),
    WHATSAPP_APP_SECRET: preserve(),
    WHATSAPP_VERIFY_TOKEN: preserve(),
    WHATSAPP_BUSINESS_NUMBER: preserve(),
    WEB_PUSH_PUBLIC_KEY: preserve(),
    WEB_PUSH_PRIVATE_KEY: preserve(),
    WEB_PUSH_SUBJECT: preserve(),
  };

  // Banco do Brasil: API credentials (status reads, charges, refunds).
  const bb = {
    BB_ENVIRONMENT: prod ? 'production' : 'sandbox',
    BB_CLIENT_ID: preserve(),
    BB_CLIENT_SECRET: preserve(),
    BB_DEVELOPER_APPLICATION_KEY: preserve(),
    BB_PIX_KEY: preserve(),
    BB_API_BASE_URL: preserve(),
    BB_OAUTH_URL: preserve(),
    BB_MTLS_CERT_BASE64: preserve(),
    BB_MTLS_KEY_BASE64: preserve(),
    BB_PAY_ENABLED: preserve(),
    BB_SPLIT_ENABLED: preserve(),
    BB_PAYOUT_ENABLED: preserve(),
    BB_PROTECTED_PAYMENT_ENABLED: preserve(),
  };
  // Webhook secrets: only the web service receives webhooks.
  const webhookSecrets = { PAYMENT_WEBHOOK_SECRET: preserve(), BB_WEBHOOK_SECRET: preserve() };

  const web = service('autopix-web', {
    source: repo,
    build: 'npm run build',
    start: 'npm run start',
    preDeploy: 'npm run db:migrate',
    healthcheck: '/api/health',
    healthcheckTimeout: 60,
    env: { ...shared, ...bb, ...webhookSecrets, PROCESS_ROLE: 'web', EMAIL_PROVIDER: preserve(), EMAIL_API_KEY: preserve(), EMAIL_FROM: preserve() },
  });

  const worker = service('autopix-worker', {
    source: repo,
    build: 'npm run build',
    start: 'npm run start:worker',
    // Reconciliation needs BB read/refund access; it never gets webhook secrets.
    env: {
      ...shared,
      ...bb,
      PROCESS_ROLE: 'worker',
      SEARCH_PROVIDER: preserve(),
      SEARCH_API_KEY: preserve(),
      NEWS_SOURCE_ENABLED: preserve(),
      PUBLIC_BUSINESS_SOURCE_ENABLED: preserve(),
    },
  });

  return project('autopix', {
    resources: [group('AutoPix', [db, web, worker])],
  });
});
