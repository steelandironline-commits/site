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
