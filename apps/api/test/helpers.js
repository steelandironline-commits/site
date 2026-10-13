import request from 'supertest';
import { loadConfig, setConfig, getPrisma, ensureAgents, resetPaymentProviders, resetAgentCache, resetWhatsAppProvider, EmailService } from '@autopix/core';
import { buildServices, createApp } from '../src/app.js';

export const hasDb = Boolean(process.env.DATABASE_URL);

export const STRONG_PASSWORD = 'autopix-teste-2024';

export function testConfig(overrides = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL,
    APP_URL: 'http://localhost:5173',
    API_URL: 'http://localhost:3000',
    SESSION_SECRET: 'test-session-secret-0123456789abcdef0123456789',
    ACTIVATION_TOKEN_SECRET: 'test-activation-secret-0123456789abcdef012345',
    PASSWORD_RESET_SECRET: 'test-reset-secret-0123456789abcdef0123456789',
    PAYMENT_PROVIDER: 'mock',
    PAYMENT_WEBHOOK_SECRET: 'test-webhook-secret-0123456789abcdef01234567',
    DEMO_MODE: 'true',
    OPPORTUNITY_SCORE_THRESHOLD: '50',
    BILLING_MODEL: 'subscription',
    ...overrides,
  });
}

/** Fresh app wired to the test DB. */
export async function setupApp(overrides = {}) {
  const config = setConfig(testConfig(overrides));
  resetPaymentProviders();
  resetAgentCache();
  resetWhatsAppProvider();
  const prisma = getPrisma();
  await ensureAgents(prisma);
  const email = new EmailService({ config });
  const services = buildServices({ config, prisma, email });
  const hub = { mode: 'test', subscribe: () => () => {} };
  const app = createApp({ services, hub, serveWeb: false });
  app.locals.testEmail = email;
  return { app, config, prisma, services, email };
}

const TABLES = [
  // TemPix Pay (FinancialAuditLog blocks UPDATE/DELETE, not TRUNCATE — test-only reset)
  'SocialComment',
  'SocialPost',
  'FinancialAuditLog',
  'ReconciliationIssue',
  'TripEvent',
  'TransactionDispute',
  'Payout',
  'Refund',
  'PaymentAllocation',
  'TransactionEvent',
  'MarketplaceTransaction',
  'CommissionRule',
  'NotificationDelivery',
  'DomainEvent',
  'ActionLog',
  'SensitiveActionChallenge',
  'WhatsAppPendingCommand',
  'WhatsAppMessage',
  'WhatsAppConnection',
  'NotificationPreference',
  'PushSubscription',
  'FreightMatch',
  'FreightRequest',
  'WorkforceMatch',
  'WorkforceDemand',
  'PaymentEvent',
  'Payment',
  'Subscription',
  'Contact',
  'OpportunitySource',
  'CompanySignal',
  'ActivityEvent',
  'AgentRun',
  'SearchJob',
  'Opportunity',
  'ActivationToken',
  'PasswordResetToken',
  'Session',
  'User',
  'Company',
];

export async function resetDb(prisma) {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`);
}

/** supertest agent with cookie jar + CSRF header helper. */
export function client(app) {
  const agent = request.agent(app);
  const h = (req) => req.set('X-Requested-With', 'autopix');
  return {
    agent,
    get: (url) => agent.get(url),
    post: (url, body) => h(agent.post(url)).send(body ?? {}),
    put: (url, body) => h(agent.put(url)).send(body ?? {}),
    patch: (url, body) => h(agent.patch(url)).send(body ?? {}),
    del: (url) => h(agent.delete(url)),
  };
}

export function activationTokenFromEmail(email) {
  const text = email.outbox.at(-1)?.text || '';
  return /\/activate\/([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? null;
}

let seq = 0;

/** Valid, unique CNPJ / CPF for tests (check digits computed). */
let docSeq = Math.floor(Date.now() / 1000) % 1_000_000;
export function testCnpj() {
  docSeq += 1;
  const base = `${String(docSeq).padStart(8, '0').slice(-8)}0001`;
  const calc = (b) => {
    const w = b.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = [...b].reduce((a, d, i) => a + Number(d) * w[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(base);
  return `${base}${d1}${calc(base + d1)}`;
}
export function testCpf() {
  docSeq += 1;
  const base = `1${String(docSeq).padStart(8, '0').slice(-8)}`;
  const calc = (b) => {
    const sum = [...b].reduce((a, d, i) => a + Number(d) * (b.length + 1 - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = calc(base);
  return `${base}${d1}${calc(base + d1)}`;
}
export const PROFILE = {
  cnpj: '11.222.333/0001-81',
  services: ['Usinagem', 'Caldeiraria', 'Manutenção'],
  products: ['Peças usinadas'],
  idealCustomer: 'Indústrias de médio porte',
  city: 'Joinville',
  state: 'SC',
  serviceLocations: ['Joinville - SC'],
  serviceRadiusKm: 200,
  averageTicket: 18000,
  minimumDeal: 3000,
  preferredIndustries: ['Indústria', 'Metalurgia'],
  excludedIndustries: [],
  keywords: ['manutenção preventiva'],
};

/** Run the onboarding up to a pending Pix charge. */
export async function onboardToCheckout(app, { email, cnpj = testCnpj() } = {}) {
  seq += 1;
  const c = client(app);
  const mail = email || `cliente${seq}-${Date.now()}@empresa.example`;
  const start = await c.post('/api/onboarding/start', { name: 'Ana Souza', email: mail, companyName: `Empresa ${seq}`, document: cnpj });
  if (start.status !== 201) throw new Error(`start failed ${start.status} ${JSON.stringify(start.body)}`);
  const step = await c.put('/api/onboarding/step', { step: 9, data: PROFILE, complete: true });
  if (step.status !== 200) throw new Error(`step failed ${JSON.stringify(step.body)}`);
  const pix = await c.post('/api/payments/pix');
  if (pix.status !== 201) throw new Error(`pix failed ${JSON.stringify(pix.body)}`);
  return { c, email: mail, cnpj, payment: pix.body.payment, companyId: start.body.company.id };
}

/** Full happy path: onboarding → Pix → webhook → activation → password. */
export async function createActiveUser(app) {
  const ctx = await onboardToCheckout(app);
  const sim = await ctx.c.post(`/api/payments/${ctx.payment.id}/simulate`);
  if (sim.status !== 200) throw new Error(`simulate failed ${JSON.stringify(sim.body)}`);
  const claim = await ctx.c.post(`/api/payments/${ctx.payment.id}/activation`);
  if (!claim.body.emailSent) throw new Error(`claim failed ${JSON.stringify(claim.body)}`);
  const token = activationTokenFromEmail(app.locals.testEmail);
  if (!token) throw new Error('activation email did not contain a link');
  const act = await ctx.c.post('/api/auth/activate', { token, password: STRONG_PASSWORD });
  if (act.status !== 200) throw new Error(`activate failed ${JSON.stringify(act.body)}`);
  return { ...ctx, activationToken: token };
}

