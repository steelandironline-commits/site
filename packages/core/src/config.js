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
    .transform((v) => (v || 'mock').toLowerCase())
    .pipe(z.enum(['mock', 'mercadopago', 'asaas'])),
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
    session: {
      cookieName: 'ap_session',
      ttlMs: 1000 * 60 * 60 * 24 * 7,
      onboardingTtlMs: 1000 * 60 * 60 * 24 * 14,
    },
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
    if (!cfg.payment.accessToken) errors.push('PAYMENT_ACCESS_TOKEN is required in production');
    if (!cfg.payment.webhookSecret) errors.push('PAYMENT_WEBHOOK_SECRET is required in production');
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
