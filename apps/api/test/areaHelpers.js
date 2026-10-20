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

/** Pasta com um "SPA" mínimo, para os testes não dependerem de um build em apps/web/dist. */
export function makeWebDist() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tempix-spa-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>spa-fixture</title><div id="root"></div>');
  fs.writeFileSync(path.join(dir, 'assets', 'app-abc123.js'), 'console.log("asset");');
  fs.writeFileSync(path.join(dir, 'sw.js'), 'self.addEventListener("fetch",()=>{});');
  fs.writeFileSync(path.join(dir, 'manifest.webmanifest'), '{"name":"fixture"}');
  fs.writeFileSync(path.join(dir, 'robots.txt'), 'User-agent: *\n');
  return dir;
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
