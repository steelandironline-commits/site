import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AREA_NAME as CNPJ_NAME } from '@autopix/areas/brand/cnpj';
import { AREA_NAME as CPF_NAME } from '@autopix/areas/brand/cpf';

// (b) Cada área tem o próprio manifesto PWA (apps/web/areas/<área>/public/manifest.webmanifest).
// `id` e `name` são próprios e diferentes, para o navegador não tratar as duas instalações como uma.
// `scope` é "/" nas duas, como pede o manifesto de referência: quem separa as áreas é o host (origem),
// porque cada área é servida só no seu host (ARQUITETURA 4 e 5).

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestOf = (area) => JSON.parse(fs.readFileSync(path.join(webRoot, 'areas', area, 'public', 'manifest.webmanifest'), 'utf8'));
const indexOf = (area) => fs.readFileSync(path.join(webRoot, 'areas', area, 'index.html'), 'utf8');

const AREAS = { cnpj: CNPJ_NAME, cpf: CPF_NAME };

describe('manifesto PWA de cada área', () => {
  for (const [area, name] of Object.entries(AREAS)) {
    it(`${area}: nome, descrição e modo de janela próprios`, () => {
      const m = manifestOf(area);
      expect(m.name).toBe(name);
      expect(m.short_name).toBe(name);
      expect(m.description).toEqual(expect.any(String));
      expect(m.description.trim().length).toBeGreaterThan(0);
      expect(m.display).toBe('standalone');
      expect(m.lang).toBe('pt-BR');
    });

    it(`${area}: start_url e scope na raiz do próprio host`, () => {
      const m = manifestOf(area);
      expect(m.start_url).toBe('/');
      expect(m.scope).toBe('/');
    });

    it(`${area}: cores em hexadecimal, e theme_color igual ao theme-color da página`, () => {
      const m = manifestOf(area);
      expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(indexOf(area)).toContain(`<meta name="theme-color" content="${m.theme_color}" />`);
    });

    it(`${area}: os ícones apontam para arquivos que existem no public/`, () => {
      const m = manifestOf(area);
      for (const icon of m.icons) {
        expect(fs.existsSync(path.join(webRoot, 'areas', area, 'public', icon.src)), icon.src).toBe(true);
      }
    });
  }

  it('as duas áreas têm id e name diferentes', () => {
    const [cnpj, cpf] = [manifestOf('cnpj'), manifestOf('cpf')];
    expect(cnpj.id).not.toBe(cpf.id);
    expect(cnpj.name).not.toBe(cpf.name);
    expect(cnpj.short_name).not.toBe(cpf.short_name);
  });
});
