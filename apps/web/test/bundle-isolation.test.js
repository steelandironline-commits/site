import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AREAS, EXCLUSIVE_FILES, isPageOf } from '@autopix/areas';
import { AREA_BRAND as CNPJ_BRAND } from '@autopix/areas/brand/cnpj';
import { AREA_BRAND as CPF_BRAND } from '@autopix/areas/brand/cpf';

// Isolamento do bundle: builda de verdade cada área (vite build --mode <área>, num diretório
// temporário) e confere o que entrou no grafo. A lista de módulos de cada área não pode ter
// módulo da outra, e todo arquivo que só uma área alcança precisa estar classificado no manifesto.
// (O "marcador de texto" no dist é da ETAPA 5: ainda há textos cruzados nas telas comuns.)

const run = promisify(execFile);
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = path.join(webRoot, '../../node_modules/vite/bin/vite.js');

const BRANDS = { cnpj: CNPJ_BRAND, cpf: CPF_BRAND };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tempix-bundles-'));
const dist = (area) => path.join(tmp, `dist-${area}`);
const read = (area, file) => fs.readFileSync(path.join(dist(area), file), 'utf8');
const modulesOf = (area) => JSON.parse(read(area, 'modules.json')).modules;

/** Módulos de apps/web/src que não são da pasta da própria área. */
const sharedSrc = (modules, area) => modules.filter((m) => m.startsWith('apps/web/src/') && !m.startsWith(`apps/web/src/areas/${area}/`));

const inFiles = (module, entries) => {
  const rel = module.replace(/^apps\/web\/src\//, '');
  return entries.some((entry) => (entry.endsWith('/') ? rel.startsWith(entry) : rel === entry));
};

beforeAll(async () => {
  await Promise.all(
    ['cnpj', 'cpf'].map((area) =>
      run(process.execPath, [viteBin, 'build', '--mode', area, '--outDir', dist(area), '--emptyOutDir'], {
        cwd: webRoot,
        env: { ...process.env, NODE_ENV: 'production' },
        maxBuffer: 32 * 1024 * 1024,
      }),
    ),
  );
}, 240_000);

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('build por área', () => {
  for (const area of ['cnpj', 'cpf']) {
    it(`${area}: gera index.html, sw.js, manifest, robots, ícones e a lista de módulos`, () => {
      for (const file of ['index.html', 'sw.js', 'manifest.webmanifest', 'robots.txt', 'favicon.svg', 'offline.html', 'modules.json', 'icons/icon-192.png']) {
        expect(fs.existsSync(path.join(dist(area), file)), `${area}/${file}`).toBe(true);
      }
      expect(fs.readdirSync(path.join(dist(area), 'assets')).some((f) => f.endsWith('.js'))).toBe(true);
    });

    it(`${area}: o HTML tem o título da marca da área, sem marcador solto`, () => {
      const html = read(area, 'index.html');
      expect(html).toContain(`<title>${BRANDS[area].name}</title>`);
      expect(html).not.toContain('%AREA_NAME%');
      expect(html).toContain('<div id="root">');
    });

    it(`${area}: o sw.js pré-guarda só arquivos que existem neste dist`, () => {
      const precache = JSON.parse(/const PRECACHE = (\[.*\]);/.exec(read(area, 'sw.js'))[1]);
      expect(precache.length).toBeGreaterThan(5);
      for (const url of precache) expect(fs.existsSync(path.join(dist(area), url)), url).toBe(true);
    });

    it(`${area}: o manifest PWA bate com a marca e só aponta para páginas da área`, () => {
      const manifest = JSON.parse(read(area, 'manifest.webmanifest'));
      expect(manifest.name).toBe(BRANDS[area].name);
      expect(manifest.short_name).toBe(BRANDS[area].name);
      expect(isPageOf(area.toUpperCase(), new URL(manifest.start_url, 'http://x').pathname)).toBe(true);
      for (const shortcut of manifest.shortcuts) {
        expect(isPageOf(area.toUpperCase(), new URL(shortcut.url, 'http://x').pathname), shortcut.url).toBe(true);
      }
      for (const icon of manifest.icons) expect(fs.existsSync(path.join(dist(area), icon.src)), icon.src).toBe(true);
    });
  }

  it('cada área tem o seu manifest, com id próprio', () => {
    const ids = ['cnpj', 'cpf'].map((area) => JSON.parse(read(area, 'manifest.webmanifest')).id);
    expect(new Set(ids).size).toBe(2);
  });

  it('o sw.js e o hash dos arquivos não são os mesmos entre as áreas', () => {
    expect(read('cnpj', 'sw.js')).not.toBe(read('cpf', 'sw.js'));
    const names = (area) => new Set(fs.readdirSync(path.join(dist(area), 'assets')).filter((f) => f.startsWith('index-')));
    for (const name of names('cnpj')) expect(names('cpf').has(name)).toBe(false);
  });
});

describe('modules.json: nenhum módulo da outra área', () => {
  it('as listas existem e têm módulos de origem (e nenhum de node_modules)', () => {
    for (const area of ['cnpj', 'cpf']) {
      const modules = modulesOf(area);
      expect(JSON.parse(read(area, 'modules.json')).area).toBe(area);
      expect(modules.length).toBeGreaterThan(40);
      expect(modules).toContain(`apps/web/src/areas/${area}/App.jsx`);
      expect(modules).toContain(`apps/web/src/areas/${area}/main.jsx`);
      expect(modules).toContain(`apps/web/areas/${area}/index.html`);
      expect(modules.some((m) => m.includes('node_modules'))).toBe(false);
    }
  });

  for (const [area, others] of [['cnpj', ['cpf', 'admin']], ['cpf', ['cnpj', 'admin']]]) {
    it(`${area}: nada de src/areas/${others.join(', ')}, da marca, do admin nem do código só de servidor`, () => {
      const modules = modulesOf(area);
      for (const other of others) {
        expect(modules.filter((m) => m.startsWith(`apps/web/src/areas/${other}/`) || m.startsWith(`apps/web/areas/${other}/`)), other).toEqual([]);
        expect(modules, other).not.toContain(`packages/areas/src/brand/${other}.js`);
        const exclusive = EXCLUSIVE_FILES[other.toUpperCase()] ?? [];
        expect(modules.filter((m) => inFiles(m, exclusive)), `exclusivos de ${other}`).toEqual([]);
      }
      expect(modules.filter((m) => m.startsWith('packages/areas/src/') && !m.startsWith('packages/areas/src/brand/'))).toEqual([]);
      expect(modules).toContain(`packages/areas/src/brand/${area}.js`);
      expect(modules).not.toContain('packages/areas/src/brand/platform.js');
    });
  }

  it('o CPF não carrega nenhum arquivo que o manifesto marca como exclusivo do CNPJ, e vice-versa', () => {
    const cpf = modulesOf('cpf');
    const cnpj = modulesOf('cnpj');
    expect(cpf.filter((m) => inFiles(m, EXCLUSIVE_FILES.CNPJ))).toEqual([]);
    expect(cnpj.filter((m) => inFiles(m, EXCLUSIVE_FILES.CPF))).toEqual([]);
    // O CNPJ de fato carrega o que é exclusivo dele: a lista não está vazia à toa.
    expect(cnpj.filter((m) => inFiles(m, EXCLUSIVE_FILES.CNPJ)).length).toBeGreaterThan(20);
  });

  it('todo arquivo de apps/web/src que só uma área alcança está classificado no manifesto', () => {
    const cnpj = sharedSrc(modulesOf('cnpj'), 'cnpj');
    const cpf = sharedSrc(modulesOf('cpf'), 'cpf');
    const onlyCnpj = cnpj.filter((m) => !cpf.includes(m));
    const onlyCpf = cpf.filter((m) => !cnpj.includes(m));
    expect(onlyCnpj.filter((m) => !inFiles(m, EXCLUSIVE_FILES.CNPJ)), 'só no CNPJ e fora de EXCLUSIVE_FILES.CNPJ').toEqual([]);
    expect(onlyCpf.filter((m) => !inFiles(m, EXCLUSIVE_FILES.CPF)), 'só no CPF e fora de EXCLUSIVE_FILES.CPF').toEqual([]);
  });

  it('o que o CPF carrega de apps/web/src é comum ou da própria pasta', () => {
    const cpf = sharedSrc(modulesOf('cpf'), 'cpf');
    const cnpj = new Set(modulesOf('cnpj'));
    for (const m of cpf) expect(cnpj.has(m), m).toBe(true);
  });

  it('as áreas declaradas são as do manifesto', () => {
    expect(AREAS).toEqual(['CNPJ', 'CPF', 'ADMIN']);
  });
});
