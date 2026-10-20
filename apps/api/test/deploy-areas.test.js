import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AREA_HOST_VARS, REDIRECT_HOST_VARS, urlFor } from '@autopix/areas';
import { HOSTS, PRODUCTION_ENV, areaApp } from './areaHelpers.js';
import { ROOT } from './dbUrl.js';
import { testConfig } from './helpers.js';

// ETAPA 7, item 3 · deploy pronto, sem publicar. Estes testes seguram o que docs/divisao/DEPLOY_AREAS.md
// promete: o build que o Railway roda gera as duas áreas, o healthcheck passa em modo de áreas, os
// apelidos de domínio fazem 301 (com https, como em produção) e o worker monta os mesmos links.
// Nada aqui toca em .railway/railway.ts (só o lê) nem em rede.

const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const pkg = JSON.parse(read('package.json'));
const railway = read('.railway/railway.ts');
const doc = read('docs/divisao/DEPLOY_AREAS.md');

/** Produção, modo de áreas, com os cinco hostnames do plano. */
const app = () => areaApp({ ...PRODUCTION_ENV, ...HOSTS }).app;

describe('build e partida que o Railway roda', () => {
  it('o script build gera o legado E os builds das duas áreas (sem isso o modo de áreas serve 404)', () => {
    expect(pkg.scripts.build).toContain('prisma generate');
    expect(pkg.scripts.build).toContain('npm run build -w @autopix/web');
    expect(pkg.scripts.build).toContain('npm run build:areas');
    expect(pkg.scripts['build:areas']).toBe('npm run build:areas -w @autopix/web');
  });

  it('o railway.ts chama esse script no web e no worker, migra antes do web e checa /api/health', () => {
    expect(railway.match(/build: 'npm run build'/g)).toHaveLength(2);
    expect(railway).toContain("start: 'npm run start'");
    expect(railway).toContain("start: 'npm run start:worker'");
    expect(railway.match(/preDeploy: 'npm run db:migrate'/g)).toHaveLength(1);
    expect(railway).toContain("healthcheck: '/api/health'");
    expect(pkg.scripts['db:migrate']).toBe('prisma migrate deploy');
  });

  it('um único serviço web: o railway.ts não declara um segundo serviço de site', () => {
    expect(railway.match(/service\('autopix-web'/g)).toHaveLength(1);
    expect(railway.match(/service\('autopix-worker'/g)).toHaveLength(1);
    expect(railway.match(/\bservice\(/g)).toHaveLength(2);
  });
});

describe('o healthcheck e os webhooks passam em modo de áreas, em qualquer host', () => {
  it('/api/health responde 200 com o Host do healthcheck do Railway e com o domínio *.up.railway.app', async () => {
    for (const host of ['healthcheck.railway.app', 'autopix-web-production.up.railway.app', '127.0.0.1:8080']) {
      const res = await request(app()).get('/api/health').set('Host', host);
      expect(res.status, host).toBe(200);
      expect(res.body.status, host).toBe('ok');
    }
  });

  it('o domínio antigo não serve o site, mas os webhooks de pagamento seguem chegando', async () => {
    const stranger = 'autopix-web-production.up.railway.app';
    expect((await request(app()).get('/').set('Host', stranger)).status).toBe(404);
    expect((await request(app()).get('/api/me').set('Host', stranger)).status).toBe(404);
    // A verificação do webhook de WhatsApp responde (403 sem o token certo), não 404 de host.
    expect((await request(app()).get('/api/webhooks/whatsapp').set('Host', stranger)).status).toBe(403);
  });
});

describe('301 dos apelidos, em produção (https)', () => {
  it('exemplo da ARQUITETURA seção 9: temcpf.com.br/onboarding?utm_source=x -> cpf.temcnpj.com.br, caminho e consulta mantidos', async () => {
    const res = await request(app()).get('/onboarding?utm_source=x').set('Host', 'temcpf.com.br');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('https://cpf.temcnpj.com.br/onboarding?utm_source=x');
  });

  it('temcpf.com.br e www.temcpf.com.br vão para o host do CPF; www.temcnpj.com.br, para o apex do CNPJ', async () => {
    const cases = [
      ['temcpf.com.br', 'https://cpf.temcnpj.com.br'],
      ['www.temcpf.com.br', 'https://cpf.temcnpj.com.br'],
      ['www.temcnpj.com.br', 'https://temcnpj.com.br'],
    ];
    for (const [alias, target] of cases) {
      for (const p of ['/', '/login', '/activate/abc123', '/app/social?x=1&y=2', '/api/me']) {
        for (const method of ['get', 'head', 'post']) {
          const res = await request(app())[method](p).set('Host', alias);
          expect(res.status, `${method} ${alias}${p}`).toBe(301);
          expect(res.headers.location, `${method} ${alias}${p}`).toBe(`${target}${p}`);
        }
      }
    }
  });

  it('o apelido nunca serve conteúdo nem define cookie, e a maiúscula do host não escapa', async () => {
    const res = await request(app()).get('/onboarding').set('Host', 'TEMCPF.COM.BR');
    expect(res.status).toBe(301);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.text ?? '').not.toContain('<html');
  });

  it('o apex e o cpf. não redirecionam: são as áreas', async () => {
    for (const host of ['temcnpj.com.br', 'cpf.temcnpj.com.br']) {
      const res = await request(app()).get('/api/session').set('Host', host);
      expect(res.status, host).toBe(200);
      expect(res.headers.location, host).toBeUndefined();
    }
  });
});

describe('o worker lê o mesmo conjunto de variáveis do web', () => {
  const env = { ...PRODUCTION_ENV, ...HOSTS };

  it('com as mesmas variáveis, o modo de áreas liga e os links do worker usam os hosts novos em https', () => {
    const config = testConfig(env);
    expect(config.areas.enabled).toBe(true);
    expect(urlFor('CPF', '/activate/abc', config)).toBe('https://cpf.temcnpj.com.br/activate/abc');
    expect(urlFor('CNPJ', '/reset-password/abc', config)).toBe('https://temcnpj.com.br/reset-password/abc');
  });

  it('sem as variáveis (o worker sem elas) os links seguem o APP_URL: é por isso que as duas pontas precisam do conjunto', () => {
    const config = testConfig({ ...PRODUCTION_ENV });
    expect(config.areas.enabled).toBe(false);
    expect(urlFor('CPF', '/activate/abc', config)).toBe('https://tempix.up.railway.app/activate/abc');
  });

  it('com só um dos dois hosts a partida falha (web e worker recusam subir isolados pela metade)', () => {
    expect(() => testConfig({ ...PRODUCTION_ENV, PUBLIC_HOST_CNPJ: 'temcnpj.com.br' })).toThrow(/PUBLIC_HOST_CPF/);
    expect(() => testConfig({ ...PRODUCTION_ENV, PUBLIC_HOST_CPF: 'cpf.temcnpj.com.br' })).toThrow(/PUBLIC_HOST_CNPJ/);
  });

  it('o worker registra no log se as áreas estão ligadas (item de conferência do go-live)', () => {
    expect(read('packages/core/src/engine/worker.js')).toContain("areas: config.areas.enabled ? 'on' : 'off'");
    expect(read('apps/api/src/server.js')).toContain("areas: config.areas.enabled ? 'on' : 'off'");
  });
});

describe('DEPLOY_AREAS.md e .env.example dizem o que o código faz', () => {
  it('o guia cita as variáveis, os cinco hostnames, o ADMIN_HOST opcional e o 301', () => {
    for (const name of [...Object.values(AREA_HOST_VARS), ...Object.values(REDIRECT_HOST_VARS)]) expect(doc, name).toContain(name);
    for (const host of ['temcnpj.com.br', 'www.temcnpj.com.br', 'cpf.temcnpj.com.br', 'temcpf.com.br', 'www.temcpf.com.br']) expect(doc, host).toContain(`\`${host}\``);
    expect(doc).toContain('https://cpf.temcnpj.com.br/onboarding?utm_source=x');
    expect(doc).toContain('autopix-web');
    expect(doc).toContain('autopix-worker');
  });

  it('o guia cita a migração, o backup antes dela e o rollback R1 a R4', () => {
    expect(doc).toContain('20261020120000_area_isolation');
    expect(doc).toMatch(/pg_dump/);
    expect(doc).toMatch(/pg_restore/);
    for (const level of ['R1', 'R2', 'R3', 'R4']) expect(doc, level).toMatch(new RegExp(`\\*\\*${level}\\b`));
    // A ordem: o backup vem antes da migração, e a migração antes de ligar o modo de áreas.
    const at = (text) => doc.indexOf(text);
    const steps = ['### Passo 1 · Backup do banco', '### Passo 2 · Migração', '### Passo 3 · Deploy em modo legado', '### Passo 4 · Domínios e DNS', '### Passo 5 · Ligar o modo de áreas'];
    for (const step of steps) expect(at(step), step).toBeGreaterThan(-1);
    expect(steps.map(at)).toEqual([...steps.map(at)].sort((a, b) => a - b));
  });

  it('o guia não traz segredo: nenhuma URL com senha, nenhuma chave longa colada', () => {
    expect(doc).not.toMatch(/\w+:\/\/[^\s/:@]+:[^\s/@]+@/);
    expect(doc).not.toMatch(/[A-Za-z0-9_-]{40,}/);
  });

  it('o migrate da área é a migração aditiva que o guia descreve', () => {
    const sql = read('prisma/migrations/20261020120000_area_isolation/migration.sql');
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE|RENAME)\b/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS/);
  });

  it('o .env.example documenta as variáveis de host (comentadas: o legado segue por padrão)', () => {
    const example = read('.env.example');
    for (const name of [...Object.values(AREA_HOST_VARS), ...Object.values(REDIRECT_HOST_VARS)]) expect(example, name).toContain(name);
    expect(example).not.toMatch(/^PUBLIC_HOST_CNPJ=/m);
    expect(example).not.toMatch(/^PUBLIC_HOST_CPF=/m);
  });
});
