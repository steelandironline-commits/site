import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AuthShell, BrandProvider, Logo, useBrand } from '@autopix/ui';
import { PLATFORM_BRAND } from '@autopix/areas/brand/platform';
import { AREA_BRAND as CNPJ_BRAND } from '@autopix/areas/brand/cnpj';
import { AREA_BRAND as CPF_BRAND } from '@autopix/areas/brand/cpf';

const uiSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../packages/ui/src');

const withBrand = (brand, node) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <BrandProvider brand={brand}>{node}</BrandProvider>
    </MemoryRouter>,
  );

describe('@autopix/ui recebe a marca por contexto', () => {
  it('o logo e a tela de acesso escrevem a marca fornecida, e só ela', () => {
    for (const brand of [PLATFORM_BRAND, CNPJ_BRAND, CPF_BRAND]) {
      const html = withBrand(brand, <AuthShell title="Entrar">x</AuthShell>);
      expect(html).toContain(`aria-label="${brand.name}"`);
      expect(html).toContain(`aria-label="${brand.name} — início"`);
      expect(html).toContain(brand.slogan);
      expect(html).toContain(brand.support);
      expect(html).toContain(`>${brand.wordmark[0]}</span>`);
      expect(html).toContain(`>${brand.wordmark[1]}</span>`);
    }
  });

  it('o conjunto da plataforma reproduz os textos que o build legado sempre mostrou', () => {
    const html = withBrand(PLATFORM_BRAND, <AuthShell title="Entrar">x</AuthShell>);
    expect(html).toContain('Tem emprego, tem rota, tem serviço. TemPix.');
    expect(html).toContain('Clientes, cargas, profissionais e Pix numa tela só.');
    expect(html).toContain('aria-label="TemPix — início"');
    expect(html).toContain('data-spaced="false"');
  });

  it('o nome com espaço ("Tem CNPJ") espaça as duas partes do logo', () => {
    expect(withBrand(CNPJ_BRAND, <Logo />)).toContain('data-spaced="true"');
    expect(withBrand(CPF_BRAND, <Logo />)).toContain('data-spaced="true"');
  });

  it('o logo compacto só leva o nome acessível', () => {
    const html = withBrand(CPF_BRAND, <Logo compact />);
    expect(html).toContain('aria-label="Tem CPF"');
    expect(html).not.toContain('data-spaced');
  });

  it('sem BrandProvider falha alto, em vez de mostrar um texto padrão', () => {
    expect(() => renderToStaticMarkup(<MemoryRouter><Logo /></MemoryRouter>)).toThrow(/BrandProvider/);
    function Probe() {
      useBrand();
      return null;
    }
    expect(() => renderToStaticMarkup(<Probe />)).toThrow(/BrandProvider/);
  });

  it('recusa uma marca incompleta', () => {
    const render = (brand) => renderToStaticMarkup(<BrandProvider brand={brand}>x</BrandProvider>);
    expect(() => render(undefined)).toThrow(TypeError);
    expect(() => render({ ...CPF_BRAND, name: '' })).toThrow(TypeError);
    expect(() => render({ ...CPF_BRAND, wordmark: ['Tem'] })).toThrow(TypeError);
    expect(() => render({ ...CPF_BRAND, slogan: undefined })).toThrow(TypeError);
  });
});

describe('packages/ui/src não carrega texto de marca nem de módulo', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(jsx?|css)$/.test(entry.name)) files.push(file);
    }
  };
  walk(uiSrc);

  // Identificadores técnicos, não texto exibido: o cabeçalho HTTP que a API aceita no CORS
  // (muda na ETAPA 4) e o id do gradiente SVG que o index.html de cada entrada define.
  const TECHNICAL = [/X-TemPix-Client/g, /#tempix-gold/g];

  it('nenhum literal de marca nem a frase de apoio ficou no pacote', () => {
    expect(files.length).toBeGreaterThan(10);
    const hits = [];
    for (const file of files) {
      let text = fs.readFileSync(file, 'utf8');
      for (const re of TECHNICAL) text = text.replace(re, '');
      for (const m of text.matchAll(/tempix|tem pix|tem cnpj|tem cpf|clientes, cargas|tem emprego/gi)) {
        hits.push(`${path.relative(uiSrc, file)}: ${m[0]}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
