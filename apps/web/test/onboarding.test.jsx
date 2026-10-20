import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccountStartFields } from '../src/legacy/AccountStartFields.jsx';

const account = { accountType: '', name: '', email: '', companyName: '', document: '' };
const render = (accountType) => renderToStaticMarkup(
  <AccountStartFields account={{ ...account, accountType }} setAccount={() => {}} hasSession={false} feeLabel="R$ 200,00" />,
);

// O cadastro com a escolha entre empresa e pessoa é do build legado (src/legacy/). Os cadastros das áreas,
// que só aceitam o documento do próprio host, têm o seu teste em area-onboarding.test.jsx.
describe('first signup step (build legado)', () => {
  it('renders company identity and email together without crashing', () => {
    const html = render('COMPANY');
    expect(html).toContain('Nome da empresa');
    expect(html).toContain('CNPJ (empresa ou MEI)');
    expect(html.match(/type="email"/g)).toHaveLength(1);
    expect(html).toContain('autoComplete="organization"');
  });

  it('lets professionals enter the required email without company-only fields', () => {
    const html = render('PERSON');
    expect(html).toContain('CPF');
    expect(html.match(/type="email"/g)).toHaveLength(1);
    expect(html).not.toContain('Nome da empresa');
  });

  it('keeps the required email available before choosing an account type', () => {
    expect(render('')).toContain('type="email"');
  });
});

describe('signup steps by account type (build legado)', () => {
  it('skips the operation-type step for a pessoa física: the worker goes straight to the profession', async () => {
    const { stepsFor } = await import('../src/legacy/Onboarding.jsx');
    const person = stepsFor('PERSON').map((s) => s.key);
    expect(person).not.toContain('operacao');
    expect(person.slice(0, 2)).toEqual(['start', 'work']);
    expect(person.indexOf('contact')).toBeGreaterThan(person.indexOf('where'));
    expect(stepsFor('COMPANY').map((s) => s.key)).toContain('operacao');
  });
});
