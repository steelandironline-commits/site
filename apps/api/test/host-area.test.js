import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import request from 'supertest';
import { HOSTS, PRODUCTION_ENV, areaApp, makeWebDist, probeApp } from './areaHelpers.js';

const area = (app, host, path = '/qualquer', extra = {}) => {
  let r = request(app).get(path).set('Host', host);
  for (const [k, v] of Object.entries(extra)) r = r.set(k, v);
  return r;
};

describe('hostArea · req.area', () => {
  const env = { ...HOSTS, ADMIN_HOST: 'admin.temcnpj.com.br' };
  const app = probeApp(env);

  it('host de CNPJ -> CNPJ, host de CPF -> CPF, ADMIN_HOST -> ADMIN', async () => {
    expect((await area(app, 'temcnpj.com.br')).body).toEqual({ reached: true, area: 'CNPJ' });
    expect((await area(app, 'cpf.temcnpj.com.br')).body).toEqual({ reached: true, area: 'CPF' });
    expect((await area(app, 'admin.temcnpj.com.br')).body).toEqual({ reached: true, area: 'ADMIN' });
  });

  it('compara só o nome do host: maiúsculas, porta e ponto final não contam', async () => {
    expect((await area(app, 'TemCNPJ.com.br')).body.area).toBe('CNPJ');
    expect((await area(app, 'temcnpj.com.br:8443')).body.area).toBe('CNPJ');
    expect((await area(app, 'cpf.temcnpj.com.br.')).body.area).toBe('CPF');
  });

  it('usa o host configurado, com porta, no desenvolvimento', async () => {
    const dev = probeApp({ PUBLIC_HOST_CNPJ: 'localhost:5173', PUBLIC_HOST_CPF: 'cpf.localhost:5174' });
    expect((await area(dev, 'localhost:5173')).body.area).toBe('CNPJ');
    expect((await area(dev, 'cpf.localhost:5174')).body.area).toBe('CPF');
    expect((await area(dev, 'outro.localhost:5173')).status).toBe(404);
  });

  it('honra X-Forwarded-Host (trust proxy 1), como o Railway entrega o host original', async () => {
    // Registro do comportamento. O que o Railway envia de fato é conferido na ETAPA 7.
    const res = await area(app, 'interno.railway.internal', '/x', { 'X-Forwarded-Host': 'cpf.temcnpj.com.br' });
    expect(res.body.area).toBe('CPF');
  });

  it('host desconhecido nunca chega ao app, e ADMIN_HOST ausente não vira host de admin', async () => {
    expect((await area(app, 'x.up.railway.app')).status).toBe(404);
    expect((await area(app, 'temcnpj.com.br.evil.example')).status).toBe(404);
    expect((await area(app, 'xtemcnpj.com.br')).status).toBe(404);
    const noAdmin = probeApp(HOSTS);
    expect((await area(noAdmin, 'admin.temcnpj.com.br')).status).toBe(404);
  });

  it('exceções: GET /api/health e /api/webhooks/* passam em qualquer host, com área nula', async () => {
    for (const host of ['x.up.railway.app', 'temcnpj.com.br', 'cpf.temcnpj.com.br', 'temcpf.com.br']) {
      const health = await area(app, host, '/api/health');
      expect(health.body, host).toEqual({ reached: true, area: null });
      const hook = await request(app).post('/api/webhooks/payment/mock').set('Host', host);
      expect(hook.body, host).toEqual({ reached: true, area: null });
      const wa = await area(app, host, '/api/webhooks/whatsapp?hub.mode=subscribe');
      expect(wa.body, host).toEqual({ reached: true, area: null });
    }
    expect((await request(app).head('/api/health').set('Host', 'x.up.railway.app')).status).toBe(200);
  });

  it('a exceção é estreita: outro método, outro caminho ou caminho parecido não passa', async () => {
    const stranger = 'x.up.railway.app';
    expect((await request(app).post('/api/health').set('Host', stranger)).status).toBe(404);
    expect((await area(app, stranger, '/api/healthz')).status).toBe(404);
    expect((await area(app, stranger, '/api/health/extra')).status).toBe(404);
    expect((await area(app, stranger, '/api/webhooks')).status).toBe(404);
    expect((await area(app, stranger, '/api/webhookshop')).status).toBe(404);
    expect((await area(app, stranger, '/health')).status).toBe(404);
  });
});

describe('hostArea · app completo, modo de áreas', () => {
  let webDist;
  let prod;
  let dev;

  beforeAll(() => {
    webDist = makeWebDist();
    prod = areaApp({ ...PRODUCTION_ENV, ...HOSTS }, { webDist }).app;
    dev = areaApp({ ...HOSTS }, { webDist }).app;
  });
  afterAll(() => fs.rmSync(webDist, { recursive: true, force: true }));

  const STRANGERS = ['x.up.railway.app', 'evil.example', '203.0.113.9', 'temcnpj.com.br.evil.example'];

  it('host desconhecido: 404 neutro em JSON dentro de /api', async () => {
    for (const host of STRANGERS) {
      const res = await area(prod, host, '/api/me');
      expect(res.status, host).toBe(404);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
    }
  });

  it('host desconhecido: 404 em texto simples fora de /api, mesmo em rota do SPA', async () => {
    for (const path of ['/', '/app/radar', '/sw.js', '/assets/app-abc123.js', '/robots.txt']) {
      const res = await area(prod, 'x.up.railway.app', path);
      expect(res.status, path).toBe(404);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      expect(res.text).toBe('Not Found');
    }
  });

  it('o 404 não revela nada: igual em /api, sem CORS, sem cookie, sem redirecionamento', async () => {
    const res = await area(prod, 'x.up.railway.app', '/api/session', { Origin: 'https://temcnpj.com.br' });
    expect(res.status).toBe(404);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers.location).toBeUndefined();
  });

  it('o host padrão do supertest (127.0.0.1) também é desconhecido', async () => {
    expect((await request(prod).get('/')).status).toBe(404);
    expect((await request(prod).get('/api/session')).status).toBe(404);
  });

  it('vem logo depois do helmet e antes de CSRF e do resto: a resposta tem os cabeçalhos do helmet', async () => {
    const res = await request(prod).post('/api/auth/login').set('Host', 'x.up.railway.app').send({});
    // Sem X-Requested-With o csrfGuard responderia 403; o host barra antes.
    expect(res.status).toBe(404);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('host de CNPJ e de CPF chegam ao app (esta etapa só escolhe a área)', async () => {
    for (const host of ['temcnpj.com.br', 'cpf.temcnpj.com.br']) {
      const session = await area(prod, host, '/api/session');
      expect(session.status, host).toBe(200);
      expect(session.body).toEqual({ session: null });
      expect((await area(prod, host, '/api/me')).status).toBe(401);
      const page = await area(prod, host, '/app/radar');
      expect(page.status).toBe(200);
      expect(page.text).toContain('spa-fixture');
    }
  });

  it('redireciona o host de redirecionamento com 301 para o host da área, mantendo caminho e consulta', async () => {
    const res = await area(prod, 'temcpf.com.br', '/onboarding?utm_source=x');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('https://cpf.temcnpj.com.br/onboarding?utm_source=x');
    expect(res.headers['set-cookie']).toBeUndefined();

    const www = await area(prod, 'www.temcpf.com.br', '/app/social?a=1&b=%C3%A9#nao-vai');
    expect(www.status).toBe(301);
    expect(www.headers.location).toBe('https://cpf.temcnpj.com.br/app/social?a=1&b=%C3%A9');

    const cnpj = await area(prod, 'www.temcnpj.com.br', '/login');
    expect(cnpj.status).toBe(301);
    expect(cnpj.headers.location).toBe('https://temcnpj.com.br/login');

    const root = await area(prod, 'temcpf.com.br', '/');
    expect(root.headers.location).toBe('https://cpf.temcnpj.com.br/');
  });

  it('o redirecionamento não deixa o host sair da área nem em caminho esquisito', async () => {
    for (const path of ['//evil.example/x', '/@evil.example', '/%2F%2Fevil.example']) {
      const res = await area(prod, 'temcpf.com.br', path);
      expect(res.status, path).toBe(301);
      expect(new URL(res.headers.location).host, path).toBe('cpf.temcnpj.com.br');
    }
  });

  it('o redirecionamento vale para qualquer método e para rotas de /api (menos as exceções)', async () => {
    const post = await request(prod).post('/api/auth/login?x=1').set('Host', 'temcpf.com.br');
    expect(post.status).toBe(301);
    expect(post.headers.location).toBe('https://cpf.temcnpj.com.br/api/auth/login?x=1');
    expect((await area(prod, 'temcpf.com.br', '/api/health')).status).toBe(200);
    expect((await area(prod, 'temcpf.com.br', '/api/webhooks/whatsapp')).status).not.toBe(301);
  });

  it('fora de produção o redirecionamento usa http (e a porta configurada)', async () => {
    const res = await area(dev, 'temcpf.com.br', '/onboarding?utm_source=x');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('http://cpf.temcnpj.com.br/onboarding?utm_source=x');

    const local = areaApp({ PUBLIC_HOST_CNPJ: 'localhost:5173', PUBLIC_HOST_CPF: 'cpf.localhost:5174', PUBLIC_HOST_CPF_REDIRECT: 'pessoa.localhost:5175' }, { webDist }).app;
    const moved = await area(local, 'pessoa.localhost:5175', '/login?x=1');
    expect(moved.status).toBe(301);
    expect(moved.headers.location).toBe('http://cpf.localhost:5174/login?x=1');
  });

  it('/api/health responde em qualquer host: desconhecido, redirecionamento, CNPJ e CPF', async () => {
    for (const host of [...STRANGERS, 'temcpf.com.br', 'www.temcnpj.com.br', 'temcnpj.com.br', 'cpf.temcnpj.com.br']) {
      const res = await area(prod, host, '/api/health');
      expect(res.status, host).toBe(200);
      expect(res.body.status, host).toBe('ok');
    }
  });

  it('/api/webhooks/* responde em qualquer host: a resposta é a do webhook, não a do host', async () => {
    for (const host of [...STRANGERS, 'temcpf.com.br', 'temcnpj.com.br']) {
      // O handshake do WhatsApp sem token devolve o 403 "forbidden" do próprio handler.
      const res = await area(prod, host, '/api/webhooks/whatsapp');
      expect(res.status, host).toBe(403);
      expect(res.text, host).toBe('forbidden');
    }
  });

  it('os hosts vêm da configuração, não do código', async () => {
    const other = areaApp({ PUBLIC_HOST_CNPJ: 'empresas.example.test', PUBLIC_HOST_CPF: 'pessoas.example.test', PUBLIC_HOST_CPF_REDIRECT: 'antigo.example.test' }, { webDist }).app;
    expect((await area(other, 'empresas.example.test', '/api/session')).status).toBe(200);
    expect((await area(other, 'pessoas.example.test', '/api/session')).status).toBe(200);
    expect((await area(other, 'temcnpj.com.br', '/api/session')).status).toBe(404);
    expect((await area(other, 'antigo.example.test', '/x')).headers.location).toBe('http://pessoas.example.test/x');
  });
});
