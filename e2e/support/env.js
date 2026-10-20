// Constantes do ponta a ponta (Playwright). Um lugar só para o que o servidor, o navegador e os testes dividem.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTestDatabaseUrl } from '../../apps/api/test/dbUrl.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Os nomes de produção. O navegador os resolve para 127.0.0.1 (--host-resolver-rules); nada sai da máquina. */
export const HOST_CNPJ = 'temcnpj.com.br';
export const HOST_CPF = 'cpf.temcnpj.com.br';
export const REDIRECT_CNPJ = ['www.temcnpj.com.br'];
export const REDIRECT_CPF = ['temcpf.com.br', 'www.temcpf.com.br'];

/** Porta do servidor de teste. Os nomes acima não levam porta: o navegador a troca por esta. */
export const PORT = Number(process.env.E2E_PORT) || 3917;

export const url = (host, pathname = '/') => `http://${host}${pathname}`;

/**
 * Regras do navegador: cada nome público vai para o servidor local, na porta de teste. Com a porta
 * na regra, as URLs e a origem (Origin) ficam como em produção, sem porta, e o PUBLIC_HOST_* não precisa dela.
 */
export const HOST_RESOLVER_RULES = [HOST_CNPJ, HOST_CPF, ...REDIRECT_CNPJ, ...REDIRECT_CPF].map((host) => `MAP ${host} 127.0.0.1:${PORT}`).join(', ');

/** Chromium já instalado na máquina de desenvolvimento; no CI, o que o "playwright install" deixou. */
export function chromiumPath() {
  const fromEnv = process.env.PW_CHROMIUM_EXECUTABLE;
  if (fromEnv) return fromEnv;
  const local = '/opt/pw-browsers/chromium';
  return fs.existsSync(local) ? local : undefined;
}

/**
 * Banco do E2E: E2E_DATABASE_URL, ou o mesmo banco de teste da suíte da API (TEST_DATABASE_URL, ou
 * DATABASE_URL com "_test" no nome). Os testes gravam contas, então o nome TEM de conter "test".
 */
export function databaseUrl() {
  const found = process.env.E2E_DATABASE_URL || resolveTestDatabaseUrl();
  if (!found) {
    throw new Error('E2E sem banco: defina E2E_DATABASE_URL, TEST_DATABASE_URL ou DATABASE_URL (Postgres local, com "test" no nome do banco).');
  }
  const name = new URL(found).pathname.replace(/^\//, '');
  if (!name.includes('test')) throw new Error(`Recusado: o E2E grava dados e só roda em banco com "test" no nome (recebi "${name}").`);
  return found;
}

/** Variáveis do servidor de teste: os dois hosts de área, os apelidos de redirecionamento, nada de produção. */
export function serverEnv() {
  return {
    NODE_ENV: 'test',
    PORT: String(PORT),
    DATABASE_URL: databaseUrl(),
    PUBLIC_HOST_CNPJ: HOST_CNPJ,
    PUBLIC_HOST_CPF: HOST_CPF,
    PUBLIC_HOST_CNPJ_REDIRECT: REDIRECT_CNPJ.join(','),
    PUBLIC_HOST_CPF_REDIRECT: REDIRECT_CPF.join(','),
    PAYMENT_PROVIDER: 'mock',
    BILLING_MODEL: 'commission',
    DEMO_MODE: 'false',
    EMAIL_PROVIDER: 'console',
  };
}
