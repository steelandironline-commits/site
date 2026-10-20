import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { build } from 'vite';
import { AREAS, EXCLUSIVE_FILES } from '@autopix/areas';
import { areaBoundary } from '../vite-plugins/areaBoundary.js';

// O plugin areaBoundary derruba o build quando uma área importa código de outra.
// Cada caso abaixo é um build de verdade (Rollup, em memória) de uma entrada da fixture
// test/fixtures/boundary, onde a área "cpf" tenta importar algo que não é dela.

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, 'fixtures/boundary');
const repoRoot = path.resolve(here, '../../..');
const realWebRoot = path.resolve(here, '..');
const entry = (name) => path.join(fixture, 'src/areas/cpf', name);

const fixtureOptions = {
  repoRoot,
  webRoot: fixture,
  areas: AREAS,
  // Na fixture, pages/pay/ é página exclusiva do CNPJ, como pages/app/Pay.jsx é no app real.
  exclusiveFiles: { CNPJ: ['pages/pay/'], CPF: [], ADMIN: [] },
};
const realOptions = { repoRoot, webRoot: realWebRoot, areas: AREAS, exclusiveFiles: EXCLUSIVE_FILES };

async function run(input, { area = 'cpf', options = fixtureOptions } = {}) {
  try {
    const output = await build({
      root: fixture,
      configFile: false,
      envFile: false,
      logLevel: 'silent',
      plugins: [areaBoundary(area, options)],
      build: { write: false, minify: false, rollupOptions: { input } },
    });
    const files = (Array.isArray(output) ? output : [output]).flatMap((o) => o.output.map((f) => f.fileName));
    return { ok: true, files };
  } catch (error) {
    return { ok: false, message: String(error.message) };
  }
}

describe('areaBoundary · o que passa', () => {
  it('entrada com arquivo comum, marca da plataforma e marca da própria área', async () => {
    const result = await run(entry('ok.js'));
    expect(result.ok, result.message).toBe(true);
  });
});

describe('areaBoundary · import proibido derruba o build', () => {
  const cases = [
    ['bad-area-folder.js', /Fronteira de área \(cpf\).*src\/areas\/cnpj\/secret\.js.*pasta da área CNPJ/s],
    ['bad-dynamic.js', /pasta da área CNPJ/],
    ['bad-exclusive-page.js', /pages\/pay\/Pay\.js.*exclusivo da área CNPJ \(manifesto\)/s],
    ['bad-brand.js', /packages\/areas\/src\/brand\/cnpj\.js.*marca da área CNPJ/s],
    ['bad-manifest.js', /packages\/areas\/src\/manifest\.js.*só de servidor/s],
    ['bad-server-only.js', /packages\/areas\/src\/index\.js.*só de servidor/s],
    ['bad-server-only-areas.js', /packages\/areas\/src\/areas\.js.*só de servidor/s],
  ];
  for (const [file, message] of cases) {
    it(file, async () => {
      const result = await run(entry(file));
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(message);
    });
  }

  it('a mensagem diz quem importou', async () => {
    const result = await run(entry('bad-area-folder.js'));
    expect(result.message).toContain('bad-area-folder.js');
  });

  it('o mesmo conteúdo não é proibido para a área dona dele', async () => {
    const result = await run(path.join(fixture, 'src/areas/cnpj/own.js'), { area: 'cnpj' });
    expect(result.ok, result.message).toBe(true);
  });
});

describe('areaBoundary · com a árvore real de apps/web', () => {
  const realCases = [
    // [descrição, build da área, arquivo importado]
    ['CPF importando a tela de pagamentos', 'cpf', 'src/pages/app/Pay.jsx'],
    ['CPF importando a landing', 'cpf', 'src/pages/landing/Landing.jsx'],
    ['CPF importando o menu do CNPJ', 'cpf', 'src/areas/cnpj/nav.js'],
    ['CNPJ importando a Home do CPF', 'cnpj', 'src/areas/cpf/Home.jsx'],
    ['CNPJ importando a tela de admin', 'cnpj', 'src/pages/app/Admin.jsx'],
  ];
  for (const [label, area, file] of realCases) {
    it(label, async () => {
      const result = await run(path.join(realWebRoot, file), { area, options: realOptions });
      expect(result.ok).toBe(false);
      expect(result.message).toContain(`Fronteira de área (${area})`);
    });
  }
});
