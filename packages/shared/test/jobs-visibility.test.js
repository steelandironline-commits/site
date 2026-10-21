import { describe, expect, it } from 'vitest';
import { TRANSVERSAL_CARGOS, canSeeJob, transversalCargo, transversalCargoTerms } from '../src/index.js';

const vaga = (area, title = 'Vaga') => ({ area, title });

describe('vagas · regra de visibilidade', () => {
  it('(a) a pessoa vê a vaga da própria área', () => {
    expect(canSeeJob(vaga('metalurgia', 'Soldador'), { workArea: 'metalurgia' })).toBe(true);
    expect(canSeeJob(vaga('eletrica', 'Eletricista'), { workArea: 'eletrica' })).toBe(true);
  });

  it('quem é de metalurgia não vê a vaga de elétrica, e o contrário', () => {
    expect(canSeeJob(vaga('eletrica', 'Eletricista'), { workArea: 'metalurgia', jobTitle: 'Soldador' })).toBe(false);
    expect(canSeeJob(vaga('metalurgia', 'Soldador'), { workArea: 'eletrica', jobTitle: 'Eletricista' })).toBe(false);
  });

  it('(b) a vaga de logística aparece para qualquer área', () => {
    for (const workArea of ['metalurgia', 'eletrica', 'saude', 'tecnologia', 'servicos_gerais', 'logistica']) {
      expect(canSeeJob(vaga('logistica', 'Almoxarife'), { workArea }), workArea).toBe(true);
    }
  });

  it('sem área no perfil, só as vagas transversais', () => {
    for (const person of [{}, { workArea: null }, { workArea: '' }, { workArea: 'nao_existe' }, undefined, null]) {
      expect(canSeeJob(vaga('logistica', 'Motorista'), person)).toBe(true);
      expect(canSeeJob(vaga('metalurgia', 'Soldador'), person)).toBe(false);
      expect(canSeeJob(vaga('servicos_gerais', 'Ajudante'), person)).toBe(false);
    }
  });

  it('sem área, o cargo transversal sozinho não abre vagas de outras áreas', () => {
    expect(canSeeJob(vaga('construcao', 'Motorista de betoneira'), { jobTitle: 'Motorista' })).toBe(false);
  });

  it('(c) cargo transversal no perfil: vê a vaga do mesmo cargo, mesmo classificada em outra área', () => {
    const person = { workArea: 'metalurgia', jobTitle: 'Operador de empilhadeira' };
    expect(canSeeJob(vaga('construcao', 'Operador de Empilhadeira - obra'), person)).toBe(true);
    expect(canSeeJob(vaga('saude', 'Motorista de ambulância'), person)).toBe(false); // outro cargo
    expect(canSeeJob(vaga('eletrica', 'Eletricista'), person)).toBe(false);
    expect(canSeeJob(vaga('saude', 'Motorista de ambulância'), { workArea: 'metalurgia', jobTitle: 'Motorista' })).toBe(true);
  });

  it('cargo comum no perfil não abre a regra (c)', () => {
    expect(canSeeJob(vaga('eletrica', 'Soldador'), { workArea: 'metalurgia', jobTitle: 'Soldador' })).toBe(false);
  });

  it('vaga sem área válida nunca aparece', () => {
    expect(canSeeJob(vaga('inventada'), { workArea: 'inventada' })).toBe(false);
    expect(canSeeJob(null, { workArea: 'saude' })).toBe(false);
    expect(canSeeJob({}, { workArea: 'saude' })).toBe(false);
  });
});

describe('vagas · cargos transversais', () => {
  it('reconhece os cargos de exemplo, com ou sem acento e no plural', () => {
    expect(transversalCargo('Motorista')).toBe('motorista');
    expect(transversalCargo('motoristas de caminhão')).toBe('motorista');
    expect(transversalCargo('Auxiliar de Logística')).toBe('auxiliar_logistica');
    expect(transversalCargo('auxiliar de logistica')).toBe('auxiliar_logistica');
    expect(transversalCargo('Almoxarife')).toBe('almoxarife');
    expect(transversalCargo('Operador de Empilhadeira')).toBe('operador_empilhadeira');
  });

  it('não confunde com outras profissões nem com palavra parecida', () => {
    expect(transversalCargo('Soldador')).toBeNull();
    expect(transversalCargo('')).toBeNull();
    expect(transversalCargo(undefined)).toBeNull();
    expect(transversalCargo('Motoristar')).toBeNull();
  });

  it('cada cargo expõe seus termos', () => {
    expect(TRANSVERSAL_CARGOS.map((c) => c.slug)).toEqual(expect.arrayContaining(['motorista', 'auxiliar_logistica', 'almoxarife', 'operador_empilhadeira']));
    expect(transversalCargoTerms('almoxarife')).toContain('almoxarife');
    expect(transversalCargoTerms('nao_existe')).toEqual([]);
  });
});
