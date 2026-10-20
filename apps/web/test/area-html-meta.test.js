import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AREA_NAME as CNPJ_NAME } from '@autopix/areas/brand/cnpj';
import { AREA_NAME as CPF_NAME } from '@autopix/areas/brand/cpf';

// (a) Cada entrada de área (apps/web/areas/<área>/index.html) tem idioma, título, descrição e canonical
// do próprio host, e nenhum "TemPix" no texto visível. O título traz o marcador %AREA_NAME%, que o build
// troca pelo nome da área (vite-plugins/areaHtml.js); o teste faz a mesma troca.

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(webRoot, ...parts), 'utf8');

const AREAS = {
  cnpj: { name: CNPJ_NAME, origin: 'https://temcnpj.com.br' },
  cpf: { name: CPF_NAME, origin: 'https://cpf.temcnpj.com.br' },
};

/** Palavras que a área não pode usar: a da outra área (CNPJ não fala de CPF; CPF não fala de CNPJ nem de empresa). */
const OTHER_AREA_WORDS = {
  cnpj: /\bCPF\b|pessoa f[ií]sica/i,
  cpf: /\bCNPJ\b|empresa/i,
};

/** Conteúdo do primeiro <meta ...> que casa com o atributo e o valor. */
const metaContent = (html, attr, value) => {
  const tag = html.match(new RegExp(`<meta\\s+${attr}="${value}"[^>]*>`, 'i'));
  return tag ? tag[0].match(/content="([^"]*)"/)?.[1] ?? null : null;
};

/** Texto que a pessoa vê: sem scripts, estilos, marcas e atributos. */
const visibleText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');

/** Cor de destaque da área (`--primary` do theme.css), em minúsculas. */
const accentOf = (area) => read('src', 'areas', area, 'theme.css').match(/--primary:\s*(#[0-9a-fA-F]{6})\s*;/)[1].toLowerCase();

describe('entradas das áreas: metadados por host', () => {
  for (const [area, { name, origin }] of Object.entries(AREAS)) {
    describe(area, () => {
      const html = read('areas', area, 'index.html');
      const resolved = html.replaceAll('%AREA_NAME%', name);

      it('declara idioma pt-BR', () => {
        expect(html).toMatch(/<html lang="pt-BR">/);
      });

      it('tem título com o nome da área', () => {
        expect(resolved).toMatch(new RegExp(`<title>${name}</title>`));
      });

      it('tem descrição própria, sem citar a outra área nem a plataforma', () => {
        const description = metaContent(resolved, 'name', 'description');
        expect(description, 'meta description').toBeTruthy();
        expect(description).not.toMatch(/tempix/i);
        expect(description).not.toMatch(OTHER_AREA_WORDS[area]);
      });

      it('canonical e og:url apontam para o próprio host', () => {
        const canonical = resolved.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
        expect(canonical).toBe(`${origin}/`);
        expect(metaContent(resolved, 'property', 'og:url')).toBe(`${origin}/`);
      });

      it('Open Graph: título, tipo website e locale pt_BR; sem imagem inventada', () => {
        expect(metaContent(resolved, 'property', 'og:title')).toBe(name);
        expect(metaContent(resolved, 'property', 'og:type')).toBe('website');
        expect(metaContent(resolved, 'property', 'og:locale')).toBe('pt_BR');
        expect(resolved).not.toMatch(/og:image/);
      });

      it('theme-color é a cor de destaque da área', () => {
        expect(metaContent(resolved, 'name', 'theme-color')?.toLowerCase()).toBe(accentOf(area));
      });

      it('favicon próprio da área existe no public/', () => {
        expect(resolved).toMatch(/<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" \/>/);
        expect(fs.existsSync(path.join(webRoot, 'areas', area, 'public', 'favicon.svg'))).toBe(true);
      });

      it('o texto visível não tem TemPix', () => {
        expect(visibleText(resolved)).not.toMatch(/tempix/i);
      });
    });
  }
});
