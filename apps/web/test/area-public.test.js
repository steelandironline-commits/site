import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AREA_NAME as CNPJ_NAME } from '@autopix/areas/brand/cnpj';
import { AREA_NAME as CPF_NAME } from '@autopix/areas/brand/cpf';

// Os arquivos estáticos de cada área (apps/web/areas/<área>/): HTML de entrada e public/ próprios.

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = { cnpj: CNPJ_NAME, cpf: CPF_NAME };
const OTHER = { cnpj: 'cpf', cpf: 'cnpj' };
const read = (...parts) => fs.readFileSync(path.join(webRoot, ...parts), 'utf8');

function listFiles(dir, base = dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name))]))
    .sort();
}

describe('entradas estáticas das áreas', () => {
  for (const area of ['cnpj', 'cpf']) {
    const other = OTHER[area];

    it(`${area}: o HTML leva o nome da marca por marcador e a entrada da própria área`, () => {
      const html = read('areas', area, 'index.html');
      expect(html).toContain('<title>%AREA_NAME%</title>');
      expect(html).toContain(`<script type="module" src="/src/areas/${area}/main.jsx"></script>`);
      expect(fs.existsSync(path.join(webRoot, 'src/areas', area, 'main.jsx'))).toBe(true);
      expect(html).not.toContain(`/areas/${other}/`);
      expect(html).not.toMatch(/TemPix/);
      // O gradiente que o CSS global usa (#tempix-gold) precisa estar na página.
      expect(html).toContain('id="tempix-gold"');
    });

    it(`${area}: o nome da marca vale no offline.html, no manifest e sem citar a outra área`, () => {
      const name = NAMES[area];
      expect(read('areas', area, 'public/offline.html')).toContain(`<title>${name} — sem conexão</title>`);
      const manifest = JSON.parse(read('areas', area, 'public/manifest.webmanifest'));
      expect(manifest.name).toBe(name);
      for (const file of ['public/offline.html', 'public/manifest.webmanifest', 'index.html']) {
        expect(read('areas', area, file), `${area}/${file}`).not.toContain(NAMES[other]);
        expect(read('areas', area, file), `${area}/${file}`).not.toMatch(/TemPix/);
      }
    });

    it(`${area}: o service worker consegue pré-guardar o que ele lista`, () => {
      const files = listFiles(path.join(webRoot, 'areas', area, 'public'));
      // pwa/sw-template.js pré-guarda estes quatro arquivos na instalação.
      for (const file of ['offline.html', 'manifest.webmanifest', 'icons/icon-192.png']) expect(files).toContain(file);
    });
  }

  it('as duas áreas têm o mesmo conjunto de arquivos em public/, cada uma com os seus', () => {
    expect(listFiles(path.join(webRoot, 'areas/cnpj/public'))).toEqual(listFiles(path.join(webRoot, 'areas/cpf/public')));
  });

  it('o manifest de cada área tem id próprio', () => {
    const id = (area) => JSON.parse(read('areas', area, 'public/manifest.webmanifest')).id;
    expect(id('cnpj')).not.toBe(id('cpf'));
  });

  it('robots.txt: o CPF não cita o caminho do checkout, que é só do CNPJ', () => {
    expect(read('areas/cnpj/public/robots.txt')).toContain('Disallow: /checkout');
    expect(read('areas/cpf/public/robots.txt')).not.toContain('/checkout');
    for (const area of ['cnpj', 'cpf']) {
      const text = read('areas', area, 'public/robots.txt');
      expect(text).toContain('Disallow: /app');
      expect(text).not.toMatch(/Sitemap|temcnpj|temcpf/i);
    }
  });
});
