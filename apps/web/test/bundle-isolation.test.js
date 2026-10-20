import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API_MOUNTS, AREAS, EXCLUSIVE_FILES, PAGES, isAnyArea, isPageOf } from '@autopix/areas';
import { AREA_BRAND as CNPJ_BRAND } from '@autopix/areas/brand/cnpj';
import { AREA_BRAND as CPF_BRAND } from '@autopix/areas/brand/cpf';

// Isolamento do bundle: builda de verdade cada área (vite build --mode <área>, num diretório
// temporário) e confere o que entrou no grafo. A lista de módulos de cada área não pode ter
// módulo da outra, e todo arquivo que só uma área alcança precisa estar classificado no manifesto.
// A ETAPA 5 acrescenta a prova pelo texto: nenhum arquivo de saída de uma área (js, css, html, json,
// webmanifest, txt, xml) contém os marcadores da outra (ARQUITETURA 5, "Teste que prova").

const run = promisify(execFile);
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = path.join(path.dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin/vite.js');

const BRANDS = { cnpj: CNPJ_BRAND, cpf: CPF_BRAND };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tempix-bundles-'));
const dist = (area) => path.join(tmp, `dist-${area}`);
const read = (area, file) => fs.readFileSync(path.join(dist(area), file), 'utf8');
const modulesOf = (area) => JSON.parse(read(area, 'modules.json')).modules;

/** Todos os arquivos de texto da saída de uma área, com o caminho relativo ao dist dela. */
function outputFiles(area) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(js|css|html|json|webmanifest|txt|xml|svg)$/.test(entry.name)) out.push(path.relative(dist(area), file));
    }
  };
  walk(dist(area));
  return out.sort();
}

/** Arquivos da saída de uma área que contêm o texto (ou casam a expressão). */
function filesWith(area, needle) {
  const hit = needle instanceof RegExp ? (text) => needle.test(text) : (text) => text.includes(needle);
  return outputFiles(area).filter((file) => hit(read(area, file)));
}

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

// ------------------------------------------------------------------------------------------------
// ETAPA 5 · marcadores. Escritos literalmente, nunca palavras soltas: "CPF" pode aparecer no CNPJ
// (o colaborador entra com CPF, Q1) e "temcnpj" pode aparecer no CPF (está no host dele).

const MARKERS = {
  // O CPF não pode ter nada de empresa, de licitação, de equipe, de pagamento nem de cobrança.
  cpf: ['Tem CNPJ', 'CNPJ', 'Licitações', 'Colaborador', '/app/licitacoes', '/api/team', '/api/company', '/api/pay', '/checkout'],
  // O CNPJ não pode ter nada da área de pessoas.
  cnpj: ['Tem CPF', 'pessoa física', 'Meu perfil', '/api/profile'],
  // Nenhuma das duas serve o admin da plataforma (terceira área).
  both: ['/api/admin', 'Admin financeiro'],
};

describe('marcadores: o bundle de cada área não leva texto nem chamada da outra', () => {
  for (const area of ['cpf', 'cnpj']) {
    for (const marker of [...MARKERS[area], ...MARKERS.both]) {
      it(`${area}: nenhum arquivo contém ${JSON.stringify(marker)}`, () => {
        expect(filesWith(area, marker)).toEqual([]);
      });
    }
  }

  it('a busca enxerga o dist inteiro (sem isso, o teste passaria à toa)', () => {
    for (const area of ['cpf', 'cnpj']) {
      const files = outputFiles(area);
      expect(files.filter((f) => f.endsWith('.js')).length, area).toBeGreaterThan(15);
      expect(files).toEqual(expect.arrayContaining(['index.html', 'manifest.webmanifest', 'modules.json', 'robots.txt', 'sw.js']));
    }
    // Cada lado de fato tem o que é dele: os marcadores da outra área existem nas fontes do CNPJ e do CPF.
    expect(filesWith('cnpj', 'CNPJ').length).toBeGreaterThan(3);
    expect(filesWith('cpf', 'Tem CPF').length + filesWith('cpf', 'CPF').length).toBeGreaterThan(3);
    expect(filesWith('cnpj', '/api/company').length).toBeGreaterThan(0);
    expect(filesWith('cpf', '/api/profile').length).toBeGreaterThan(0);
  });

  it('o marcador "CPF" é permitido no CNPJ (colaborador) e "temcnpj" no CPF', () => {
    expect(filesWith('cnpj', 'CPF').length).toBeGreaterThan(0);
    expect(MARKERS.cnpj.some((m) => m === 'CPF')).toBe(false);
    expect(MARKERS.cpf.some((m) => /temcnpj/i.test(m))).toBe(false);
  });

  // Tudo o que o manifesto marca como só da outra área: a rota de API e o caminho da página.
  for (const [area, other] of [['cpf', 'CNPJ'], ['cnpj', 'CPF']]) {
    const ownMounts = API_MOUNTS.filter((m) => !isAnyArea(m.areas) && m.areas.includes(area.toUpperCase()));
    const foreignMounts = API_MOUNTS.filter((m) => !isAnyArea(m.areas) && !m.areas.includes(area.toUpperCase()));
    // O que a outra área tem de exclusivo: nenhuma montagem própria é prefixo de uma estranha, e vice-versa.
    it(`${area}: nenhuma montagem de API exclusiva da área ${other} aparece no bundle`, () => {
      expect(foreignMounts.map((m) => m.path)).toContain(other === 'CNPJ' ? '/api/company' : '/api/profile');
      for (const mount of foreignMounts) {
        const clash = ownMounts.find((m) => mount.path.startsWith(m.path) || m.path.startsWith(mount.path));
        expect(clash, `${mount.path} x ${clash?.path}`).toBeUndefined();
        expect(filesWith(area, mount.path), mount.path).toEqual([]);
      }
    });

    it(`${area}: nenhum caminho de página exclusivo da área ${other} aparece no bundle`, () => {
      const ownPages = PAGES[area.toUpperCase()];
      const foreignPages = [...new Set(AREAS.filter((a) => a !== area.toUpperCase()).flatMap((a) => PAGES[a]))].filter((p) => !ownPages.includes(p));
      expect(foreignPages.length).toBeGreaterThan(0);
      for (const page of foreignPages) {
        const prefix = page.split('/:')[0];
        // /app/pay/transactions/:id e /app/payments/:id começam por /app/pay, que também é página só do CNPJ.
        expect(filesWith(area, prefix), prefix).toEqual([]);
      }
    });
  }

  // A prova pelo outro lado: tudo o que o bundle chama existe no host da área (um /api/... sem montagem ali
  // seria um 404 em produção, e é o que o CPF fazia com /api/company e /api/team).
  for (const area of ['cpf', 'cnpj']) {
    it(`${area}: todo /api/... que o bundle chama é uma montagem que o host ${area.toUpperCase()} tem`, () => {
      const called = new Set();
      for (const file of outputFiles(area).filter((f) => f.endsWith('.js'))) {
        // Fora a URL de documentação do react-three-fiber (…/react-three-fiber/api/objects): a barra vem de um nome.
        for (const m of read(area, file).matchAll(/(?<![\w./-])\/api\/[a-z-]+/g)) called.add(m[0]);
      }
      expect(called.size).toBeGreaterThan(8);
      const served = API_MOUNTS.filter((m) => isAnyArea(m.areas) || m.areas.includes(area.toUpperCase())).map((m) => m.path);
      expect([...called].filter((path) => !served.includes(path)).sort()).toEqual([]);
    });
  }

  // E os links: todo caminho de página que o bundle escreve é uma página da área (ou o começo de uma com
  // parâmetro, como "/app/opportunities/" antes do id).
  for (const area of ['cpf', 'cnpj']) {
    it(`${area}: todo link /app/..., /checkout etc. que o bundle escreve é uma página do ${area.toUpperCase()}`, () => {
      const pages = PAGES[area.toUpperCase()];
      const linked = new Set();
      for (const file of outputFiles(area).filter((f) => f.endsWith('.js'))) {
        for (const m of read(area, file).matchAll(/(?<![\w./:-])\/(?:app(?:\/[a-z0-9-]+)*|checkout|onboarding|login|forgot-password)(?![\w-])/g)) linked.add(m[0]);
      }
      expect(linked.size).toBeGreaterThan(5);
      const unknown = [...linked].filter((p) => !isPageOf(area.toUpperCase(), p) && !pages.some((page) => page.startsWith(`${p}/`)));
      expect(unknown.sort()).toEqual([]);
    });
  }

  it('o CPF não manda a pessoa a um checkout, a licitações nem a pagamentos, e o CNPJ não a "Meu perfil"', () => {
    expect(filesWith('cpf', /checkout/i)).toEqual([]);
    expect(filesWith('cpf', /\blicita[cç][oõ]es\b/i)).toEqual([]);
    expect(filesWith('cpf', /colaborador/i)).toEqual([]);
    expect(filesWith('cnpj', /pessoa f[ií]sica/i)).toEqual([]);
    expect(filesWith('cnpj', /cadastro pessoa/i)).toEqual([]);
    expect(filesWith('cnpj', /tipo=profissional/)).toEqual([]);
    expect(filesWith('cnpj', 'Profissional entra')).toEqual([]);
    expect(filesWith('cnpj', /\/app\/perfil/)).toEqual([]);
  });

  it('o CNPJ não leva a cópia, o legado nem a Home do CPF; o CPF não leva a landing nem o legado', () => {
    const cnpj = modulesOf('cnpj');
    const cpf = modulesOf('cpf');
    expect(cnpj.filter((m) => m.startsWith('apps/web/src/areas/cpf/') || m.startsWith('apps/web/src/legacy/'))).toEqual([]);
    expect(cpf.filter((m) => m.startsWith('apps/web/src/areas/cnpj/') || m.startsWith('apps/web/src/legacy/'))).toEqual([]);
    for (const legacy of ['apps/web/src/App.jsx', 'apps/web/src/main.jsx', 'apps/web/src/legacyNav.js']) {
      expect(cnpj, legacy).not.toContain(legacy);
      expect(cpf, legacy).not.toContain(legacy);
    }
    expect(cpf).toContain('apps/web/src/areas/cpf/Profile.jsx');
    expect(cpf).toContain('apps/web/src/areas/cpf/copy.js');
    expect(cnpj).toContain('apps/web/src/areas/cnpj/copy.js');
    expect(cnpj).not.toContain('apps/web/src/areas/cpf/copy.js');
  });

  it('o CPF não importa nenhum módulo de empresa: cartões, equipe, chave de repasse, checkout, landing', () => {
    const cpf = modulesOf('cpf').join('\n');
    for (const file of ['components/cards/Cards.jsx', 'pages/app/TeamCard.jsx', 'pages/app/PayoutCard.jsx', 'pages/checkout/', 'pages/landing/', 'pages/app/Overview.jsx', 'pages/app/Company.jsx', 'lib/opportunityLink.js']) {
      expect(cpf, file).not.toContain(`apps/web/src/${file}`);
    }
  });
});
