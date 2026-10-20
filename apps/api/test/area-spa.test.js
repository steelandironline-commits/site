import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { HOSTS, PRODUCTION_ENV, areaApp, makeWebDist, removeWebDist } from './areaHelpers.js';

// ETAPA 3b · o servidor serve o SPA certo por host: apps/web/dist-<área>, ao lado do dist/ legado.
// Cada área só enxerga o próprio dist, e só os caminhos de página da área recebem 200.

const CNPJ = 'temcnpj.com.br';
const CPF = 'cpf.temcnpj.com.br';

// supertest só preenche .text para tipos de texto; SVG e PNG chegam como Buffer em .body.
const textOf = (res) => (typeof res.text === 'string' && res.text !== '' ? res.text : Buffer.isBuffer(res.body) ? res.body.toString('utf8') : '');

describe('SPA por área', () => {
  let webDist;
  let app;

  beforeAll(() => {
    webDist = makeWebDist();
    app = areaApp({ ...PRODUCTION_ENV, ...HOSTS }, { webDist }).app;
  });
  afterAll(() => removeWebDist(webDist));

  const get = (host, urlPath, headers = {}) => {
    let r = request(app).get(urlPath).set('Host', host);
    for (const [k, v] of Object.entries(headers)) r = r.set(k, v);
    return r;
  };
  const head = (host, urlPath) => request(app).head(urlPath).set('Host', host);

  describe('páginas', () => {
    it('cada host recebe o index.html do dist da sua área, nunca o do legado nem o da outra', async () => {
      const cnpj = await get(CNPJ, '/');
      expect(cnpj.status).toBe(200);
      expect(cnpj.headers['content-type']).toMatch(/text\/html/);
      expect(cnpj.text).toContain('spa-fixture-cnpj');
      const cpf = await get(CPF, '/');
      expect(cpf.status).toBe(200);
      expect(cpf.text).toContain('spa-fixture-cpf');
      expect(cpf.text).not.toContain('cnpj');
    });

    it('páginas comuns respondem 200 nas duas áreas', async () => {
      for (const p of ['/', '/login', '/onboarding', '/forgot-password', '/activate/abc123', '/reset-password/tok', '/app', '/app/', '/app/social', '/app/operacao', '/app/activity', '/app/settings', '/app/confirm/9', '/APP/Social']) {
        for (const [host, tag] of [[CNPJ, 'cnpj'], [CPF, 'cpf']]) {
          const res = await get(host, p);
          expect(res.status, `${host}${p}`).toBe(200);
          expect(res.text, `${host}${p}`).toContain(`spa-fixture-${tag}`);
        }
      }
    });

    it('as páginas de CNPJ respondem 200 no CNPJ e 404 no CPF, com o index.html do CPF', async () => {
      for (const p of ['/app/licitacoes', '/app/radar', '/checkout', '/app/pay', '/app/pay/transactions/7', '/app/payments', '/app/freight', '/app/workforce', '/app/intermediacao', '/app/company', '/app/subscription', '/app/agents', '/app/opportunities/12']) {
        const cnpj = await get(CNPJ, p);
        expect(cnpj.status, `${CNPJ}${p}`).toBe(200);
        expect(cnpj.text).toContain('spa-fixture-cnpj');
        const cpf = await get(CPF, p);
        expect(cpf.status, `${CPF}${p}`).toBe(404);
        expect(cpf.headers['content-type']).toMatch(/text\/html/);
        expect(cpf.text).toContain('spa-fixture-cpf');
        expect(cpf.headers.location).toBeUndefined();
      }
    });

    it('caminho que nenhuma área declara é 404 com o index.html da própria área, nos dois hosts', async () => {
      for (const p of ['/qualquer/coisa', '/app/nao-existe', '/app/admin', '/app/radar/x', '/login/extra', '/activate', '/admin']) {
        for (const [host, tag] of [[CNPJ, 'cnpj'], [CPF, 'cpf']]) {
          const res = await get(host, p);
          expect(res.status, `${host}${p}`).toBe(404);
          expect(res.text, `${host}${p}`).toContain(`spa-fixture-${tag}`);
          expect(res.headers.location).toBeUndefined();
        }
      }
    });

    it('a resposta de um caminho da outra área é idêntica à de um caminho que não existe em lugar nenhum', async () => {
      const other = await get(CPF, '/app/licitacoes');
      const nowhere = await get(CPF, '/app/xyz-nao-existe');
      expect(other.status).toBe(nowhere.status);
      expect(other.text).toBe(nowhere.text);
      for (const h of ['content-type', 'cache-control', 'content-length']) expect(other.headers[h], h).toBe(nowhere.headers[h]);
    });

    it('a consulta não muda a página; o 404 e o 200 não são cacheados', async () => {
      expect((await get(CNPJ, '/app/radar?x=1')).status).toBe(200);
      expect((await get(CPF, '/app/radar?x=1')).status).toBe(404);
      expect((await get(CPF, '/app/social')).headers['cache-control']).toBe('no-cache');
      expect((await get(CPF, '/app/radar')).headers['cache-control']).toBe('no-cache');
    });

    it('HEAD segue a mesma regra', async () => {
      expect((await head(CNPJ, '/app/radar')).status).toBe(200);
      expect((await head(CPF, '/app/radar')).status).toBe(404);
      expect((await head(CPF, '/assets/cnpj-abc123.js')).status).toBe(404);
      expect((await head(CPF, '/assets/cpf-abc123.js')).status).toBe(200);
    });

    it('outros métodos fora de /api não viram página', async () => {
      const res = await request(app).post('/app/social').set('Host', CPF);
      expect(res.status).not.toBe(200);
      expect(res.text ?? '').not.toContain('spa-fixture');
    });
  });

  describe('arquivos', () => {
    it('assets saem só do dist da área: o hash da outra área não existe aqui', async () => {
      const own = await get(CPF, '/assets/cpf-abc123.js');
      expect(own.status).toBe(200);
      expect(own.text).toContain('asset cpf');
      expect(own.headers['cache-control']).toMatch(/immutable/);
      const foreign = await get(CPF, '/assets/cnpj-abc123.js');
      expect(foreign.status).toBe(404);
      expect(foreign.headers['content-type']).toMatch(/text\/plain/);
      expect(foreign.text).toBe('Not Found');
      expect((await get(CNPJ, '/assets/cpf-abc123.js')).status).toBe(404);
      expect((await get(CNPJ, '/assets/cnpj-abc123.js')).text).toContain('asset cnpj');
    });

    it('o dist legado não é servido no modo de áreas', async () => {
      for (const host of [CNPJ, CPF]) {
        const res = await get(host, '/assets/app-abc123.js');
        expect(res.status, host).toBe(404);
        expect(res.text).not.toContain('asset legacy');
      }
    });

    it('sw.js, manifest.webmanifest, robots.txt e favicon vêm do dist da área', async () => {
      for (const [host, tag] of [[CNPJ, 'cnpj'], [CPF, 'cpf']]) {
        const sw = await get(host, '/sw.js');
        expect(sw.status).toBe(200);
        expect(sw.text).toContain(`// ${tag}`);
        expect(sw.headers['cache-control']).toBe('no-cache');
        const manifest = await get(host, '/manifest.webmanifest');
        expect(manifest.text).toContain(`fixture ${tag}`);
        expect(manifest.headers['cache-control']).toBe('no-cache');
        expect((await get(host, '/robots.txt')).text).toContain(`# ${tag}`);
        expect(textOf(await get(host, '/favicon.svg'))).toContain(tag);
        expect(textOf(await get(host, '/icons/icon-192.png'))).toBe(`icon ${tag}`);
      }
    });

    it('arquivo que só existe no dist da outra área responde 404', async () => {
      const own = await get(CNPJ, '/icons/so-cnpj.png');
      expect(own.status).toBe(200);
      expect(textOf(own)).toBe('so cnpj');
      const res = await get(CPF, '/icons/so-cnpj.png');
      expect(res.status).toBe(404);
      expect(res.text).toBe('Not Found');
    });

    it('arquivo qualquer que não existe é 404 em texto simples, não o index.html', async () => {
      for (const p of ['/nao-existe.js', '/foo.css', '/assets/nada', '/assets/sub/nada.js', '/sitemap.xml', '/.env', '/package.json']) {
        for (const host of [CNPJ, CPF]) {
          const res = await get(host, p);
          expect(res.status, `${host}${p}`).toBe(404);
          expect(res.text, `${host}${p}`).toBe('Not Found');
        }
      }
    });

    it('index.html e modules.json existem no dist, mas não são entregues', async () => {
      for (const p of ['/index.html', '/Index.html', '/modules.json']) {
        for (const host of [CNPJ, CPF]) {
          const res = await get(host, p);
          expect(res.status, `${host}${p}`).toBe(404);
          expect(res.text).toBe('Not Found');
        }
      }
    });

    it('não sai da pasta do dist (travessia de diretório)', async () => {
      for (const p of ['/assets/..%2f..%2fdist%2fassets%2fapp-abc123.js', '/%2e%2e/dist/assets/app-abc123.js', '/..%2fdist-cnpj%2findex.html', '/icons/..%2f..%2fdist-cnpj%2fsw.js']) {
        const res = await get(CPF, p);
        expect(res.status, p).not.toBe(200);
        expect(res.text ?? '', p).not.toContain('asset');
        expect(res.text ?? '', p).not.toContain('spa-fixture-cnpj');
      }
    });

    it('pasta não vira redirecionamento nem listagem', async () => {
      for (const p of ['/icons', '/icons/', '/assets', '/assets/']) {
        const res = await get(CPF, p);
        expect(res.status, p).toBe(404);
        expect(res.headers.location, p).toBeUndefined();
      }
    });
  });

  describe('o resto do app continua igual', () => {
    it('/api continua com a API, nos dois hosts', async () => {
      for (const host of [CNPJ, CPF]) {
        const session = await get(host, '/api/session');
        expect(session.status).toBe(200);
        expect(session.body).toEqual({ session: null });
        const unknown = await get(host, '/api/nao-existe');
        expect(unknown.status).toBe(404);
        expect(unknown.headers['content-type']).toMatch(/application\/json/);
        expect(unknown.body.error.code).toBe('NOT_FOUND');
        expect((await get(host, '/api/me')).status).toBe(401);
      }
    });

    it('host desconhecido segue 404 neutro e host de redirecionamento segue 301', async () => {
      const stranger = await get('x.up.railway.app', '/');
      expect(stranger.status).toBe(404);
      expect(stranger.text).toBe('Not Found');
      const moved = await get('temcpf.com.br', '/onboarding?utm_source=x');
      expect(moved.status).toBe(301);
      expect(moved.headers.location).toBe('https://cpf.temcnpj.com.br/onboarding?utm_source=x');
    });

    it('/api/health responde 200 em qualquer host', async () => {
      for (const host of [CNPJ, CPF, 'x.up.railway.app', 'temcpf.com.br']) expect((await get(host, '/api/health')).status, host).toBe(200);
    });
  });
});

describe('SPA por área · build ausente', () => {
  let webDist;
  afterAll(() => removeWebDist(webDist));

  it('área sem dist-<área> responde 404 neutro, sem derrubar a outra', async () => {
    webDist = makeWebDist();
    fs.rmSync(path.join(path.dirname(webDist), 'dist-cpf'), { recursive: true });
    const { app } = areaApp({ ...HOSTS }, { webDist });
    const cpf = await request(app).get('/').set('Host', CPF);
    expect(cpf.status).toBe(404);
    expect(cpf.text).toBe('Not Found');
    expect((await request(app).get('/app/radar').set('Host', CPF)).status).toBe(404);
    const cnpj = await request(app).get('/').set('Host', CNPJ);
    expect(cnpj.status).toBe(200);
    expect(cnpj.text).toContain('spa-fixture-cnpj');
  });

  it('o admin sem dist-admin (esta etapa) responde 404 neutro', async () => {
    webDist = makeWebDist();
    const { app } = areaApp({ ...HOSTS, ADMIN_HOST: 'admin.temcnpj.com.br' }, { webDist });
    const res = await request(app).get('/app/admin').set('Host', 'admin.temcnpj.com.br');
    expect(res.status).toBe(404);
    expect(res.text).toBe('Not Found');
  });
});

describe('SPA por área · modo legado', () => {
  let webDist;
  beforeAll(() => {
    webDist = makeWebDist();
  });
  afterAll(() => removeWebDist(webDist));

  it('serve só o dist/ legado e ignora as pastas de área, em qualquer host', async () => {
    const { app } = areaApp({}, { webDist });
    for (const host of ['localhost:5173', CPF, CNPJ]) {
      const page = await request(app).get('/app/radar').set('Host', host);
      expect(page.status, host).toBe(200);
      expect(page.text).toContain('<title>spa-fixture</title>');
      const own = await request(app).get('/assets/app-abc123.js').set('Host', host);
      expect(own.text).toContain('asset legacy');
      // O asset da área não existe em dist/: o legado cai no index.html, nunca no arquivo da área.
      const foreign = await request(app).get('/assets/cnpj-abc123.js').set('Host', host);
      expect(foreign.text).not.toContain('asset cnpj');
      expect(textOf(await request(app).get('/icons/so-cnpj.png').set('Host', host))).not.toBe('so cnpj');
    }
  });
});
