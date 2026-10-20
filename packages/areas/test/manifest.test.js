import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AREAS,
  COMMON_PAGES,
  EXCLUSIVE_PAGES,
  PAGES,
  API_MOUNTS,
  ALL_PAGES,
  pagesOf,
  isPageOf,
  areasOfPage,
} from '../src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Caminhos de apps/web/src/App.jsx (build legado), sem os curingas `*`. */
function legacyRoutes() {
  const lines = fs.readFileSync(path.join(root, 'apps/web/src/App.jsx'), 'utf8').split('\n');
  const found = [];
  let prefix = '';
  for (const line of lines) {
    if (/<\/Route>/.test(line)) prefix = '';
    const route = /<Route\s+(index|path="([^"]+)")/.exec(line);
    if (!route) continue;
    const selfClosing = /\/>\s*$/.test(line);
    const own = route[1] === 'index' ? '' : route[2];
    if (own === '*') continue;
    const full = own.startsWith('/') ? own : `${prefix}/${own}`.replace(/\/$/, '') || '/';
    found.push(full === '' ? '/' : full);
    if (!selfClosing) prefix = full;
  }
  return found;
}

describe('manifesto de páginas', () => {
  it('cada área lista só caminhos do front, sem repetição', () => {
    for (const area of AREAS) {
      const pages = pagesOf(area);
      expect(new Set(pages).size, area).toBe(pages.length);
      for (const p of pages) expect(p, `${area} ${p}`).toMatch(/^\/[a-z0-9/:-]*$/);
      expect(pages.every((p) => !p.startsWith('/api')), area).toBe(true);
    }
  });

  it('CNPJ e CPF compartilham só as páginas comuns', () => {
    const shared = PAGES.CNPJ.filter((p) => PAGES.CPF.includes(p));
    expect(shared.sort()).toEqual([...COMMON_PAGES].sort());
    for (const p of EXCLUSIVE_PAGES.CNPJ) expect(PAGES.CPF).not.toContain(p);
    for (const p of EXCLUSIVE_PAGES.CPF) expect(PAGES.CNPJ).not.toContain(p);
  });

  it('o CPF não recebe as telas de empresa, de pagamento, de carga nem de equipe', () => {
    for (const p of [
      '/checkout',
      '/app/licitacoes',
      '/app/company',
      '/app/subscription',
      '/app/pay',
      '/app/pay/transactions/abc',
      '/app/freight',
      '/app/workforce',
      '/app/intermediacao',
      '/app/admin',
    ]) {
      expect(isPageOf('CPF', p), p).toBe(false);
    }
  });

  it('o admin da plataforma não é página das áreas públicas', () => {
    expect(isPageOf('ADMIN', '/app/admin')).toBe(true);
    expect(isPageOf('CNPJ', '/app/admin')).toBe(false);
    expect(areasOfPage('/app/admin')).toEqual(['ADMIN']);
  });

  it('casa parâmetros, barra final e maiúsculas como o roteador do cliente', () => {
    expect(isPageOf('CPF', '/activate/abc123')).toBe(true);
    expect(isPageOf('CPF', '/activate/')).toBe(false);
    expect(isPageOf('CPF', '/activate/a/b')).toBe(false);
    expect(isPageOf('CNPJ', '/app/opportunities/xyz')).toBe(true);
    expect(isPageOf('CNPJ', '/app/')).toBe(true);
    expect(isPageOf('CNPJ', '/APP/Radar')).toBe(true);
    expect(isPageOf('CPF', '/APP/RADAR')).toBe(false);
    expect(isPageOf('CNPJ', '/app/nao-existe')).toBe(false);
    expect(isPageOf('CNPJ', '/')).toBe(true);
    expect(isPageOf('CNPJ', '/qualquer')).toBe(false);
  });

  it('areasOfPage diz quem serve o caminho', () => {
    expect(areasOfPage('/login')).toEqual(['CNPJ', 'CPF']);
    expect(areasOfPage('/app/radar')).toEqual(['CNPJ']);
    expect(areasOfPage('/nao/existe')).toEqual([]);
  });

  it('as montagens de API ficam vazias até a ETAPA 4', () => {
    expect(API_MOUNTS).toEqual([]);
  });

  it('toda rota do App.jsx legado está declarada em alguma área, e só elas', () => {
    const routes = legacyRoutes();
    // Garante que o leitor de rotas enxerga o App.jsx inteiro.
    expect(routes).toContain('/app');
    expect(routes).toContain('/app/pay/transactions/:id');
    expect(routes).toContain('/activate/:token');
    expect(new Set(routes).size).toBeGreaterThanOrEqual(30);
    expect([...ALL_PAGES].sort()).toEqual([...new Set(routes)].sort());
  });
});

describe('o manifesto não vai para o navegador', () => {
  const importsOfAreas = (dir) => {
    const hits = [];
    const walk = (current) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const file = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules') walk(file);
        } else if (/\.(jsx?|mjs|css)$/.test(entry.name)) {
          const text = fs.readFileSync(file, 'utf8');
          for (const m of text.matchAll(/@autopix\/areas(\/[\w/-]*)?/g)) hits.push({ file: path.relative(root, file), spec: m[0] });
        }
      }
    };
    walk(path.join(root, dir));
    return hits;
  };

  it('apps/web e packages/ui só importam a marca (brand/*), nunca o índice nem o manifesto', () => {
    const hits = [...importsOfAreas('apps/web/src'), ...importsOfAreas('packages/ui/src')];
    const forbidden = hits.filter((h) => !/^@autopix\/areas\/brand\/(platform|cnpj|cpf)$/.test(h.spec));
    expect(forbidden).toEqual([]);
  });
});
