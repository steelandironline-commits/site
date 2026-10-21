import { describe, expect, it } from 'vitest';
import { extractSalary, formatMoney, parseMoney, salaryFromFields, salaryLabel } from '../src/index.js';

describe('vagas · valor em reais', () => {
  it('aceita "2.500", "2500", "R$ 2.500,00" e centavos', () => {
    expect(parseMoney('2.500')).toBe(2500);
    expect(parseMoney('2500')).toBe(2500);
    expect(parseMoney('R$ 2.500,00')).toBe(2500);
    expect(parseMoney('R$2500')).toBe(2500);
    expect(parseMoney('1.234,56')).toBe(1234.56);
    expect(parseMoney('15,50')).toBe(15.5);
    expect(parseMoney('15.5')).toBe(15.5);
    expect(parseMoney('1.234.567')).toBe(1234567);
    expect(parseMoney(3200)).toBe(3200);
  });

  it('recusa o que não é valor', () => {
    for (const bad of ['', 'abc', '12abc', '1,2,3', '1.2.3', null, undefined, NaN, -5, {}]) expect(parseMoney(bad), String(bad)).toBeNull();
  });
});

describe('vagas · salário no texto', () => {
  it('lê valor com R$, por mês', () => {
    expect(extractSalary('Salário: R$ 2.500,00 por mês + benefícios')).toEqual({ min: 2500, max: 2500, period: 'MES' });
    expect(extractSalary('Remuneração de R$2500 mensais')).toEqual({ min: 2500, max: 2500, period: 'MES' });
  });

  it('lê valor por hora', () => {
    expect(extractSalary('Pagamos R$ 15,50 por hora')).toEqual({ min: 15.5, max: 15.5, period: 'HORA' });
    expect(extractSalary('R$ 18/hora')).toEqual({ min: 18, max: 18, period: 'HORA' });
  });

  it('lê valor por dia', () => {
    expect(extractSalary('Diária de R$ 180,00 por dia')).toEqual({ min: 180, max: 180, period: 'DIA' });
  });

  it('sem período dito, assume mês quando o valor cabe numa faixa mensal', () => {
    expect(extractSalary('Salário R$ 1.800')).toEqual({ min: 1800, max: 1800, period: 'MES' });
  });

  it('lê faixa de valores', () => {
    expect(extractSalary('de R$ 2.000 até R$ 2.500')).toEqual({ min: 2000, max: 2500, period: 'MES' });
    expect(extractSalary('Salário: 2.500 a 3.000 por mês')).toEqual({ min: 2500, max: 3000, period: 'MES' });
    expect(extractSalary('R$ 2500 - R$ 3000')).toEqual({ min: 2500, max: 3000, period: 'MES' });
    expect(extractSalary('entre R$ 2.000 e R$ 2.500 por mês')).toEqual({ min: 2000, max: 2500, period: 'MES' });
  });

  it('aceita número sem R$ quando o período vem colado ou há palavra de remuneração antes', () => {
    expect(extractSalary('2.500 por mês')).toEqual({ min: 2500, max: 2500, period: 'MES' });
    expect(extractSalary('15,50 por hora')).toEqual({ min: 15.5, max: 15.5, period: 'HORA' });
    expect(extractSalary('salario 2500')).toEqual({ min: 2500, max: 2500, period: 'MES' });
  });

  it('entende "3 mil"', () => {
    expect(extractSalary('Ganho de R$ 3 mil')).toEqual({ min: 3000, max: 3000, period: 'MES' });
  });

  it('não toma por salário o que não é', () => {
    expect(extractSalary('Salário a combinar')).toBeNull();
    expect(extractSalary('2 anos de experiência, 40 horas por semana')).toBeNull();
    expect(extractSalary('CEP 89201-000, vaga 2500')).toBeNull();
    expect(extractSalary('')).toBeNull();
    expect(extractSalary(undefined)).toBeNull();
  });

  it('não toma benefício nem variável por salário, mas acha o salário que vem junto', () => {
    expect(extractSalary('Vale alimentação R$ 30 por dia')).toBeNull();
    expect(extractSalary('Comissão de R$ 500')).toBeNull();
    expect(extractSalary('Salário de R$ 2.000 + vale transporte e R$ 300 de bônus')).toEqual({ min: 2000, max: 2000, period: 'MES' });
  });

  it('descarta valor fora de faixa', () => {
    expect(extractSalary('R$ 5 por mês')).toBeNull();
    expect(extractSalary('R$ 9.999.999 por mês')).toBeNull();
    expect(extractSalary('R$ 2 por hora')).toBeNull();
  });
});

describe('vagas · salário em campos da fonte', () => {
  it('aceita faixa e valor único', () => {
    expect(salaryFromFields({ min: 2000, max: 2500 })).toEqual({ min: 2000, max: 2500, period: 'MES' });
    expect(salaryFromFields({ min: '2.500', period: 'MES' })).toEqual({ min: 2500, max: 2500, period: 'MES' });
    expect(salaryFromFields({ max: 3000 })).toEqual({ min: 3000, max: 3000, period: 'MES' });
    expect(salaryFromFields({ min: 20, period: 'HORA' })).toEqual({ min: 20, max: 20, period: 'HORA' });
  });

  it('ordena a faixa invertida', () => {
    expect(salaryFromFields({ min: 3000, max: 2000 })).toEqual({ min: 2000, max: 3000, period: 'MES' });
  });

  it('descarta salário estimado pela fonte, vazio ou implausível', () => {
    expect(salaryFromFields({ min: 2000, max: 2500, predicted: true })).toBeNull();
    expect(salaryFromFields({})).toBeNull();
    expect(salaryFromFields({ min: 0, max: 0 })).toBeNull();
    expect(salaryFromFields({ min: 10 })).toBeNull(); // 10 por mês
    expect(salaryFromFields(undefined)).toBeNull();
  });
});

describe('vagas · texto do salário', () => {
  it('formata em pt-BR, com centavos só quando existem', () => {
    expect(formatMoney(2500)).toBe('2.500');
    expect(formatMoney(1234567)).toBe('1.234.567');
    expect(formatMoney(15.5)).toBe('15,50');
    expect(formatMoney(999)).toBe('999');
    expect(formatMoney(-1)).toBe('');
  });

  it('"Salário: R$ X a R$ Y por mês"', () => {
    expect(salaryLabel({ min: 2500, max: 3000, period: 'MES' })).toBe('Salário: R$ 2.500 a R$ 3.000 por mês');
  });

  it('valor único, por hora e por dia', () => {
    expect(salaryLabel({ min: 2500, max: 2500, period: 'MES' })).toBe('Salário: R$ 2.500 por mês');
    expect(salaryLabel({ min: 15.5, max: 15.5, period: 'HORA' })).toBe('Salário: R$ 15,50 por hora');
    expect(salaryLabel({ min: 180, period: 'DIA' })).toBe('Salário: R$ 180 por dia');
  });

  it('"Salário não informado" sem valor', () => {
    for (const none of [null, undefined, {}, { min: 0 }, { min: null, max: null }]) expect(salaryLabel(none)).toBe('Salário não informado');
  });
});
