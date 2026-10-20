import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGES, markersFor } from '@autopix/areas';
import { HOSTS, areaApp } from '../areaHelpers.js';
import { CNPJ_HOST, CPF_HOST } from '../authAreaHelpers.js';
import { REAL_WEB_DIST, concretePath, describeBuild, getBytes, listFiles, nonEmpty, realDistDir, urlOf } from './support.js';

// ISOLAMENTO · item d (PLANO_DIVISAO, ETAPA 7, item 1): o bundle de cada área sem textos e nomes de
// telas da outra.
//
// A prova principal já existe e roda no mesmo `npm run test:isolation`: apps/web/test/bundle-isolation.test.js
// (monta cada área de verdade e confere módulos, marcadores, chamadas de API e links) e
// apps/web/test/area-public.test.js (HTML, manifest e robots de cada área). Esta é a outra metade:
// o MESMO conjunto de marcadores (packages/areas/src/markers.js, uma lista só), aplicado ao que o
// servidor entrega de verdade no host da área, a partir do build que vai para o deploy
// (apps/web/dist-cnpj e dist-cpf). Se o servidor entregasse o arquivo errado, ou o build do deploy
// saísse diferente do build do teste, é aqui que apareceria.

const HOST = { CNPJ: CNPJ_HOST, CPF: CPF_HOST };
const TEXT = /\.(js|css|html|json|webmanifest|txt|xml|svg)$/;
const NEVER_SERVED = new Set(['index.html', 'modules.json']);

describeBuild('d · bundle servido · nenhum marcador da outra área no que o host entrega (build de verdade)', () => {
  let server; // criado no primeiro uso: sem o build o grupo é PULADO e o app nem sobe
  const cache = new Map();

  /** Tudo o que o host da área entrega como texto: cada arquivo do dist e as páginas do manifesto (lido uma vez por área). */
  function served(area) {
    if (!cache.has(area)) cache.set(area, collect(area));
    return cache.get(area);
  }
  async function collect(area) {
    const out = new Map();
    server ??= areaApp(HOSTS, { webDist: REAL_WEB_DIST }).app;
    const get = async (urlPath) => (await getBytes(server, HOST[area], urlPath)).bytes.toString('utf8');
    for (const file of listFiles(realDistDir(area))) {
      if (NEVER_SERVED.has(file) || !TEXT.test(file)) continue;
      out.set(`/${file}`, await get(urlOf(file)));
    }
    for (const page of PAGES[area].map(concretePath)) out.set(page, await get(page));
    return out;
  }

  for (const area of ['CPF', 'CNPJ']) {
    const markers = nonEmpty(`marcadores da área ${area}`, markersFor(area));

    it(`${area}: o que o host entrega tem arquivos de verdade (a busca não é vazia)`, async () => {
      const files = await served(area);
      expect([...files.keys()].filter((f) => f.endsWith('.js')).length).toBeGreaterThan(15);
      expect([...files.values()].every((text) => typeof text === 'string')).toBe(true);
      expect(files.get('/')?.length ?? 0).toBeGreaterThan(200);
    });

    for (const marker of markers) {
      it(`${area}: nenhum arquivo entregue contém ${JSON.stringify(marker)}`, async () => {
        const hits = [];
        for (const [name, text] of await served(area)) if (text.includes(marker)) hits.push(name);
        expect(hits).toEqual([]);
      });
    }
  }

  it('cada host entrega o vocabulário da própria área (os marcadores da outra existem nas fontes dela)', async () => {
    const all = async (area) => [...(await served(area)).values()].join('\n');
    expect(await all('CNPJ')).toContain('/api/company');
    expect(await all('CPF')).toContain('/api/profile');
    expect(await all('CPF')).toContain('Tem CPF');
    expect(await all('CNPJ')).toContain('CNPJ');
  });

  it('o que o host entrega é o que está no dist (o servidor não troca o arquivo)', async () => {
    for (const area of ['CPF', 'CNPJ']) {
      const files = await served(area);
      for (const file of listFiles(realDistDir(area)).filter((f) => TEXT.test(f) && !NEVER_SERVED.has(f)).slice(0, 60)) {
        expect(files.get(`/${file}`), file).toBe(fs.readFileSync(path.join(realDistDir(area), file), 'utf8'));
      }
    }
  });
});
