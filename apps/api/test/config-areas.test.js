import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { HOSTS, areaApp } from './areaHelpers.js';

// 4b · /api/config responde por área. O CPF não recebe taxa de cadastro, plano nem comissão de
// empresa. No modo legado a resposta é a de sempre. Sem banco (o app sobe com um prisma de mentira).

const BILLING = { BILLING_MODEL: 'commission', COMPANY_SIGNUP_FEE_CENTS: '20000' };
const get = (app, host) => request(app).get('/api/config').set('Host', host);

describe('/api/config · modo de áreas', () => {
  const { app } = areaApp({ ...HOSTS, ...BILLING });

  it('o host CNPJ recebe a taxa de cadastro, o plano e a comissão', async () => {
    const res = await get(app, HOSTS.PUBLIC_HOST_CNPJ);
    expect(res.status).toBe(200);
    expect(res.body.billing).toMatchObject({ model: 'commission', companySignupFeeCents: 20000 });
    expect(res.body.billing.commissionTiers.length).toBeGreaterThan(0);
    expect(res.body.billing.commissionLabel).toBeTruthy();
    expect(res.body.plan).toBeDefined();
    expect(res.body.paymentProvider).toBeDefined();
  });

  it('o host CPF não recebe nenhum campo de cobrança de empresa', async () => {
    const res = await get(app, HOSTS.PUBLIC_HOST_CPF);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ demoMode: expect.any(Boolean) });
    for (const field of ['billing', 'plan', 'paymentProvider', 'simulationAvailable']) expect(res.body, field).not.toHaveProperty(field);
    // Nem de longe: nenhum valor de taxa nem rótulo de comissão no corpo.
    expect(res.text).not.toMatch(/20000|commission|signup|Fee|priceCents/i);
  });

  it('o host CPF recebe a mesma resposta mínima também em produção (https)', async () => {
    const { app: prod } = areaApp({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/tempix_test',
      APP_URL: 'https://tempix.up.railway.app',
      API_URL: 'https://tempix.up.railway.app',
      PAYMENT_PROVIDER: 'none',
      ...HOSTS,
      ...BILLING,
    });
    expect((await get(prod, HOSTS.PUBLIC_HOST_CPF)).body).toEqual({ demoMode: expect.any(Boolean) });
    expect((await get(prod, HOSTS.PUBLIC_HOST_CNPJ)).body.billing.companySignupFeeCents).toBe(20000);
  });

  it('host de redirecionamento e host desconhecido nunca chegam à resposta', async () => {
    expect((await get(app, 'x.up.railway.app')).status).toBe(404);
    expect((await get(app, 'temcpf.com.br')).status).toBe(301);
  });
});

describe('/api/config · modo legado', () => {
  const { app } = areaApp({ ...BILLING });
  const { app: other } = areaApp({ ...BILLING });

  it('responde como antes, completa, em qualquer host', async () => {
    const reference = await get(app, 'localhost:5173');
    expect(reference.status).toBe(200);
    expect(Object.keys(reference.body).sort()).toEqual(['billing', 'demoMode', 'paymentProvider', 'plan', 'simulationAvailable']);
    expect(reference.body.billing).toMatchObject({ model: 'commission', companySignupFeeCents: 20000 });
    for (const host of ['x.up.railway.app', HOSTS.PUBLIC_HOST_CNPJ, HOSTS.PUBLIC_HOST_CPF, 'temcpf.com.br']) {
      const res = await get(other, host);
      expect(res.status, host).toBe(200);
      expect(res.body, host).toEqual(reference.body);
    }
  });

  it('é idêntica à resposta do host CNPJ no modo de áreas (mesma configuração de cobrança)', async () => {
    const legacy = await get(app, 'localhost:5173');
    const { app: areas } = areaApp({ ...HOSTS, ...BILLING });
    expect((await get(areas, HOSTS.PUBLIC_HOST_CNPJ)).body).toEqual(legacy.body);
  });
});
