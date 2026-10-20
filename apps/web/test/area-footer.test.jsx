import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { BrandProvider, SessionProvider } from '@autopix/ui';
import { AREA_BRAND as CNPJ_BRAND } from '@autopix/areas/brand/cnpj';
import { AREA_BRAND as CPF_BRAND } from '@autopix/areas/brand/cpf';
import CnpjApp from '../src/areas/cnpj/App.jsx';
import CpfApp from '../src/areas/cpf/App.jsx';
import { LANDING as CNPJ_LANDING } from '../src/areas/cnpj/copy.js';
import { HOME as CPF_HOME } from '../src/areas/cpf/copy.js';
import { LANDING as LEGACY_LANDING } from '../src/legacy/copy.js';

// (d) O rodapé de cada área cita só a própria marca. A frase da Receita Federal (ARQUITETURA 11, item 3)
// vem da cópia da área: CNPJ na landing, CPF na home. O legado não recebe a frase.

const CNPJ_DISCLAIMER = 'Tem CNPJ não tem vínculo com a Receita Federal.';
const CPF_DISCLAIMER = 'Tem CPF não tem vínculo com a Receita Federal.';

/** Página da área na raiz, com a marca e o providers que o app usa. */
const renderRoot = (brand, App) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/']}>
      <BrandProvider brand={brand}>
        <SessionProvider>
          <App />
        </SessionProvider>
      </BrandProvider>
    </MemoryRouter>,
  );

/** Conteúdo de todos os <footer> da página, sem marcas. */
const footerText = (html) => {
  const blocks = html.match(/<footer[\s\S]*?<\/footer>/g) ?? [];
  return blocks.join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
};

describe('rodapé de cada área', () => {
  it('CNPJ: a landing traz a frase da própria área e nenhuma outra marca', () => {
    expect(CNPJ_LANDING.disclaimer).toBe(CNPJ_DISCLAIMER);
    const text = footerText(renderRoot(CNPJ_BRAND, CnpjApp));
    expect(text).toContain(CNPJ_DISCLAIMER);
    expect(text).toContain('Tem CNPJ');
    expect(text).not.toMatch(/Tem CPF|TemPix|cpf\.temcnpj|temcpf/i);
  });

  it('CPF: a home traz a frase da própria área e nenhuma outra marca', () => {
    expect(CPF_HOME.disclaimer).toBe(CPF_DISCLAIMER);
    const text = footerText(renderRoot(CPF_BRAND, CpfApp));
    expect(text).toContain(CPF_DISCLAIMER);
    expect(text).not.toMatch(/Tem CNPJ|CNPJ|TemPix|temcnpj\.com|temcnpj\.com\.br/i);
  });

  it('o legado não tem a frase da Receita Federal (o rodapé dele fica como era)', () => {
    expect(LEGACY_LANDING.disclaimer).toBeNull();
  });
});
