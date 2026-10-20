import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isPageOf } from '@autopix/areas';

// (c) robots.txt e sitemap.xml de cada área citam só o próprio host, e o sitemap lista só páginas
// públicas da própria área (manifesto de packages/areas). Nada de /app, login nem recuperação de senha.
// /checkout fica de fora: exige sessão (decisão E).

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (area, file) => fs.readFileSync(path.join(webRoot, 'areas', area, 'public', file), 'utf8');

const AREAS = {
  cnpj: { key: 'CNPJ', origin: 'https://temcnpj.com.br', paths: ['/', '/onboarding'] },
  cpf: { key: 'CPF', origin: 'https://cpf.temcnpj.com.br', paths: ['/', '/onboarding'] },
};

const PRIVATE_PREFIXES = ['/app', '/login', '/forgot-password', '/reset-password', '/activate', '/checkout'];

describe('robots.txt por área', () => {
  for (const [area, { origin }] of Object.entries(AREAS)) {
    it(`${area}: libera tudo, aponta o sitemap do próprio host e não cita outro`, () => {
      const robots = read(area, 'robots.txt');
      expect(robots).toMatch(/^User-agent: \*$/m);
      expect(robots).toMatch(/^Allow: \/$/m);
      expect(robots).toContain(`Sitemap: ${origin}/sitemap.xml`);
      const urls = [...robots.matchAll(/https?:\/\/[^\s]+/g)].map((m) => m[0]);
      expect(urls).toHaveLength(1);
      expect(urls.every((u) => new URL(u).origin === origin)).toBe(true);
    });
  }
});

describe('sitemap.xml por área', () => {
  for (const [area, { key, origin, paths }] of Object.entries(AREAS)) {
    it(`${area}: só URLs absolutas do próprio host, de páginas públicas da área`, () => {
      const xml = read(area, 'sitemap.xml');
      const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      expect(locs.length).toBeGreaterThan(0);
      for (const loc of locs) {
        const url = new URL(loc);
        expect(url.origin, loc).toBe(origin);
        expect(isPageOf(key, url.pathname), `${loc} é página pública de ${key}`).toBe(true);
        expect(PRIVATE_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`)), loc).toBe(false);
      }
      expect(locs.map((loc) => new URL(loc).pathname)).toEqual(paths);
    });
  }

  it('o sitemap do CNPJ não lista /checkout (exige sessão)', () => {
    expect(read('cnpj', 'sitemap.xml')).not.toMatch(/\/checkout/);
  });
});
