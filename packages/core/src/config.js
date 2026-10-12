import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, '../../..');

// Load the repository root .env (npm workspaces run scripts from the
// workspace directory, so the default dotenv lookup would miss it).
// Variables already present in the environment always win.
const envFile = path.join(ROOT_DIR, '.env');
if (process.env.NODE_ENV !== 'test' && fs.existsSync(envFile)) {
  dotenv.config({ path: envFile, quiet: true });
}

const bool = (fallback) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return fallback;
      if (typeof v === 'boolean') return v;
      return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
    });

const optional = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim()));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: optional,
  APP_URL: optional,
  API_URL: optional,
  SESSION_SECRET: optional,
  ACTIVATION_TOKEN_SECRET: optional,
  PASSWORD_RESET_SECRET: optional,
  PAYMENT_PROVIDER: z
    .string()
    .optional()
    .transform((v) => (v || 'mock').toLowerCase().replace(/-/g, '_'))
    // none: no payment gateway — the app runs, every charge fails closed with a clear message.
    .pipe(z.enum(['mock', 'mercadopago', 'asaas', 'banco_do_brasil', 'none'])),
  MOCK_PAYMENT_CAPABILITIES: optional,
  BB_ENVIRONMENT: z
    .string()
    .optional()
    .transform((v) => (v || 'sandbox').toLowerCase())
    .pipe(z.enum(['sandbox', 'production'])),
  BB_CLIENT_ID: optional,
  BB_CLIENT_SECRET: optional,
  BB_DEVELOPER_APPLICATION_KEY: optional,
  BB_PIX_KEY: optional,
  BB_API_BASE_URL: optional,
  BB_OAUTH_URL: optional,
  BB_OAUTH_SCOPES: optional,
  BB_APP_KEY_PARAM: optional,
  BB_WEBHOOK_SECRET: optional,
  // 'worker' processes never receive webhooks → webhook secrets are not required there.
  PROCESS_ROLE: z.enum(['web', 'worker']).default('web'),
  BB_MTLS_CERT_BASE64: optional,
  BB_MTLS_KEY_BASE64: optional,
  BB_PAY_ENABLED: bool(false),
  BB_SPLIT_ENABLED: bool(false),
  BB_PAYOUT_ENABLED: bool(false),
  BB_PROTECTED_PAYMENT_ENABLED: bool(false),
  BB_PIX_EXPIRATION_SECONDS: z.coerce.number().int().min(60).max(86400 * 30).default(3600),
  PAYMENT_ACCESS_TOKEN: optional,
  PAYMENT_WEBHOOK_SECRET: optional,
  PAYMENT_API_URL: optional,
  DEMO_MODE: bool(false),
  PORT: z.coerce.number().int().positive().default(3000),
  EMBEDDED_WORKER: bool(false),
  SEARCH_INTERVAL_MINUTES: z.coerce.number().int().min(5).max(10080).default(60),
  OPPORTUNITY_SCORE_THRESHOLD: z.coerce.number().int().min(0).max(100).default(60),
  SEARCH_PROVIDER: optional,
  SEARCH_API_KEY: optional,
  NEWS_SOURCE_ENABLED: bool(false),
  PUBLIC_BUSINESS_SOURCE_ENABLED: bool(false),
  EMAIL_PROVIDER: z
    .string()
    .optional()
    .transform((v) => (v || 'console').toLowerCase())
    .pipe(z.enum(['console', 'resend'])),
  EMAIL_API_KEY: optional,
  EMAIL_FROM: optional,
  WHATSAPP_PROVIDER: z
    .string()
    .optional()
    .transform((v) => (v || '').toLowerCase() || undefined)
    .pipe(z.enum(['cloud', 'mock', 'disabled']).optional()),
  WHATSAPP_ACCESS_TOKEN: optional,
  WHATSAPP_PHONE_NUMBER_ID: optional,
  WHATSAPP_APP_SECRET: optional,
  WHATSAPP_VERIFY_TOKEN: optional,
  WHATSAPP_BUSINESS_NUMBER: optional,
  WHATSAPP_API_VERSION: optional,
  WHATSAPP_TEMPLATE_OPPORTUNITY: optional,
  WHATSAPP_TEMPLATE_PAYMENT: optional,
  WHATSAPP_TEMPLATE_FREIGHT: optional,
  WHATSAPP_TEMPLATE_WORKFORCE: optional,
  WHATSAPP_TEMPLATE_LANGUAGE: optional,
  WEB_PUSH_PUBLIC_KEY: optional,
  WEB_PUSH_PRIVATE_KEY: optional,
  WEB_PUSH_SUBJECT: optional,
  INTENT_PARSER: z
    .string()
    .optional()
    .transform((v) => (v || 'rules').toLowerCase())
    .pipe(z.enum(['rules', 'llm'])),
});

function ephemeralSecret() {
  return crypto.randomBytes(48).toString('base64url');
}

export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';
  const errors = [];

  const secret = (name) => {
    const value = e[name];
    if (value) {
      if (isProduction && value.length < 32) errors.push(`${name} must be at least 32 characters`);
      return value;
    }
    if (isProduction) errors.push(`${name} is required in production`);
    return ephemeralSecret();
  };

  const cfg = {
    env: e.NODE_ENV,
    isProduction,
    isTest: e.NODE_ENV === 'test',
    databaseUrl: e.DATABASE_URL,
    appUrl: (e.APP_URL || `http://localhost:${isProduction ? e.PORT : 5173}`).replace(/\/$/, ''),
    apiUrl: (e.API_URL || e.APP_URL || `http://localhost:${e.PORT}`).replace(/\/$/, ''),
    port: e.PORT,
    secrets: {
      session: secret('SESSION_SECRET'),
      activation: secret('ACTIVATION_TOKEN_SECRET'),
      passwordReset: secret('PASSWORD_RESET_SECRET'),
    },
    payment: {
      provider: e.PAYMENT_PROVIDER,
      accessToken: e.PAYMENT_ACCESS_TOKEN,
      webhookSecret: e.PAYMENT_WEBHOOK_SECRET || (isProduction ? undefined : ephemeralSecret()),
      apiUrl: e.PAYMENT_API_URL,
    },
    demoMode: e.DEMO_MODE,
    mockCapabilities: (e.MOCK_PAYMENT_CAPABILITIES || '').split(',').map((s) => s.trim()).filter(Boolean),
    bb: (() => {
      const sandbox = e.BB_ENVIRONMENT !== 'production';
      return {
        environment: e.BB_ENVIRONMENT,
        clientId: e.BB_CLIENT_ID,
        clientSecret: e.BB_CLIENT_SECRET,
        appKey: e.BB_DEVELOPER_APPLICATION_KEY,
        pixKey: e.BB_PIX_KEY,
        // Defaults follow BB's public developer documentation; override when your app differs.
        apiBaseUrl: (e.BB_API_BASE_URL || (sandbox ? 'https://api.hm.bb.com.br/pix/v2' : 'https://api-pix.bb.com.br/pix/v2')).replace(/\/$/, ''),
        oauthUrl: e.BB_OAUTH_URL || (sandbox ? 'https://oauth.sandbox.bb.com.br/oauth/token' : 'https://oauth.bb.com.br/oauth/token'),
        scopes: e.BB_OAUTH_SCOPES || 'cob.read cob.write pix.read pix.write',
        appKeyParam: e.BB_APP_KEY_PARAM || (sandbox ? 'gw-dev-app-key' : 'gw-app-key'),
        webhookSecret: e.BB_WEBHOOK_SECRET,
        mtls: e.BB_MTLS_CERT_BASE64 && e.BB_MTLS_KEY_BASE64 ? { certBase64: e.BB_MTLS_CERT_BASE64, keyBase64: e.BB_MTLS_KEY_BASE64 } : null,
        flags: {
          bbPay: e.BB_PAY_ENABLED,
          split: e.BB_SPLIT_ENABLED,
          payout: e.BB_PAYOUT_ENABLED,
          protectedFlow: e.BB_PROTECTED_PAYMENT_ENABLED,
        },
        pixExpirationSeconds: e.BB_PIX_EXPIRATION_SECONDS,
      };
    })(),
    embeddedWorker: e.EMBEDDED_WORKER,
    search: {
      intervalMinutes: e.SEARCH_INTERVAL_MINUTES,
      scoreThreshold: e.OPPORTUNITY_SCORE_THRESHOLD,
      provider: e.SEARCH_PROVIDER,
      apiKey: e.SEARCH_API_KEY,
      newsEnabled: e.NEWS_SOURCE_ENABLED,
      publicBusinessEnabled: e.PUBLIC_BUSINESS_SOURCE_ENABLED,
    },
    email: {
      provider: e.EMAIL_PROVIDER,
      apiKey: e.EMAIL_API_KEY,
      from: e.EMAIL_FROM || 'AutoPix <nao-responda@autopix.com.br>',
    },
    whatsapp: (() => {
      const cloudReady = Boolean(e.WHATSAPP_ACCESS_TOKEN && e.WHATSAPP_PHONE_NUMBER_ID && e.WHATSAPP_APP_SECRET);
      // Default: real Cloud API when credentials exist, mock in dev/test, disabled in production.
      let provider = e.WHATSAPP_PROVIDER || (cloudReady ? 'cloud' : isProduction ? 'disabled' : 'mock');
      if (provider === 'mock' && isProduction) provider = 'disabled';
      if (provider === 'cloud' && !cloudReady) provider = 'disabled';
      return {
        provider,
        accessToken: e.WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: e.WHATSAPP_PHONE_NUMBER_ID,
        appSecret: e.WHATSAPP_APP_SECRET,
        verifyToken: e.WHATSAPP_VERIFY_TOKEN,
        businessNumber: e.WHATSAPP_BUSINESS_NUMBER ? e.WHATSAPP_BUSINESS_NUMBER.replace(/\D/g, '') : null,
        apiVersion: e.WHATSAPP_API_VERSION || 'v21.0',
        templates: {
          opportunity: e.WHATSAPP_TEMPLATE_OPPORTUNITY,
          payment: e.WHATSAPP_TEMPLATE_PAYMENT,
          freight: e.WHATSAPP_TEMPLATE_FREIGHT,
          workforce: e.WHATSAPP_TEMPLATE_WORKFORCE,
          language: e.WHATSAPP_TEMPLATE_LANGUAGE || 'pt_BR',
        },
      };
    })(),
    push: {
      publicKey: e.WEB_PUSH_PUBLIC_KEY,
      privateKey: e.WEB_PUSH_PRIVATE_KEY,
      subject: e.WEB_PUSH_SUBJECT || 'mailto:suporte@autopix.com.br',
      enabled: Boolean(e.WEB_PUSH_PUBLIC_KEY && e.WEB_PUSH_PRIVATE_KEY),
    },
    intentParser: e.INTENT_PARSER,
    session: {
      cookieName: 'ap_session',
      ttlMs: 1000 * 60 * 60 * 24 * 7,
      onboardingTtlMs: 1000 * 60 * 60 * 24 * 14,
    },
    processRole: e.PROCESS_ROLE,
    tokens: {
      activationTtlMs: 1000 * 60 * 60 * 48,
      passwordResetTtlMs: 1000 * 60 * 60,
    },
  };

  if (isProduction) {
    if (!cfg.databaseUrl) errors.push('DATABASE_URL is required in production');
    if (cfg.payment.provider === 'mock') {
      errors.push('PAYMENT_PROVIDER=mock is not allowed in production (payments must never be simulated)');
    }
    if (cfg.payment.provider === 'banco_do_brasil') {
      const bb = cfg.bb;
      const isWorker = e.PROCESS_ROLE === 'worker';
      for (const [k, v] of Object.entries({ BB_CLIENT_ID: bb.clientId, BB_CLIENT_SECRET: bb.clientSecret, BB_DEVELOPER_APPLICATION_KEY: bb.appKey, BB_PIX_KEY: bb.pixKey, ...(isWorker ? {} : { BB_WEBHOOK_SECRET: bb.webhookSecret }) })) {
        if (!v) errors.push(`${k} is required when PAYMENT_PROVIDER=banco_do_brasil`);
      }
      if (bb.webhookSecret && bb.webhookSecret.length < 32) errors.push('BB_WEBHOOK_SECRET must be at least 32 characters');
      const looksSandbox = bb.environment === 'sandbox' || /sandbox|\.hm\.bb|homolog/i.test(`${bb.apiBaseUrl} ${bb.oauthUrl}`);
      // A production deployment must not silently run on homologation money,
      // except an explicit DEMO deployment where every payment is labelled SANDBOX.
      if (looksSandbox && !e.DEMO_MODE) errors.push('Banco do Brasil sandbox configuration refused in production (set BB_ENVIRONMENT=production, or DEMO_MODE=true for a labelled demo)');
      if (!looksSandbox && bb.environment === 'production' && /sandbox|\.hm\./i.test(bb.apiBaseUrl)) errors.push('BB_API_BASE_URL points to a sandbox host');
    } else if (cfg.payment.provider !== 'none') {
      if (!cfg.payment.accessToken) errors.push('PAYMENT_ACCESS_TOKEN is required in production');
      if (!cfg.payment.webhookSecret && e.PROCESS_ROLE !== 'worker') errors.push('PAYMENT_WEBHOOK_SECRET is required in production');
    }
    if (!e.APP_URL) errors.push('APP_URL is required in production');
  }
  if (errors.length) {
    throw new Error(`Invalid environment configuration:\n - ${errors.join('\n - ')}`);
  }
  return Object.freeze(cfg);
}

let current;
export function getConfig() {
  if (!current) current = loadConfig();
  return current;
}

/** Test helper: replace the active configuration. */
export function setConfig(cfg) {
  current = cfg;
  return current;
}
