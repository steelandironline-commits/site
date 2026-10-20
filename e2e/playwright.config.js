// Ponta a ponta das duas áreas (ETAPA 7, item 2): `npm run test:e2e`.
//
// O servidor real (apps/api) sobe com PUBLIC_HOST_CNPJ=temcnpj.com.br e PUBLIC_HOST_CPF=cpf.temcnpj.com.br,
// servindo os builds de verdade (apps/web/dist-cnpj e dist-cpf: rode `npm run build:areas` antes). O Chromium
// resolve esses nomes para 127.0.0.1 com --host-resolver-rules, então as páginas abrem em http://temcnpj.com.br/
// e http://cpf.temcnpj.com.br/ como em produção, sem DNS e sem mexer em /etc/hosts.
//
// Navegador: PW_CHROMIUM_EXECUTABLE, ou /opt/pw-browsers/chromium se existir (nada é baixado), ou o que
// `npx playwright install chromium` deixou (é o que o CI faz).
import { defineConfig } from '@playwright/test';
import { HOST_CNPJ, HOST_RESOLVER_RULES, PORT, ROOT, chromiumPath, serverEnv } from './support/env.js';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  globalSetup: './global-setup.js',
  // Um servidor, um banco e testes que criam contas: nada em paralelo.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  forbidOnly: Boolean(process.env.CI),
  outputDir: '../test-results',
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : [['list']],
  use: {
    browserName: 'chromium',
    baseURL: `http://${HOST_CNPJ}`,
    locale: 'pt-BR',
    // O service worker guardaria páginas entre os testes; aqui o que vale é o que o servidor responde.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: chromiumPath(),
      args: [`--host-resolver-rules=${HOST_RESOLVER_RULES}`],
    },
  },
  webServer: {
    command: 'node apps/api/src/server.js',
    cwd: ROOT,
    // /api/health responde em qualquer host (infraestrutura), então dá para esperar pelo IP.
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: serverEnv(),
  },
});
