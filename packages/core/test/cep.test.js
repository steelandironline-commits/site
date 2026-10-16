import { describe, it, expect } from 'vitest';
import { CepService } from '../src/geo/cepService.js';

describe('CEP → cidade/UF', () => {
  it('returns the city from ViaCEP and caches it', async () => {
    const calls = [];
    const svc = new CepService({ fetchImpl: async (url) => (calls.push(url), { ok: true, status: 200, json: async () => ({ cep: '89201-000', localidade: 'Joinville', uf: 'SC', bairro: 'Centro' }) }) });
    expect(await svc.lookup('89201-000')).toEqual({ cep: '89201000', city: 'Joinville', state: 'SC', district: 'Centro' });
    await svc.lookup('89201000');
    expect(calls).toEqual(['https://viacep.com.br/ws/89201000/json/']);
  });

  it('says when a CEP does not exist, and when the service is down', async () => {
    expect(await new CepService({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ erro: true }) }) }).lookup('00000000')).toBeNull();
    expect(await new CepService({ fetchImpl: async () => ({ ok: true }) }).lookup('123')).toBeNull();
    await expect(new CepService({ fetchImpl: async () => { throw new Error('net'); } }).lookup('89201000')).rejects.toMatchObject({ unavailable: true });
  });
});
