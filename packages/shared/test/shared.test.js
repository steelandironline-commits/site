import { describe, it, expect } from 'vitest';
import {
  formatBRL,
  formatCents,
  formatRange,
  isValidCnpj,
  normalizeKey,
  companyProfileSchema,
  passwordSchema,
  PLAN,
} from '../src/index.js';

describe('format', () => {
  it('formats money', () => {
    expect(formatCents(PLAN.priceCents)).toBe('R$ 597,00');
    expect(formatBRL(18000)).toBe('R$ 18.000');
    expect(formatRange(15000, 35000)).toBe('R$ 15.000 – R$ 35.000');
  });

  it('validates CNPJ check digits', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
  });

  it('normalizes keys', () => {
    expect(normalizeKey('https://www.Indústria-Alpha.com.br/contato')).toBe('industria-alpha.com.br');
    expect(normalizeKey('Indústria Porto Atlântico')).toBe('industria-porto-atlantico');
  });
});

describe('schemas', () => {
  it('normalizes company profile', () => {
    const parsed = companyProfileSchema.parse({
      name: 'Usinagem Sul',
      website: 'usinagemsul.com.br',
      instagram: '@usinagemsul',
      services: ['Usinagem', 'Usinagem', ' Caldeiraria '],
      products: [],
      serviceLocations: [],
      preferredIndustries: [],
      excludedIndustries: [],
      keywords: [],
      state: 'sc',
    });
    expect(parsed.website).toBe('https://usinagemsul.com.br');
    expect(parsed.instagram).toBe('usinagemsul');
    expect(parsed.services).toEqual(['Usinagem', 'Caldeiraria']);
    expect(parsed.state).toBe('SC');
  });

  it('requires strong-ish passwords', () => {
    expect(passwordSchema.safeParse('short1').success).toBe(false);
    expect(passwordSchema.safeParse('onlyletterslong').success).toBe(false);
    expect(passwordSchema.safeParse('valid-password-123').success).toBe(true);
  });
});
