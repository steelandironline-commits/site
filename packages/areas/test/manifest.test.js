import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AREAS,
  COMMON_PAGES,
  EXCLUSIVE_PAGES,
  EXCLUSIVE_FILES,
  PAGES,
  API_MOUNTS,
  isAnyArea,
  ALL_PAGES,
  exclusiveFilesOf,
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

  it('cada montagem de API declara áreas válidas, sem repetição e sem caminho fora de /api', () => {
    expect(API_MOUNTS.length).toBeGreaterThan(20);
    const paths = API_MOUNTS.map((m) => m.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const mount of API_MOUNTS) {
      expect(mount.path, mount.path).toMatch(/^\/api\/[a-z-]+$/);
      expect(mount.areas.length, mount.path).toBeGreaterThan(0);
      expect(new Set(mount.areas).size, mount.path).toBe(mount.areas.length);
      // ANY_AREA vale sozinho; senão só áreas conhecidas.
      if (isAnyArea(mount.areas)) continue;
      for (const area of mount.areas) expect(AREAS, `${mount.path} ${area}`).toContain(area);
    }
    expect(Object.isFrozen(API_MOUNTS)).toBe(true);
  });

  it('só infraestrutura responde em qualquer host', () => {
    expect(API_MOUNTS.filter((m) => isAnyArea(m.areas)).map((m) => m.path).sort()).toEqual(['/api/health', '/api/webhooks']);
  });

  it('o CPF não recebe as montagens de empresa, de pagamento, de carga, de equipe nem de intermediação', () => {
    const cpf = API_MOUNTS.filter((m) => m.areas.includes('CPF')).map((m) => m.path);
    for (const p of ['/api/company', '/api/opportunities', '/api/agents', '/api/payments', '/api/subscription', '/api/team', '/api/freight', '/api/tenders', '/api/workforce', '/api/pay', '/api/intermediation', '/api/admin']) {
      expect(cpf, p).not.toContain(p);
    }
    for (const p of ['/api/social', '/api/dashboard', '/api/activity', '/api/events', '/api/onboarding']) expect(cpf, p).toContain(p);
  });

  it('o admin da plataforma só entra nas montagens de conta e de administração', () => {
    const admin = API_MOUNTS.filter((m) => m.areas.includes('ADMIN')).map((m) => m.path).sort();
    expect(admin).toEqual(['/api/actions', '/api/admin', '/api/auth', '/api/challenges', '/api/me', '/api/session']);
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

describe('arquivos exclusivos de cada área (fronteira do build)', () => {
  const webSrc = path.join(root, 'apps/web/src');
  const entries = AREAS.flatMap((area) => EXCLUSIVE_FILES[area].map((entry) => ({ area, entry })));

  it('toda área tem uma lista, congelada', () => {
    expect(Object.keys(EXCLUSIVE_FILES)).toEqual([...AREAS]);
    for (const area of AREAS) {
      expect(Object.isFrozen(EXCLUSIVE_FILES[area]), area).toBe(true);
      expect(exclusiveFilesOf(area)).toBe(EXCLUSIVE_FILES[area]);
    }
    expect(() => exclusiveFilesOf('toString')).toThrow(TypeError);
  });

  it('cada caminho existe em apps/web/src: arquivo, ou pasta quando termina em "/"', () => {
    expect(entries.length).toBeGreaterThan(10);
    for (const { area, entry } of entries) {
      expect(entry, `${area} ${entry}`).toMatch(/^[A-Za-z0-9._/-]+$/);
      expect(entry.startsWith('/') || entry.includes('..'), entry).toBe(false);
      const target = path.join(webSrc, entry);
      expect(fs.existsSync(target), `${area} ${entry}`).toBe(true);
      expect(fs.statSync(target).isDirectory(), `${area} ${entry}`).toBe(entry.endsWith('/'));
    }
  });

  it('nenhum caminho está em duas áreas, nem dentro da pasta de outro', () => {
    for (const a of entries) {
      for (const b of entries) {
        if (a === b) continue;
        const inside = b.entry.endsWith('/') && a.entry.startsWith(b.entry);
        expect(inside || a.entry === b.entry, `${a.area} ${a.entry} x ${b.area} ${b.entry}`).toBe(false);
      }
    }
  });

  it('as pastas src/areas/<área>/ são exclusivas por regra e não precisam constar da lista', () => {
    for (const { entry } of entries) expect(entry.startsWith('areas/')).toBe(false);
  });

  it('as páginas exclusivas de cada área existem como arquivo classificado (CNPJ: telas de empresa e pagamento)', () => {
    for (const file of ['pages/app/Pay.jsx', 'pages/app/Tenders.jsx', 'pages/app/Freight.jsx', 'pages/app/Workforce.jsx', 'pages/checkout/']) {
      expect(EXCLUSIVE_FILES.CNPJ, file).toContain(file);
    }
    expect(EXCLUSIVE_FILES.ADMIN).toContain('pages/app/Admin.jsx');
    // As páginas comuns nunca são exclusivas.
    for (const file of ['pages/app/Overview.jsx', 'pages/app/Social.jsx', 'pages/app/Settings.jsx', 'pages/auth/', 'pages/onboarding/', 'pages/NotFound.jsx']) {
      for (const area of AREAS) expect(EXCLUSIVE_FILES[area].some((e) => file.startsWith(e)), `${area} ${file}`).toBe(false);
    }
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
