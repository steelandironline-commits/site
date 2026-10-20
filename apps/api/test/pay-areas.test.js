import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { disconnectPrisma } from '@autopix/core';
import { setupApp, resetDb, hasDb } from './helpers.js';
import { AREA_ENV, CNPJ_HOST, CPF_HOST, DEV_COOKIE, call, insertSession, makeAccount } from './authAreaHelpers.js';

// 4c · item A. A contraparte de outra área nunca aparece em Pagamentos (ARQUITETURA 6.3, última
// linha da tabela). Dono do CNPJ chama CREATE_TRANSACTION com o e-mail de uma pessoa do CPF: a
// resposta não pode revelar que a conta existe, nem o nome, nem a empresa; e nada do negócio pode
// cair na atividade, no SSE ou nas notificações da pessoa.

const EXTRA = { DEMO_MODE: 'false', MOCK_PAYMENT_CAPABILITIES: 'protectedFlow,payout' };

const BUYER_FIELDS = ['buyerCompanyId', 'buyerUserId', 'buyerName', 'buyerEmail', 'buyerCompanyName'];
const SELLER_FIELDS = ['sellerCompanyId', 'sellerUserId', 'sellerName'];

function row(seller, buyer, extra = {}) {
  return {
    type: 'SERVICE',
    status: 'DRAFT',
    description: 'Serviço de teste',
    sellerCompanyId: seller.company.id,
    sellerUserId: seller.user.id,
    buyerCompanyId: buyer.company.id,
    buyerUserId: buyer.user.id,
    buyerName: buyer.user.name,
    buyerEmail: buyer.email,
    grossAmount: 100000,
    commissionAmount: 5000,
    sellerNetAmount: 95000,
    commissionRateBps: 500,
    isSandbox: true,
    ...extra,
  };
}

describe.skipIf(!hasDb)('Pay por área · modo de áreas · contraparte de outra área', () => {
  let ctx;
  let cnpj; // vendedor
  let cnpjBuyer; // comprador da mesma área (controle)
  let person; // pessoa do CPF
  let token;

  const cookie = (host, who) => `${DEV_COOKIE[host]}=${token[who]}`;
  const get = (host, who, path) => call(ctx.app, host, 'get', path, { cookie: cookie(host, who), origin: null, xrw: null });
  const create = (who, input) => call(ctx.app, CNPJ_HOST, 'post', '/api/actions/CREATE_TRANSACTION', { body: { input }, cookie: cookie(CNPJ_HOST, who) });

  beforeAll(async () => {
    ctx = await setupApp({ ...AREA_ENV, ...EXTRA });
    await resetDb(ctx.prisma);
    cnpj = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    cnpjBuyer = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    person = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    const session = async (account, area) => (await insertSession(ctx.prisma, ctx.config, { userId: account.user.id, area })).token;
    token = {
      cnpj: await session(cnpj, 'CNPJ'),
      cnpjBuyer: await session(cnpjBuyer, 'CNPJ'),
      person: await session(person, 'CPF'),
    };
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  const events = (companyId) => ctx.prisma.domainEvent.count({ where: { companyId } });

  it('e-mail de pessoa do CPF vira "fora da plataforma": a resposta é igual à de um e-mail sem cadastro', async () => {
    const base = { grossCents: 100000, description: 'Manutenção' };
    const withPerson = await create('cnpj', { ...base, buyerEmail: person.email });
    const unknown = await create('cnpj', { ...base, buyerEmail: 'ninguem-aqui@exemplo.example' });
    expect(withPerson.status).toBe(200);
    expect(unknown.status).toBe(200);
    const a = withPerson.body.result.transaction;
    const b = unknown.body.result.transaction;
    for (const f of ['buyerCompanyId', 'buyerUserId', 'buyerName', 'protectedFlow', 'status', 'type', 'settlementStatus']) {
      expect(a[f], f).toEqual(b[f]);
    }
    expect(a).toMatchObject({ buyerCompanyId: null, buyerUserId: null, buyerName: null, protectedFlow: false });
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    // O que o CNPJ digitou volta como digitou; nada vem do cadastro da pessoa.
    expect(JSON.stringify(withPerson.body)).not.toContain(person.user.name);
    expect(JSON.stringify(withPerson.body)).not.toContain(person.company.name);
  });

  it('o nome digitado pelo vendedor continua valendo; o nome da pessoa nunca', async () => {
    const res = await create('cnpj', { grossCents: 100000, buyerEmail: person.email, buyerName: 'Cliente Avulso' });
    expect(res.body.result.transaction).toMatchObject({ buyerName: 'Cliente Avulso', buyerCompanyId: null, protectedFlow: false });
  });

  it('comprador da mesma área continua ligado: empresa, pagamento protegido e evento nos dois lados', async () => {
    const res = await create('cnpj', { grossCents: 100000, buyerEmail: cnpjBuyer.email });
    const t = res.body.result.transaction;
    expect(t).toMatchObject({ buyerCompanyId: cnpjBuyer.company.id, buyerName: cnpjBuyer.user.name, protectedFlow: true });
    expect(await ctx.prisma.domainEvent.count({ where: { aggregateId: t.id, type: 'TRANSACTION_CREATED' } })).toBe(2);
    const detail = await get(CNPJ_HOST, 'cnpj', `/api/pay/transactions/${t.id}`);
    expect(detail.body.transaction.buyerCompanyName).toBe(cnpjBuyer.company.name);
  });

  it('nada do negócio chega à pessoa: nem evento, nem atividade, nem notificação, nem leitura', async () => {
    const before = await events(person.company.id);
    const res = await create('cnpj', { grossCents: 100000, buyerEmail: person.email, description: 'Texto escrito pela empresa' });
    const t = res.body.result.transaction;
    await ctx.services.events.dispatchPending({ limit: 100 });
    expect(await events(person.company.id)).toBe(before);
    expect(await ctx.prisma.activityEvent.count({ where: { companyId: person.company.id } })).toBe(0);
    expect(await ctx.prisma.notificationDelivery.count({ where: { domainEvent: { companyId: person.company.id } } })).toBe(0);
    const feed = await get(CPF_HOST, 'person', '/api/activity');
    expect(feed.status).toBe(200);
    expect(JSON.stringify(feed.body)).not.toContain('Texto escrito pela empresa');
    expect(JSON.stringify(feed.body)).not.toContain(t.id);
    // A pessoa também não lê o negócio: o CPF não tem a montagem de Pagamentos.
    expect((await get(CPF_HOST, 'person', `/api/pay/transactions/${t.id}`)).status).toBe(404);
  });

  it('GET e lista do vendedor não devolvem campos de contraparte do negócio digitado com a pessoa', async () => {
    const res = await create('cnpj', { grossCents: 100000, buyerEmail: person.email });
    const t = res.body.result.transaction;
    const detail = await get(CNPJ_HOST, 'cnpj', `/api/pay/transactions/${t.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.transaction.buyerCompanyName).toBeNull();
    expect(detail.body.transaction.buyerName).toBeNull();
    const list = await get(CNPJ_HOST, 'cnpj', '/api/pay/transactions');
    expect(list.body.items.find((i) => i.id === t.id)).toMatchObject({ buyerCompanyId: null, buyerName: null });
    expect(JSON.stringify([detail.body, list.body])).not.toContain(person.user.name);
    expect(JSON.stringify([detail.body, list.body])).not.toContain(person.company.name);
  });

  describe('linhas que já existiam no banco, com a contraparte de outra área', () => {
    let sellerSide; // vendedor CNPJ, comprador PERSON
    let buyerSide; // vendedor PERSON, comprador CNPJ

    beforeAll(async () => {
      sellerSide = await ctx.prisma.marketplaceTransaction.create({ data: row(cnpj, person, { description: 'Linha antiga A' }) });
      buyerSide = await ctx.prisma.marketplaceTransaction.create({ data: row(person, cnpj, { description: 'Linha antiga B' }) });
    });

    it('o vendedor do CNPJ não recebe nome, e-mail, empresa nem ids do comprador do CPF', async () => {
      const detail = await get(CNPJ_HOST, 'cnpj', `/api/pay/transactions/${sellerSide.id}`);
      expect(detail.status).toBe(200);
      for (const f of BUYER_FIELDS) expect(detail.body.transaction[f] ?? null, f).toBeNull();
      expect(detail.body.role).toBe('SELLER');
      expect(detail.body.allowedActions).not.toContain('OPEN_DISPUTE');
      const list = await get(CNPJ_HOST, 'cnpj', '/api/pay/transactions');
      const item = list.body.items.find((i) => i.id === sellerSide.id);
      expect(item).toMatchObject({ buyerCompanyId: null, buyerName: null, role: 'SELLER' });
      const text = JSON.stringify([detail.body, list.body]);
      for (const secret of [person.user.name, person.email, person.company.name, person.user.id, person.company.id]) expect(text).not.toContain(secret);
    });

    it('o comprador do CNPJ não recebe nome nem ids do vendedor do CPF', async () => {
      const detail = await get(CNPJ_HOST, 'cnpj', `/api/pay/transactions/${buyerSide.id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.role).toBe('BUYER');
      for (const f of SELLER_FIELDS) expect(detail.body.transaction[f] ?? null, f).toBeNull();
      const list = await get(CNPJ_HOST, 'cnpj', '/api/pay/transactions');
      expect(list.body.items.find((i) => i.id === buyerSide.id)).toMatchObject({ sellerCompanyId: null, role: 'BUYER' });
      const text = JSON.stringify([detail.body, list.body]);
      for (const secret of [person.user.name, person.company.name, person.user.id, person.company.id]) expect(text).not.toContain(secret);
    });

    it('o evento não é publicado para a empresa da contraparte de outra área', async () => {
      const personBefore = await events(person.company.id);
      const sellerBefore = await events(cnpj.company.id);
      await ctx.services.transactions.publishBoth(sellerSide, {
        type: 'TRANSACTION_CREATED',
        userId: cnpj.user.id,
        payload: { link: `/app/pay/transactions/${sellerSide.id}` },
        activity: { type: 'PAYMENT', title: 'Negócio criado', description: sellerSide.description, source: 'TemPix Pay' },
      });
      expect(await events(person.company.id)).toBe(personBefore);
      expect(await ctx.prisma.activityEvent.count({ where: { companyId: person.company.id } })).toBe(0);
      expect(await events(cnpj.company.id)).toBe(sellerBefore + 1);
    });
  });
});

describe.skipIf(!hasDb)('Pay por área · modo legado, a contraparte continua como antes', () => {
  let ctx;
  let cnpj;
  let person;

  beforeAll(async () => {
    ctx = await setupApp({ DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
    cnpj = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    person = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('comprador de qualquer tipo de conta entra ligado ao negócio, com nome, empresa e evento', async () => {
    const t = await ctx.services.transactions.create({ user: cnpj.user, company: cnpj.company, grossCents: 100000, description: 'Serviço', buyerEmail: person.email });
    expect(t).toMatchObject({ buyerCompanyId: person.company.id, buyerUserId: person.user.id, buyerName: person.user.name });
    expect(await ctx.prisma.domainEvent.count({ where: { aggregateId: t.id, companyId: person.company.id } })).toBe(1);
    const detail = await ctx.services.transactions.get(t.id, { companyId: cnpj.company.id });
    expect(detail.transaction.buyerCompanyName).toBe(person.company.name);
    const list = await ctx.services.transactions.list(cnpj.company.id);
    expect(list.find((i) => i.id === t.id)).toMatchObject({ buyerCompanyId: person.company.id, buyerName: person.user.name });
  });

  it('o vendedor aparece para o comprador, como antes', async () => {
    const t = await ctx.prisma.marketplaceTransaction.create({ data: row(person, cnpj) });
    const detail = await ctx.services.transactions.get(t.id, { companyId: cnpj.company.id });
    expect(detail.transaction.sellerName).toBe(person.company.name);
    expect(detail.transaction.sellerCompanyId).toBe(person.company.id);
  });
});
