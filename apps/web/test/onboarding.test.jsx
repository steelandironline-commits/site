import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccountStartFields } from '../src/pages/onboarding/AccountStartFields.jsx';

const account = { accountType: '', name: '', email: '', companyName: '', document: '' };
const render = (accountType) => renderToStaticMarkup(
  <AccountStartFields account={{ ...account, accountType }} setAccount={() => {}} hasSession={false} feeLabel="R$ 200,00" />,
);

describe('first signup step', () => {
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

describe('signup steps by account type', () => {
  it('skips the operation-type step for a pessoa física: the worker goes straight to the profession', async () => {
    const { stepsFor } = await import('../src/pages/onboarding/Onboarding.jsx');
    const person = stepsFor('PERSON').map((s) => s.key);
    expect(person).not.toContain('operacao');
    expect(person.slice(0, 2)).toEqual(['start', 'work']);
    expect(person.indexOf('contact')).toBeGreaterThan(person.indexOf('where'));
    expect(stepsFor('COMPANY').map((s) => s.key)).toContain('operacao');
  });
});
