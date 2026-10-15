import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { modulesFor, normalizeOperationalProfile } from '@autopix/shared';
import { OperationFields } from '../src/pages/onboarding/operations/OperationFields.jsx';

const fieldsOf = (id, p, type = 'PERSON') => {
  const profile = normalizeOperationalProfile(p);
  return { profile, fields: modulesFor(profile, type).find((m) => m.id === id).fields };
};
const render = (id, p, type) => {
  const { profile, fields } = fieldsOf(id, p, type);
  return renderToStaticMarkup(<OperationFields fields={fields} profile={profile} onChange={() => {}} accountType={type} errors={{}} />);
};

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
