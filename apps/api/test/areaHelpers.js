import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { EmailService } from '@autopix/core';
import { hostArea } from '../src/middleware/area.js';
import { buildServices, createApp } from '../src/app.js';
import { testConfig } from './helpers.js';

/** Hosts de exemplo da arquitetura. Os testes os injetam pela configuração; nada aqui depende de DNS. */
export const HOSTS = {
  PUBLIC_HOST_CNPJ: 'temcnpj.com.br',
  PUBLIC_HOST_CPF: 'cpf.temcnpj.com.br',
  PUBLIC_HOST_CNPJ_REDIRECT: 'www.temcnpj.com.br',
  PUBLIC_HOST_CPF_REDIRECT: 'temcpf.com.br,www.temcpf.com.br',
};

/** Variáveis mínimas para NODE_ENV=production sem banco nem gateway reais. */
export const PRODUCTION_ENV = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/tempix_test',
  APP_URL: 'https://tempix.up.railway.app',
  API_URL: 'https://tempix.up.railway.app',
  PAYMENT_PROVIDER: 'none',
};

/** Banco de mentira: basta para /api/health. Quem tocar em outra tabela falha alto. */
const stubPrisma = { $queryRaw: async () => [{ ok: 1 }] };

/** Um dist mínimo: HTML, um asset com hash, sw, manifest, robots, favicon e um ícone. `tag` distingue o dono. */
function writeDist(dir, tag, { assetName = 'app-abc123.js', title = 'spa-fixture' } = {}) {
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'icons'));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><title>${title}</title><div id="root"></div>`);
  fs.writeFileSync(path.join(dir, 'assets', assetName), `console.log("asset ${tag}");`);
  fs.writeFileSync(path.join(dir, 'sw.js'), `self.addEventListener("fetch",()=>{}); // ${tag}`);
  fs.writeFileSync(path.join(dir, 'manifest.webmanifest'), `{"name":"fixture ${tag}"}`);
  fs.writeFileSync(path.join(dir, 'robots.txt'), `User-agent: *\n# ${tag}\n`);
  fs.writeFileSync(path.join(dir, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg"><!-- ${tag} --></svg>`);
  fs.writeFileSync(path.join(dir, 'icons', 'icon-192.png'), `icon ${tag}`);
  fs.writeFileSync(path.join(dir, 'modules.json'), `{"area":"${tag}","modules":[]}`);
}

/**
 * Pasta com os "SPAs" mínimos, para os testes não dependerem de um build em apps/web:
 *   <tmp>/dist         legado (título "spa-fixture")
 *   <tmp>/dist-cnpj    área CNPJ (título "spa-fixture-cnpj", asset cnpj-abc123.js)
 *   <tmp>/dist-cpf     área CPF  (título "spa-fixture-cpf",  asset cpf-abc123.js)
 * Devolve o caminho do `dist` legado (o `webDist`); `removeWebDist` apaga tudo.
 */
export function makeWebDist() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tempix-spa-'));
  const legacy = path.join(root, 'dist');
  writeDist(legacy, 'legacy');
  writeDist(path.join(root, 'dist-cnpj'), 'cnpj', { assetName: 'cnpj-abc123.js', title: 'spa-fixture-cnpj' });
  writeDist(path.join(root, 'dist-cpf'), 'cpf', { assetName: 'cpf-abc123.js', title: 'spa-fixture-cpf' });
  fs.writeFileSync(path.join(root, 'dist-cnpj', 'icons', 'so-cnpj.png'), 'so cnpj');
  return legacy;
}

export function removeWebDist(webDist) {
  fs.rmSync(path.dirname(webDist), { recursive: true, force: true });
}

/** Aplicação real (createApp) sem banco, com as variáveis informadas. */
export function areaApp(env = {}, { webDist } = {}) {
  const config = testConfig(env);
  const services = buildServices({ config, prisma: stubPrisma, email: new EmailService({ config }) });
  const hub = { mode: 'test', subscribe: () => () => {} };
  const app = createApp({ services, hub, serveWeb: Boolean(webDist), webDist });
  return { app, config };
}

/** Só o hostArea, com uma rota que devolve `req.area`: prova a área escolhida sem depender do resto do app. */
export function probeApp(env = {}) {
  const config = testConfig(env);
  const app = express();
  app.set('trust proxy', 1); // como em createApp
  app.use(hostArea(config));
  app.use((req, res) => res.json({ reached: true, area: req.area }));
  return app;
}
