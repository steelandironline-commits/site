import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '@autopix/core';
import { urlFor } from '@autopix/areas';

const serverFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/server.js');

const base = { NODE_ENV: 'test' };
const load = (extra = {}) => loadConfig({ ...base, ...extra });

const PRODUCTION = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/tempix_test',
  APP_URL: 'https://tempix.up.railway.app',
  SESSION_SECRET: 'test-session-secret-0123456789abcdef0123456789',
  ACTIVATION_TOKEN_SECRET: 'test-activation-secret-0123456789abcdef012345',
  PASSWORD_RESET_SECRET: 'test-reset-secret-0123456789abcdef0123456789',
  PAYMENT_PROVIDER: 'none',
};

describe('T1 · config das áreas', () => {
  it('sem variáveis: modo legado, e o resto da configuração fica como estava', () => {
    const cfg = load();
    expect(cfg.areas.enabled).toBe(false);
    expect(cfg.areas.hosts).toEqual({ CNPJ: null, CPF: null, ADMIN: null });
    expect(cfg.areas.redirects).toEqual([]);
    expect(cfg.session.cookieName).toBe('ap_session');
    expect(cfg.appUrl).toBe('http://localhost:5173');
    expect(cfg.apiUrl).toBe('http://localhost:3000');
  });

  it('variáveis vazias (como o painel pode deixar) contam como ausentes', () => {
    const cfg = load({ PUBLIC_HOST_CNPJ: '', PUBLIC_HOST_CPF: '  ', PUBLIC_HOST_CNPJ_REDIRECT: '', PUBLIC_HOST_CPF_REDIRECT: ' , ', ADMIN_HOST: '' });
    expect(cfg.areas.enabled).toBe(false);
    expect(cfg.areas.redirects).toEqual([]);
  });

  it('só PUBLIC_HOST_CNPJ: erro na partida, com mensagem clara', () => {
    expect(() => load({ PUBLIC_HOST_CNPJ: 'temcnpj.com.br' })).toThrow(/PUBLIC_HOST_CNPJ is set but PUBLIC_HOST_CPF is not/);
    expect(() => load({ PUBLIC_HOST_CNPJ: 'temcnpj.com.br' })).toThrow(/Invalid environment configuration/);
  });

  it('só PUBLIC_HOST_CPF: erro na partida, com mensagem clara', () => {
    expect(() => load({ PUBLIC_HOST_CPF: 'cpf.temcnpj.com.br' })).toThrow(/PUBLIC_HOST_CPF is set but PUBLIC_HOST_CNPJ is not/);
  });

  it('as duas juntas: modo de áreas ligado, com os hosts certos', () => {
    const cfg = load({ PUBLIC_HOST_CNPJ: 'temcnpj.com.br', PUBLIC_HOST_CPF: 'cpf.temcnpj.com.br' });
    expect(cfg.areas.enabled).toBe(true);
    expect(cfg.areas.hosts).toEqual({ CNPJ: 'temcnpj.com.br', CPF: 'cpf.temcnpj.com.br', ADMIN: null });
    expect(cfg.areas.redirects).toEqual([]);
    // O cookie é assunto da ETAPA 4: continua igual.
    expect(cfg.session.cookieName).toBe('ap_session');
  });

  it('lê redirecionamentos (lista com vírgula) e ADMIN_HOST, em minúsculas e sem repetição', () => {
    const cfg = load({
      PUBLIC_HOST_CNPJ: 'TemCNPJ.com.br',
      PUBLIC_HOST_CPF: 'cpf.temcnpj.com.br',
      PUBLIC_HOST_CNPJ_REDIRECT: 'www.temcnpj.com.br',
      PUBLIC_HOST_CPF_REDIRECT: ' temcpf.com.br , WWW.temcpf.com.br,temcpf.com.br,, ',
      ADMIN_HOST: 'admin.temcnpj.com.br',
    });
    expect(cfg.areas.hosts).toEqual({ CNPJ: 'temcnpj.com.br', CPF: 'cpf.temcnpj.com.br', ADMIN: 'admin.temcnpj.com.br' });
    expect(cfg.areas.redirects).toEqual([
      { host: 'www.temcnpj.com.br', area: 'CNPJ' },
      { host: 'temcpf.com.br', area: 'CPF' },
      { host: 'www.temcpf.com.br', area: 'CPF' },
    ]);
  });

  it('a configuração de áreas não pode ser alterada depois de carregada', () => {
    const cfg = load({ PUBLIC_HOST_CNPJ: 'temcnpj.com.br', PUBLIC_HOST_CPF: 'cpf.temcnpj.com.br', PUBLIC_HOST_CPF_REDIRECT: 'temcpf.com.br' });
    expect(Object.isFrozen(cfg.areas)).toBe(true);
    expect(Object.isFrozen(cfg.areas.hosts)).toBe(true);
    expect(Object.isFrozen(cfg.areas.redirects)).toBe(true);
    expect(Object.isFrozen(cfg.areas.redirects[0])).toBe(true);
  });

  it('aceita porta (desenvolvimento) e compara só o nome do host', () => {
    const cfg = load({ PUBLIC_HOST_CNPJ: 'localhost:5173', PUBLIC_HOST_CPF: 'cpf.localhost:5174' });
    expect(cfg.areas.enabled).toBe(true);
    expect(cfg.areas.hosts.CNPJ).toBe('localhost:5173');
    expect(cfg.areas.hosts.CPF).toBe('cpf.localhost:5174');
    expect(() => load({ PUBLIC_HOST_CNPJ: 'localhost:5173', PUBLIC_HOST_CPF: 'localhost:5174' })).toThrow(/host "localhost" is used by both/);
  });

  it('recusa valor que não é host, citando a variável', () => {
    for (const [name, value] of [
      ['PUBLIC_HOST_CNPJ', 'https://temcnpj.com.br'],
      ['PUBLIC_HOST_CPF', 'cpf.temcnpj.com.br/app'],
      ['ADMIN_HOST', 'admin temcnpj.com.br'],
      ['PUBLIC_HOST_CNPJ_REDIRECT', 'www.temcnpj.com.br,http://x.example'],
      ['PUBLIC_HOST_CPF_REDIRECT', '*.temcpf.com.br'],
    ]) {
      const env = { PUBLIC_HOST_CNPJ: 'temcnpj.com.br', PUBLIC_HOST_CPF: 'cpf.temcnpj.com.br', [name]: value };
      expect(() => load(env), name).toThrow(new RegExp(name));
    }
  });

  it('recusa o mesmo host em dois papéis (CNPJ x CPF, área x redirecionamento, admin x área)', () => {
    const two = { PUBLIC_HOST_CNPJ: 'temcnpj.com.br', PUBLIC_HOST_CPF: 'cpf.temcnpj.com.br' };
    expect(() => load({ PUBLIC_HOST_CNPJ: 'a.example', PUBLIC_HOST_CPF: 'A.example' })).toThrow(/host "a.example" is used by both/);
    expect(() => load({ ...two, PUBLIC_HOST_CPF_REDIRECT: 'temcnpj.com.br' })).toThrow(/used by both PUBLIC_HOST_CNPJ and PUBLIC_HOST_CPF_REDIRECT/);
    expect(() => load({ ...two, PUBLIC_HOST_CNPJ_REDIRECT: 'x.example', PUBLIC_HOST_CPF_REDIRECT: 'x.example' })).toThrow(/used by both PUBLIC_HOST_CNPJ_REDIRECT and PUBLIC_HOST_CPF_REDIRECT/);
    expect(() => load({ ...two, ADMIN_HOST: 'cpf.temcnpj.com.br' })).toThrow(/used by both PUBLIC_HOST_CPF and ADMIN_HOST/);
  });

  it('ADMIN_HOST ou redirecionamento sem as duas áreas não é ignorado em silêncio', () => {
    expect(() => load({ ADMIN_HOST: 'admin.example' })).toThrow(/ADMIN_HOST has no effect without PUBLIC_HOST_CNPJ and PUBLIC_HOST_CPF/);
    expect(() => load({ PUBLIC_HOST_CPF_REDIRECT: 'temcpf.com.br' })).toThrow(/PUBLIC_HOST_CPF_REDIRECT has no effect/);
  });

  it('em produção os links usam https, e sem as variáveis seguem no APP_URL', () => {
    const on = loadConfig({ ...PRODUCTION, PUBLIC_HOST_CNPJ: 'temcnpj.com.br', PUBLIC_HOST_CPF: 'cpf.temcnpj.com.br' });
    expect(on.isProduction).toBe(true);
    expect(urlFor('CPF', '/login', on)).toBe('https://cpf.temcnpj.com.br/login');
    expect(urlFor('CNPJ', '/login', load({ PUBLIC_HOST_CNPJ: 'temcnpj.com.br', PUBLIC_HOST_CPF: 'cpf.temcnpj.com.br' }))).toBe('http://temcnpj.com.br/login');
    const off = loadConfig(PRODUCTION);
    expect(off.areas.enabled).toBe(false);
    expect(urlFor('CPF', '/login', off)).toBe('https://tempix.up.railway.app/login');
  });

  it('a partida do servidor falha com só uma das variáveis, antes de abrir porta ou banco', () => {
    const run = (env) =>
      spawnSync(process.execPath, [serverFile], { env: { NODE_ENV: 'test', ...env }, encoding: 'utf8', timeout: 30_000 });
    const half = run({ PUBLIC_HOST_CNPJ: 'temcnpj.com.br' });
    expect(half.status).toBe(1);
    expect(half.stderr).toMatch(/PUBLIC_HOST_CNPJ is set but PUBLIC_HOST_CPF is not/);
  });
});
