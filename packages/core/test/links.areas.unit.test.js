import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig } from '../src/config.js';
import { NotificationRouter } from '../src/notifications/NotificationRouter.js';
import { WhatsAppMessenger, WhatsAppNotifier } from '../src/whatsapp/WhatsAppMessenger.js';
import { getWhatsAppProvider, resetWhatsAppProvider } from '../src/whatsapp/index.js';

// 4b · links por área. NotificationRouter (e-mail e WhatsApp) e WhatsAppProvider montam o link no host
// da área do DESTINATÁRIO no modo de áreas; no modo legado usam APP_URL, como sempre. Sem banco: o
// prisma é de mentira e o provedor de WhatsApp é o de teste.

const BASE = { NODE_ENV: 'test', APP_URL: 'http://localhost:5173', EMAIL_PROVIDER: 'resend', EMAIL_API_KEY: 'k' };
const legacy = loadConfig(BASE);
const areas = loadConfig({ ...BASE, PUBLIC_HOST_CNPJ: 'temcnpj.com.br', PUBLIC_HOST_CPF: 'cpf.temcnpj.com.br' });
const withAdminHost = loadConfig({ ...BASE, PUBLIC_HOST_CNPJ: 'temcnpj.com.br', PUBLIC_HOST_CPF: 'cpf.temcnpj.com.br', ADMIN_HOST: 'admin.temcnpj.com.br' });

const connection = (id) => ({ id: `conn-${id}`, userId: id, status: 'VERIFIED', phoneNumber: `551199000000${id.length}` });
const user = (id, accountType, extra = {}) => ({
  id,
  email: `${id}@exemplo.test`,
  status: 'ACTIVE',
  isPlatformAdmin: false,
  company: { accountType },
  whatsappConnection: connection(id),
  ...extra,
});

const OPPORTUNITY = {
  id: 'o1', targetCompanyName: 'Alvo', score: 90, signal: 'expansão', priority: 'MEDIUM', city: 'Campinas', state: 'SP',
  estimatedMinValue: 1000, estimatedMaxValue: 5000, isDemo: false,
};
const OPPORTUNITY_EVENT = { id: 'ev1', type: 'OPPORTUNITY_CREATED', companyId: 'c1', aggregateType: 'opportunity', aggregateId: 'o1', payload: {} };
const TRANSACTION_EVENT = { id: 'ev2', type: 'PAYMENT_RECEIVED', companyId: 'c1', aggregateType: 'transaction', aggregateId: 't1', payload: { amountCents: 1000, link: '/app/pay/transactions/t1' } };

/** Um roteador real ligado a um prisma de mentira, ao provedor de teste e a um e-mail que anota o que envia. */
function harness(config, users) {
  resetWhatsAppProvider();
  const provider = getWhatsAppProvider(config);
  const prisma = {
    user: { findMany: async () => users },
    opportunity: { findUnique: async () => OPPORTUNITY },
    marketplaceTransaction: { findUnique: async () => ({ id: 't1', isSandbox: false, isDemo: false }) },
    notificationDelivery: { createMany: async () => ({ count: 1 }), update: async () => ({}) },
    whatsAppMessage: { create: async () => ({ id: 'm' }), update: async () => ({}) },
  };
  const emails = [];
  const router = new NotificationRouter({
    prisma,
    config,
    preferences: { isEnabled: async () => true },
    whatsapp: new WhatsAppNotifier({ messenger: new WhatsAppMessenger({ prisma, provider }) }),
    email: { send: async (mail) => { emails.push(mail); return true; } },
    push: null,
  });
  /** Texto de cada mensagem de WhatsApp enviada ao número de `id`. */
  const whatsappTo = (id) =>
    provider.sent
      .filter((m) => m.to === connection(id).phoneNumber)
      .map((m) => m.text?.body ?? m.interactive?.body?.text ?? '')
      .join('\n');
  return { router, provider, emails, whatsappTo };
}

beforeEach(() => resetWhatsAppProvider());

describe('links por área · modo de áreas', () => {
  const people = [user('empresa', 'COMPANY'), user('pessoa', 'PERSON')];

  it('a notificação de oportunidade vai para o host da área do destinatário, no WhatsApp e no e-mail', async () => {
    const h = harness(areas, people);
    await h.router.handle(OPPORTUNITY_EVENT);
    const forCompany = h.whatsappTo('empresa');
    const forPerson = h.whatsappTo('pessoa');
    expect(forCompany).toContain('http://temcnpj.com.br/app/opportunities/o1');
    expect(forCompany).not.toContain('cpf.temcnpj.com.br');
    expect(forPerson).toContain('http://cpf.temcnpj.com.br/app/opportunities/o1');
    expect(forPerson).not.toMatch(/\/\/temcnpj\.com\.br/);
    const mail = Object.fromEntries(h.emails.map((m) => [m.to, m.text]));
    expect(mail['empresa@exemplo.test']).toContain('http://temcnpj.com.br/app/opportunities/o1');
    expect(mail['pessoa@exemplo.test']).toContain('http://cpf.temcnpj.com.br/app/opportunities/o1');
    // Nenhum dos dois cai no APP_URL de antes.
    for (const text of [forCompany, forPerson, ...Object.values(mail)]) expect(text).not.toContain('localhost:5173');
  });

  it('as mensagens só de texto (transação) também usam o host da área', async () => {
    const h = harness(areas, people);
    await h.router.handle(TRANSACTION_EVENT);
    expect(h.whatsappTo('empresa')).toContain('http://temcnpj.com.br/app/pay/transactions/t1');
    expect(h.whatsappTo('pessoa')).toContain('http://cpf.temcnpj.com.br/app/pay/transactions/t1');
  });

  it('o administrador da plataforma, sem ADMIN_HOST, recebe o link no host CNPJ; com ADMIN_HOST, no de admin', async () => {
    const admin = [user('admin', 'PERSON', { isPlatformAdmin: true })];
    const without = harness(areas, admin);
    await without.router.handle(OPPORTUNITY_EVENT);
    expect(without.whatsappTo('admin')).toContain('http://temcnpj.com.br/app/opportunities/o1');
    const withHost = harness(withAdminHost, admin);
    await withHost.router.handle(OPPORTUNITY_EVENT);
    expect(withHost.whatsappTo('admin')).toContain('http://admin.temcnpj.com.br/app/opportunities/o1');
  });

  it('usa https fora do desenvolvimento', async () => {
    const prod = loadConfig({
      ...BASE,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/x',
      APP_URL: 'https://tempix.up.railway.app',
      PAYMENT_PROVIDER: 'none',
      SESSION_SECRET: 'p'.repeat(40),
      ACTIVATION_TOKEN_SECRET: 'q'.repeat(40),
      PASSWORD_RESET_SECRET: 'r'.repeat(40),
      PUBLIC_HOST_CNPJ: 'temcnpj.com.br',
      PUBLIC_HOST_CPF: 'cpf.temcnpj.com.br',
    });
    const h = harness(prod, [user('pessoa', 'PERSON')]);
    // Em produção o provedor de teste fica desligado; o e-mail mostra o host.
    await h.router.handle(OPPORTUNITY_EVENT);
    expect(h.emails[0].text).toContain('https://cpf.temcnpj.com.br/app/opportunities/o1');
  });

  it('o provedor não monta link sem área (falha fechada) e a falha de um destinatário não derruba os outros', async () => {
    const h = harness(areas, people);
    expect(() => h.provider.link('/app', undefined)).toThrow();
    expect(h.provider.link('/app', 'CPF')).toBe('http://cpf.temcnpj.com.br/app');
    // Destinatário sem empresa: o canal dele falha, o do vizinho segue.
    const broken = harness(areas, [user('quebrado', 'COMPANY', { company: null }), user('pessoa', 'PERSON')]);
    await broken.router.handle(OPPORTUNITY_EVENT);
    expect(broken.whatsappTo('pessoa')).toContain('http://cpf.temcnpj.com.br/app/opportunities/o1');
    expect(broken.whatsappTo('quebrado')).toBe('');
  });
});

describe('links por área · modo legado', () => {
  const people = [user('empresa', 'COMPANY'), user('pessoa', 'PERSON')];

  it('usa APP_URL para todo destinatário, como antes', async () => {
    const h = harness(legacy, people);
    expect(h.provider.linkFor).toBeNull();
    await h.router.handle(OPPORTUNITY_EVENT);
    await h.router.handle(TRANSACTION_EVENT);
    for (const id of ['empresa', 'pessoa']) {
      expect(h.whatsappTo(id), id).toContain('http://localhost:5173/app/opportunities/o1');
      expect(h.whatsappTo(id), id).toContain('http://localhost:5173/app/pay/transactions/t1');
    }
    for (const mail of h.emails) expect(mail.text).toContain('http://localhost:5173/app/');
    expect(JSON.stringify(h.emails)).not.toContain('temcnpj');
  });

  it('o legado não olha a empresa do destinatário nem a área', async () => {
    const h = harness(legacy, [user('sem-empresa', 'COMPANY', { company: undefined })]);
    await h.router.handle(OPPORTUNITY_EVENT);
    expect(h.whatsappTo('sem-empresa')).toContain('http://localhost:5173/app/opportunities/o1');
    expect(h.provider.link('/app', 'CPF')).toBe('http://localhost:5173/app');
    expect(h.provider.link('/app')).toBe('http://localhost:5173/app');
  });
});
