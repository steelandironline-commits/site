import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { areaApp } from './areaHelpers.js';

// 4b · modo legado inerte. Sem PUBLIC_HOST_CNPJ e PUBLIC_HOST_CPF as guardas de área não fazem nada:
// cada rota responde o mesmo que na 4a, em todos os hosts da T3. Os valores abaixo foram conferidos
// contra o app da 4a (commit 97779de), antes de mountArea existir. Sem banco.

const REFERENCE = 'localhost:5173';
const HOSTS = [REFERENCE, 'x.up.railway.app', 'cpf.temcnpj.com.br', 'temcpf.com.br'];

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } };
const UNAUTHORIZED = (message) => expect.objectContaining({ error: expect.objectContaining({ code: 'UNAUTHORIZED', ...(message ? { message } : {}) }) });

/** [método, caminho, status, corpo esperado ou undefined]. POST leva o cabeçalho de CSRF. */
const BATTERY = [
  ['get', '/api/health', 200, { status: 'ok', db: 'ok', realtime: 'test' }],
  ['get', '/api/session', 200, { session: null }],
  ['get', '/api/cep/123', 400, { error: { code: 'BAD_REQUEST', message: 'Informe o CEP com 8 números.' } }],
  ['get', '/api/me', 401, UNAUTHORIZED('Sessão não encontrada.')],
  ['get', '/api/company', 401],
  ['get', '/api/opportunities', 401],
  ['get', '/api/activity', 401],
  ['get', '/api/agents', 401],
  ['get', '/api/dashboard', 401],
  ['get', '/api/payments', 401],
  ['get', '/api/subscription', 401],
  ['get', '/api/team', 401],
  ['get', '/api/actions', 401],
  ['get', '/api/challenges/abc', 401],
  ['get', '/api/whatsapp', 401],
  ['get', '/api/notifications/preferences', 401],
  ['get', '/api/freight', 401],
  ['get', '/api/tenders', 401],
  ['get', '/api/workforce', 401],
  ['get', '/api/events', 401],
  ['get', '/api/pay/summary', 401],
  ['get', '/api/social/posts', 401],
  ['get', '/api/intermediation', 401],
  ['get', '/api/admin/overview', 401],
  ['get', '/api/onboarding', 401],
  ['post', '/api/actions/START_AGENT', 401],
  ['post', '/api/payments/pix', 401],
  ['get', '/api/webhooks/whatsapp', 403],
  ['get', '/api/nao-existe', 404, NOT_FOUND],
  ['get', '/api/healthz', 404, NOT_FOUND],
  ['get', '/api/actions/START_AGENT/extra', 404, NOT_FOUND],
];

describe('4b · modo legado inerte', () => {
  let app;
  let config;

  beforeAll(() => {
    ({ app, config } = areaApp({}));
  });

  const send = (host, [method, path]) => {
    let r = request(app)[method](path).set('Host', host);
    if (method === 'post') r = r.set('X-Requested-With', 'autopix').send({});
    return r;
  };

  it('sem variáveis o modo de áreas está desligado e nada é bloqueado por área', () => {
    expect(config.areas.enabled).toBe(false);
  });

  it('cada rota responde o mesmo da 4a, em todos os hosts da T3', async () => {
    for (const host of HOSTS) {
      for (const entry of BATTERY) {
        const [, path, status, body] = entry;
        const res = await send(host, entry);
        expect(res.status, `${host} ${entry[0].toUpperCase()} ${path}`).toBe(status);
        if (body !== undefined) expect(res.body, `${host} ${path}`).toEqual(body);
      }
    }
  });

  it('a mesma pergunta recebe a mesma resposta (status, tipo, cache e corpo) em qualquer host', async () => {
    for (const entry of BATTERY) {
      const ref = await send(REFERENCE, entry);
      for (const host of HOSTS.slice(1)) {
        const res = await send(host, entry);
        expect(res.status, `${host} ${entry[1]}`).toBe(ref.status);
        expect(res.headers['content-type']).toBe(ref.headers['content-type']);
        expect(res.headers['cache-control']).toBe(ref.headers['cache-control']);
        expect(res.text, `${host} ${entry[1]}`).toBe(ref.text);
      }
    }
  });

  it('/api/config sai completo, igual à 4a, em qualquer host', async () => {
    for (const host of HOSTS) {
      const res = await request(app).get('/api/config').set('Host', host);
      expect(res.status, host).toBe(200);
      expect(Object.keys(res.body).sort(), host).toEqual(['billing', 'demoMode', 'paymentProvider', 'plan', 'simulationAvailable']);
      expect(Object.keys(res.body.billing).sort(), host).toEqual(['commissionLabel', 'commissionTiers', 'companySignupFeeCents', 'model']);
    }
  });

  it('o CORS continua só para o APP_URL, em qualquer host', async () => {
    for (const host of HOSTS) {
      const own = await request(app).get('/api/session').set('Host', host).set('Origin', 'http://localhost:5173');
      expect(own.headers['access-control-allow-origin'], host).toBe('http://localhost:5173');
      const other = await request(app).get('/api/session').set('Host', host).set('Origin', 'https://cpf.temcnpj.com.br');
      expect(other.headers['access-control-allow-origin'], host).toBeUndefined();
    }
  });
});
