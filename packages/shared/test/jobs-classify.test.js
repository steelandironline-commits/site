import { describe, expect, it } from 'vitest';
import { DEFAULT_JOB_AREA, JOB_AREAS, JOB_AREA_SLUGS, TRANSVERSAL_JOB_AREAS, classifyJobArea, isJobArea, isTransversalJobArea, jobAreaName } from '../src/index.js';

describe('vagas · lista fixa de áreas', () => {
  it('tem as 16 áreas combinadas, cada uma com slug e nome', () => {
    expect(JOB_AREA_SLUGS).toEqual([
      'metalurgia', 'eletrica', 'mecanica', 'construcao', 'logistica', 'saude', 'alimentacao', 'comercio',
      'administrativo', 'tecnologia', 'limpeza', 'seguranca', 'agropecuaria', 'educacao', 'servicos_gerais', 'hospitalidade',
    ]);
    for (const area of JOB_AREAS) expect(area.name.length, area.slug).toBeGreaterThan(2);
    expect(new Set(JOB_AREA_SLUGS).size).toBe(16);
  });

  it('só a logística é transversal', () => {
    expect(TRANSVERSAL_JOB_AREAS).toEqual(['logistica']);
    expect(isTransversalJobArea('logistica')).toBe(true);
    expect(isTransversalJobArea('eletrica')).toBe(false);
    expect(isTransversalJobArea('qualquer')).toBe(false);
  });

  it('isJobArea e jobAreaName só reconhecem a lista', () => {
    expect(isJobArea('saude')).toBe(true);
    expect(isJobArea('Saude')).toBe(false);
    expect(isJobArea('constructor')).toBe(false);
    expect(isJobArea(null)).toBe(false);
    expect(jobAreaName('saude')).toBe('Saúde');
    expect(jobAreaName('nao_existe')).toBeNull();
  });

  it('nenhum nome de área cita o CNPJ', () => {
    for (const area of JOB_AREAS) expect(area.name).not.toMatch(/cnpj/i);
  });
});

describe('vagas · classificação da área pelo título', () => {
  const cases = [
    ['Soldador MIG/MAG', 'metalurgia'],
    ['Caldeireiro', 'metalurgia'],
    ['Torneiro Mecânico', 'metalurgia'], // "torneiro" vem antes de "mecânico"
    ['Eletricista Industrial', 'eletrica'],
    ['Técnico em Eletrotécnica', 'eletrica'],
    ['Mecânico de Refrigeração', 'mecanica'],
    ['Mecânico de Manutenção Industrial', 'mecanica'],
    ['Pedreiro', 'construcao'],
    ['Mestre de Obras', 'construcao'],
    ['Motorista Carreteiro', 'logistica'],
    ['Motorista de caminhão betoneira', 'logistica'], // o cargo vem primeiro
    ['Auxiliar de Logística', 'logistica'],
    ['Almoxarife', 'logistica'],
    ['Operador de Empilhadeira', 'logistica'],
    ['Técnico de Enfermagem', 'saude'],
    ['Enfermeira', 'saude'],
    ['Cozinheira', 'alimentacao'],
    ['Auxiliar de cozinha', 'alimentacao'],
    ['Vendedora Externa', 'comercio'],
    ['Operador de Caixa', 'comercio'],
    ['Auxiliar Administrativo', 'administrativo'],
    ['Assistente Financeiro', 'administrativo'],
    ['Analista de Sistemas', 'tecnologia'],
    ['Desenvolvedor Front-end', 'tecnologia'],
    ['Auxiliar de Limpeza', 'limpeza'],
    ['Faxineira', 'limpeza'],
    ['Vigilante', 'seguranca'],
    ['Técnico de Segurança do Trabalho', 'seguranca'],
    ['Tratorista', 'agropecuaria'],
    ['Médico Veterinário', 'agropecuaria'],
    ['Professora de Inglês', 'educacao'],
    ['Auxiliar de Serviços Gerais', 'servicos_gerais'],
    ['Jardineiro', 'servicos_gerais'],
    ['Camareira', 'hospitalidade'],
    ['Recepcionista de Hotel', 'hospitalidade'],
    ['Recepcionista', 'administrativo'],
    ['Médico Plantonista', 'saude'],
  ];
  for (const [title, area] of cases) {
    it(`"${title}" é ${area}`, () => {
      expect(classifyJobArea(title)).toBe(area);
    });
  }

  it('aceita plural, feminino e acento ou não', () => {
    expect(classifyJobArea('SOLDADORES')).toBe('metalurgia');
    expect(classifyJobArea('soldadora')).toBe('metalurgia');
    expect(classifyJobArea('Eletricístas')).toBe('eletrica');
    expect(classifyJobArea('Eletricistamente')).toBe('servicos_gerais'); // só palavra inteira
    expect(classifyJobArea('Cozinheiros')).toBe('alimentacao');
    expect(classifyJobArea('Auxiliar de Logistica')).toBe('logistica');
  });

  it('o título pesa mais do que a descrição', () => {
    expect(classifyJobArea('Soldador', 'Empresa de logística e transporte com frete e armazém')).toBe('metalurgia');
  });

  it('palavra solta da descrição não decide: precisa de duas palavras-chave da mesma área', () => {
    expect(classifyJobArea('Auxiliar', 'Controle de estoque da loja.')).toBe(DEFAULT_JOB_AREA);
    expect(classifyJobArea('Auxiliar', 'Controle de estoque e conferente de carga, no armazém.')).toBe('logistica');
  });

  it('palavra ambígua não leva a vaga a uma área ("mão de obra", "vale transporte", "normas de segurança")', () => {
    expect(classifyJobArea('Operador de produção', 'Vale transporte, mão de obra qualificada e normas de segurança.')).toBe(DEFAULT_JOB_AREA);
  });

  it('sem área clara, a vaga é de serviços gerais', () => {
    expect(classifyJobArea('Gerente')).toBe('servicos_gerais');
    expect(classifyJobArea('')).toBe('servicos_gerais');
    expect(classifyJobArea(undefined, undefined)).toBe('servicos_gerais');
    expect(classifyJobArea('Atendente', 'Boa comunicação.')).toBe('servicos_gerais');
  });

  it('só lê o começo da descrição', () => {
    const noise = 'texto livre '.repeat(400);
    expect(classifyJobArea('Auxiliar', `${noise} soldador caldeireiro`)).toBe('servicos_gerais');
  });
});
