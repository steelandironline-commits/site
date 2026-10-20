import { describe, expect, it } from 'vitest';
import { BUNDLE_MARKERS, markersFor } from '../src/index.js';

// Os marcadores do isolamento de bundle: uma lista só, lida pelo teste de bundle (apps/web) e pela
// suíte de isolamento (apps/api/test/isolation). Aqui só se protege o formato da lista.

describe('BUNDLE_MARKERS', () => {
  it('tem as três listas, congeladas e sem repetição', () => {
    expect(Object.keys(BUNDLE_MARKERS).sort()).toEqual(['both', 'cnpj', 'cpf']);
    for (const list of Object.values(BUNDLE_MARKERS)) {
      expect(Object.isFrozen(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list).size).toBe(list.length);
    }
    expect(Object.isFrozen(BUNDLE_MARKERS)).toBe(true);
  });

  it('o CPF proíbe o vocabulário de empresa e o CNPJ o de pessoa, nunca o próprio nome', () => {
    expect(BUNDLE_MARKERS.cpf).toEqual(expect.arrayContaining(['Tem CNPJ', '/api/company', '/checkout']));
    expect(BUNDLE_MARKERS.cnpj).toEqual(expect.arrayContaining(['Tem CPF', '/api/profile']));
    expect(BUNDLE_MARKERS.cpf).not.toContain('Tem CPF');
    expect(BUNDLE_MARKERS.cnpj).not.toContain('Tem CNPJ');
  });

  it('"CPF" solto e "temcnpj" não são marcadores: o colaborador entra com CPF e o host do CPF contém temcnpj', () => {
    expect(BUNDLE_MARKERS.cnpj).not.toContain('CPF');
    for (const list of Object.values(BUNDLE_MARKERS)) expect(list.some((m) => /temcnpj/i.test(m))).toBe(false);
  });

  it('nenhuma das duas áreas serve o admin da plataforma', () => {
    expect(BUNDLE_MARKERS.both).toEqual(expect.arrayContaining(['/api/admin']));
  });
});

describe('markersFor', () => {
  it('junta os marcadores da área com os que valem para as duas, em qualquer caixa', () => {
    expect(markersFor('CPF')).toEqual([...BUNDLE_MARKERS.cpf, ...BUNDLE_MARKERS.both]);
    expect(markersFor('cnpj')).toEqual([...BUNDLE_MARKERS.cnpj, ...BUNDLE_MARKERS.both]);
  });

  it('recusa área sem marcadores (ADMIN não tem build) e valor que não é área', () => {
    for (const bad of ['ADMIN', 'admin', 'OUTRA', '', undefined, null]) expect(() => markersFor(bad), String(bad)).toThrow(TypeError);
  });
});
