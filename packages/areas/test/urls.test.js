import { describe, it, expect } from 'vitest';
import { urlFor } from '../src/index.js';

const areas = (overrides = {}) => ({
  enabled: true,
  hosts: { CNPJ: 'temcnpj.com.br', CPF: 'cpf.temcnpj.com.br', ADMIN: null },
  redirects: [],
  ...overrides,
});

describe('urlFor', () => {
  it('usa https em produção e http fora dela', () => {
    const prod = { isProduction: true, appUrl: 'https://app.example', areas: areas() };
    const dev = { isProduction: false, appUrl: 'http://localhost:5173', areas: areas() };
    expect(urlFor('CNPJ', '/login', prod)).toBe('https://temcnpj.com.br/login');
    expect(urlFor('CPF', '/login', prod)).toBe('https://cpf.temcnpj.com.br/login');
    expect(urlFor('CNPJ', '/login', dev)).toBe('http://temcnpj.com.br/login');
  });

  it('mantém a porta configurada', () => {
    const dev = {
      isProduction: false,
      appUrl: 'http://localhost:5173',
      areas: areas({ hosts: { CNPJ: 'localhost:5173', CPF: 'cpf.localhost:5174', ADMIN: null } }),
    };
    expect(urlFor('CPF', '/activate/abc', dev)).toBe('http://cpf.localhost:5174/activate/abc');
  });

  it('mantém consulta e âncora e completa a barra inicial', () => {
    const cfg = { isProduction: true, appUrl: 'https://x.example', areas: areas() };
    expect(urlFor('CNPJ', '/reset-password/t?x=1#top', cfg)).toBe('https://temcnpj.com.br/reset-password/t?x=1#top');
    expect(urlFor('CNPJ', 'app', cfg)).toBe('https://temcnpj.com.br/app');
    expect(urlFor('CNPJ', '', cfg)).toBe('https://temcnpj.com.br/');
    expect(urlFor('CNPJ', undefined, cfg)).toBe('https://temcnpj.com.br/');
  });

  it('nunca sai do host da área, mesmo com caminho esquisito', () => {
    const cfg = { isProduction: true, appUrl: 'https://x.example', areas: areas() };
    for (const path of ['//evil.example/x', '@evil.example', 'https://evil.example', '\\\\evil.example']) {
      const url = new URL(urlFor('CPF', path, cfg));
      expect(url.hostname).toBe('cpf.temcnpj.com.br');
    }
  });

  it('no modo legado usa o APP_URL, como os links de hoje', () => {
    const legacy = { isProduction: true, appUrl: 'https://tempix.up.railway.app', areas: { enabled: false, hosts: { CNPJ: null, CPF: null, ADMIN: null }, redirects: [] } };
    expect(urlFor('CNPJ', '/login', legacy)).toBe('https://tempix.up.railway.app/login');
    expect(urlFor('CPF', '/login', legacy)).toBe('https://tempix.up.railway.app/login');
    expect(urlFor('CPF', '/x', { isProduction: true, appUrl: 'https://tempix.up.railway.app/' })).toBe('https://tempix.up.railway.app/x');
  });

  it('ADMIN sem ADMIN_HOST cai no host CNPJ; com ADMIN_HOST usa o próprio', () => {
    const base = { isProduction: true, appUrl: 'https://x.example' };
    expect(urlFor('ADMIN', '/app/admin', { ...base, areas: areas() })).toBe('https://temcnpj.com.br/app/admin');
    const withAdmin = areas({ hosts: { CNPJ: 'temcnpj.com.br', CPF: 'cpf.temcnpj.com.br', ADMIN: 'admin.example.com' } });
    expect(urlFor('ADMIN', '/app/admin', { ...base, areas: withAdmin })).toBe('https://admin.example.com/app/admin');
  });

  it('recusa área desconhecida e área sem host no modo de áreas', () => {
    const cfg = { isProduction: true, appUrl: 'https://x.example', areas: areas() };
    expect(() => urlFor('cnpj', '/', cfg)).toThrow(TypeError);
    expect(() => urlFor(undefined, '/', cfg)).toThrow(TypeError);
    const broken = { ...cfg, areas: areas({ hosts: { CNPJ: 'a.example', CPF: null, ADMIN: null } }) };
    expect(() => urlFor('CPF', '/', broken)).toThrow(/CPF/);
  });
});
