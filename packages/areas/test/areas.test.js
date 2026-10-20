import { describe, it, expect } from 'vitest';
import { AREAS, AREA_HOST_VARS, REDIRECT_HOST_VARS, areaOf, isArea, parseHost, hostnameOf, hostFor } from '../src/index.js';

describe('areas', () => {
  it('declara as três áreas e a variável de host de cada uma', () => {
    expect(AREAS).toEqual(['CNPJ', 'CPF', 'ADMIN']);
    expect(Object.isFrozen(AREAS)).toBe(true);
    expect(AREA_HOST_VARS).toEqual({ CNPJ: 'PUBLIC_HOST_CNPJ', CPF: 'PUBLIC_HOST_CPF', ADMIN: 'ADMIN_HOST' });
    expect(REDIRECT_HOST_VARS).toEqual({ CNPJ: 'PUBLIC_HOST_CNPJ_REDIRECT', CPF: 'PUBLIC_HOST_CPF_REDIRECT' });
    expect(AREAS.every(isArea)).toBe(true);
    expect(isArea('cnpj')).toBe(false);
    expect(isArea(undefined)).toBe(false);
  });

  it('areaOf: COMPANY é CNPJ e PERSON é CPF', () => {
    expect(areaOf('COMPANY')).toBe('CNPJ');
    expect(areaOf('PERSON')).toBe('CPF');
  });

  it('areaOf falha fechado com qualquer outro valor', () => {
    for (const bad of [undefined, null, '', 'company', 'ADMIN', 'CNPJ', 'toString', '__proto__', 7, {}]) {
      expect(() => areaOf(bad)).toThrow(TypeError);
    }
  });

  it('parseHost aceita nome[:porta] e normaliza para minúsculas', () => {
    expect(parseHost('temcnpj.com.br')).toBe('temcnpj.com.br');
    expect(parseHost('  CPF.TemCNPJ.com.br ')).toBe('cpf.temcnpj.com.br');
    expect(parseHost('localhost:5173')).toBe('localhost:5173');
    expect(parseHost('cpf.localhost:5174')).toBe('cpf.localhost:5174');
    expect(parseHost('127.0.0.1:3000')).toBe('127.0.0.1:3000');
  });

  it('parseHost recusa esquema, caminho, espaços, ponto final e porta inválida', () => {
    for (const bad of [
      '',
      '   ',
      'https://temcnpj.com.br',
      'temcnpj.com.br/',
      'temcnpj.com.br/app',
      'tem cnpj.com.br',
      'temcnpj.com.br.',
      '.temcnpj.com.br',
      'tem..cnpj.com.br',
      '-temcnpj.com.br',
      'temcnpj.com.br:',
      'temcnpj.com.br:0',
      'temcnpj.com.br:70000',
      'tem_cnpj.com.br',
      'user@temcnpj.com.br',
      '[::1]',
      '*.temcnpj.com.br',
      undefined,
      null,
      42,
    ]) {
      expect(parseHost(bad), String(bad)).toBeNull();
    }
  });

  it('hostnameOf tira porta, ponto final e maiúsculas', () => {
    expect(hostnameOf('Temcnpj.com.br')).toBe('temcnpj.com.br');
    expect(hostnameOf('temcnpj.com.br.')).toBe('temcnpj.com.br');
    expect(hostnameOf('localhost:5173')).toBe('localhost');
    expect(hostnameOf('CPF.localhost:5174')).toBe('cpf.localhost');
    expect(hostnameOf(undefined)).toBe('');
  });

  it('hostFor lê o host da configuração de áreas', () => {
    const areas = { enabled: true, hosts: { CNPJ: 'a.example', CPF: 'b.example', ADMIN: null } };
    expect(hostFor('CNPJ', areas)).toBe('a.example');
    expect(hostFor('ADMIN', areas)).toBeNull();
    expect(hostFor('CPF', undefined)).toBeNull();
  });
});
