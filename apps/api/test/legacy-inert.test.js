import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { disconnectPrisma } from '@autopix/core';
import { areaApp, makeWebDist, probeApp, removeWebDist } from './areaHelpers.js';
import { setupApp, resetDb, createActiveUser, hasDb, STRONG_PASSWORD } from './helpers.js';

// T3. Sem PUBLIC_HOST_CNPJ e PUBLIC_HOST_CPF o servidor se comporta como antes das áreas:
// o host é ignorado. Os valores esperados abaixo foram conferidos contra o app sem o
// middleware (mesmos 161 pedidos, 7 hosts, status, cabeçalhos e corpo idênticos).

const APP_ORIGIN = 'http://localhost:5173'; // APP_URL do testConfig
const REFERENCE = 'localhost:5173';
const HOSTS = [REFERENCE, 'x.up.railway.app', 'cpf.temcnpj.com.br', 'temcpf.com.br'];

describe('T3 · modo legado inerte', () => {
  let webDist;
  let app;
  let config;

  beforeAll(() => {
    webDist = makeWebDist();
    ({ app, config } = areaApp({}, { webDist }));
  });
  afterAll(() => removeWebDist(webDist));

  const get = (host, path, headers = {}) => {
    let r = request(app).get(path).set('Host', host);
    for (const [k, v] of Object.entries(headers)) r = r.set(k, v);
    return r;
  };

  it('sem variáveis o modo de áreas está desligado', () => {
    expect(config.areas.enabled).toBe(false);
    expect(config.session.cookieName).toBe('ap_session');
  });

  it('o SPA responde 200 em toda rota, em qualquer host, sem 301', async () => {
    for (const host of HOSTS) {
      for (const path of ['/', '/app/radar', '/onboarding?utm_source=x', '/app/licitacoes', '/qualquer/coisa']) {
        const res = await get(host, path);
        expect(res.status, `${host}${path}`).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.text).toContain('spa-fixture');
        expect(res.headers.location).toBeUndefined();
      }
    }
  });

  it('arquivos estáticos saem iguais em qualquer host', async () => {
    for (const host of HOSTS) {
      const asset = await get(host, '/assets/app-abc123.js');
      expect(asset.status, host).toBe(200);
      expect(asset.headers['cache-control']).toMatch(/immutable/);
      const sw = await get(host, '/sw.js');
      expect(sw.status).toBe(200);
      expect(sw.headers['cache-control']).toBe('no-cache');
      expect((await get(host, '/robots.txt')).status).toBe(200);
    }
  });

  it('/api/health, /api/session e /api/config respondem 200 em qualquer host', async () => {
    for (const host of HOSTS) {
      const health = await get(host, '/api/health');
      expect(health.status, host).toBe(200);
      expect(health.body.status).toBe('ok');
      expect((await get(host, '/api/session')).body).toEqual({ session: null });
      expect((await get(host, '/api/config')).status).toBe(200);
    }
  });

  it('rota de API desconhecida e rota protegida respondem como antes, em qualquer host', async () => {
    for (const host of HOSTS) {
      const unknown = await get(host, '/api/nao-existe');
      expect(unknown.status, host).toBe(404);
      expect(unknown.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
      expect((await get(host, '/api/me')).status).toBe(401);
      // O CSRF continua valendo igual: POST sem X-Requested-With é 403, não 404 nem 301.
      const csrf = await request(app).post('/api/auth/login').set('Host', host).send({});
      expect(csrf.status, host).toBe(403);
    }
  });

  it('o webhook responde em qualquer host', async () => {
    for (const host of HOSTS) {
      const res = await get(host, '/api/webhooks/whatsapp');
      expect(res.status, host).toBe(403);
      expect(res.text).toBe('forbidden');
    }
  });

  it('CORS só para o APP_URL, em qualquer host', async () => {
    for (const host of HOSTS) {
      const own = await get(host, '/api/session', { Origin: APP_ORIGIN });
      expect(own.headers['access-control-allow-origin'], host).toBe(APP_ORIGIN);
      expect(own.headers['access-control-allow-credentials']).toBe('true');
      for (const origin of ['https://cpf.temcnpj.com.br', 'https://temcpf.com.br', 'https://x.up.railway.app', 'https://temcnpj.com.br']) {
        const other = await get(host, '/api/session', { Origin: origin });
        expect(other.status).toBe(200);
        expect(other.headers['access-control-allow-origin'], `${host} ← ${origin}`).toBeUndefined();
      }
      const preflight = await request(app)
        .options('/api/me')
        .set('Host', host)
        .set('Origin', 'https://cpf.temcnpj.com.br')
        .set('Access-Control-Request-Method', 'GET');
      expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('a mesma pergunta recebe a mesma resposta em qualquer host', async () => {
    const probes = ['/', '/app/radar', '/api/health', '/api/session', '/api/config', '/api/me', '/api/nao-existe', '/sw.js'];
    for (const path of probes) {
      const ref = await get(REFERENCE, path);
      for (const host of HOSTS.slice(1)) {
        const res = await get(host, path);
        expect(res.status, `${host}${path}`).toBe(ref.status);
        expect(res.headers['content-type']).toBe(ref.headers['content-type']);
        expect(res.headers['cache-control']).toBe(ref.headers['cache-control']);
        expect(res.text).toBe(ref.text);
      }
    }
  });

  it('o hostArea do modo legado só deixa req.area nulo e segue adiante', async () => {
    const probe = probeApp({});
    for (const host of [...HOSTS, 'evil.example']) {
      const res = await request(probe).get('/api/me').set('Host', host);
      expect(res.status, host).toBe(200);
      expect(res.body, host).toEqual({ reached: true, area: null });
    }
  });
});

// Cookie: confere que o nome e os atributos não dependem do host. Precisa de banco.
describe.skipIf(!hasDb)('T3 · cookie de sessão no modo legado', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp();
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('o login grava o mesmo ap_session, com os mesmos atributos, em qualquer host', async () => {
    await resetDb(ctx.prisma);
    const { email } = await createActiveUser(ctx.app);
    const cookies = [];
    for (const host of HOSTS) {
      const res = await request(ctx.app)
        .post('/api/auth/login')
        .set('Host', host)
        .set('X-Requested-With', 'autopix')
        .send({ email, password: STRONG_PASSWORD });
      expect(res.status, host).toBe(200);
      const header = res.headers['set-cookie'].find((c) => c.startsWith('ap_session='));
      expect(header, host).toBeDefined();
      cookies.push(header.replace(/^ap_session=[^;]*/, 'ap_session=<valor>').replace(/Expires=[^;]*/i, 'Expires=<data>'));
    }
    expect(new Set(cookies).size).toBe(1);
    expect(cookies[0]).toMatch(/HttpOnly/i);
    expect(cookies[0]).toMatch(/SameSite=Lax/i);
    expect(cookies[0]).toMatch(/Path=\//);
    expect(cookies[0]).not.toMatch(/Domain=/i);
  });
});
