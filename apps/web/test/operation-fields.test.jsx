import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OPERATION_START, modulesFor, normalizeOperationalProfile } from '@autopix/shared';
import { BrandProvider } from '@autopix/ui';
import { AREA_BRAND as CNPJ_BRAND } from '@autopix/areas/brand/cnpj';
import { AREA_BRAND as CPF_BRAND } from '@autopix/areas/brand/cpf';
import { OperationFields } from '../src/pages/onboarding/operations/OperationFields.jsx';

// O catálogo recebe a marca da área da conta (ETAPA 6): cada teste roda dentro do BrandProvider dela.
const inBrandOf = (type, node) => <BrandProvider brand={type === 'COMPANY' ? CNPJ_BRAND : CPF_BRAND}>{node}</BrandProvider>;

const fieldsOf = (id, p, type = 'PERSON') => {
  const profile = normalizeOperationalProfile(p);
  return { profile, fields: modulesFor(profile, type).find((m) => m.id === id).fields };
};
const render = (id, p, type) => {
  const { profile, fields } = fieldsOf(id, p, type);
  return renderToStaticMarkup(inBrandOf(type, <OperationFields fields={fields} profile={profile} onChange={() => {}} accountType={type} errors={{}} />));
};

describe('operation type screen by account', () => {
  const start = (type) =>
    renderToStaticMarkup(inBrandOf(type, <OperationFields fields={OPERATION_START.fields} profile={normalizeOperationalProfile({})} onChange={() => {}} accountType={type} errors={{}} />));

  it('shows a person no company-only objective, no MEI and no company wording', () => {
    const pf = start('PERSON');
    expect(pf).toContain('Encontrar compradores para meus produtos ou equipamentos');
    expect(pf).toContain('Caminhoneiro autônomo');
    expect(pf).not.toContain('MEI');
    expect(pf).not.toContain('Encontrar fornecedores');
    expect(pf).not.toContain('Fornecer para operações marítimas');
    expect(pf).not.toContain('Intermediar oportunidades');
    expect(pf).not.toMatch(/empresa/i);
  });

  it('keeps the full company list, with MEI, for CNPJ accounts', () => {
    const cnpj = start('COMPANY');
    expect(cnpj).toContain('Encontrar fornecedores');
    expect(cnpj).toContain('Caminhoneiro autônomo / MEI');
    expect(cnpj).toContain('uma empresa pode ser fornecedora');
  });
});

describe('certificates and access fields', () => {
  it('asks the terminal details only after the person says they have access', () => {
    const no = render('acesso_terminal', { types: ['caminhoneiro'], certifications: { terminal: { status: 'nao' } } });
    expect(no).not.toContain('type="date"');
    const yes = render('acesso_terminal', { types: ['caminhoneiro'], certifications: { terminal: { status: 'sim' } } });
    expect(yes).toContain('Tipos de acesso');
    expect(yes).toContain('Cadastro no terminal, se houver');
    expect(yes.match(/type="date"/g)).toHaveLength(1);
  });

  it('offers the CNH question with its category and validity, and no number field', () => {
    const html = render('certificacoes', { types: ['caminhoneiro'] });
    expect(html).toContain('Possui CNH?');
    const cnhOn = render('certificacoes', { types: ['caminhoneiro'], certifications: { cnh: { has: true } } });
    expect(cnhOn).toContain('Categoria da CNH');
    expect(cnhOn).toContain('Validade da CNH');
    expect(cnhOn).not.toMatch(/n[úu]mero da cnh/i);
  });

  it('marks the whole NR list at once with "Todas as NRs"', () => {
    const html = render('certificacoes', { types: ['usinagem'] }, 'COMPANY');
    expect(html).toContain('Todas as NRs');
    expect(html).toContain('Indústria e usinagem');
    expect(html).toContain('aria-pressed="false"');
  });
});
