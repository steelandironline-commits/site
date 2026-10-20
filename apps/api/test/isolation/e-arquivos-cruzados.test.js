import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { disconnectPrisma } from '@autopix/core';
import { HOSTS, areaApp, makeWebDist, removeWebDist } from '../areaHelpers.js';
import { setupApp, resetDb } from '../helpers.js';
import { AREA_ENV, CNPJ_HOST, CPF_HOST, DEV_COOKIE, call, insertSession, makeAccount } from '../authAreaHelpers.js';
import { REAL_WEB_DIST, deliveredPost, describeBuild, describeDb, getBytes, listFiles, nonEmpty, realDistDir, urlOf } from './support.js';

// ISOLAMENTO · item e (PLANO_DIVISAO, ETAPA 7, item 1): arquivos de uma área inacessíveis pela outra.
// Um arquivo do dist-cnpj pedido no host CPF responde 404, e o contrário. A lista de arquivos é a do
// próprio dist (varrida pasta a pasta), não escrita à mão: arquivo novo entra no teste sozinho.
//
// Um arquivo que existe nas duas áreas com o mesmo caminho (favicon.svg, manifest.webmanifest, sw.js,
// robots.txt...) é servido a cada host com os bytes do SEU dist, nunca com os do outro.
//
// Três grupos: o dist de mentira (sempre, prova a lógica do servidor), o build de verdade
// (dist-cnpj e dist-cpf, os mesmos do deploy) e a foto do feed social, o único arquivo de usuário.

const HOST = { CNPJ: CNPJ_HOST, CPF: CPF_HOST };
const OTHER = { CNPJ: 'CPF', CPF: 'CNPJ' };
/** Existem no dist, mas nunca são entregues como arquivo. */
const NEVER_SERVED = new Set(['index.html', 'modules.json']);
const hidden = (file) => file.split('/').some((segment) => segment.startsWith('.'));

/** O conjunto de provas, sobre duas pastas de dist (uma por área) servidas por `app`. */
function fileSuite(label, describeFn, prepare) {
  describeFn(`e · arquivos · um arquivo de uma área pedido no host da outra responde 404 (${label})`, () => {
    let app;
    let dirs;
    let files;
    let cleanup = () => {};

    beforeAll(() => {
      const built = prepare();
      app = built.app;
      dirs = built.dirs;
      cleanup = built.cleanup ?? cleanup;
      files = { CNPJ: listFiles(dirs.CNPJ), CPF: listFiles(dirs.CPF) };
    });
    afterAll(() => cleanup());

    const bytesOf = (area, file) => fs.readFileSync(path.join(dirs[area], file));

    it('os dois dists têm arquivos (a varredura não é vazia) e cada um tem arquivos só seus', () => {
      for (const area of ['CNPJ', 'CPF']) {
        nonEmpty(`arquivos do dist da área ${area}`, files[area]);
        const own = files[area].filter((f) => !NEVER_SERVED.has(f) && !files[OTHER[area]].includes(f));
        expect(own.length, `arquivos que só o dist-${area.toLowerCase()} tem`).toBeGreaterThan(0);
      }
    });

    for (const area of ['CNPJ', 'CPF']) {
      const foreignHost = HOST[OTHER[area]];

      it(`cada arquivo do dist-${area.toLowerCase()} pedido em ${foreignHost}: 404 se só existe aqui, senão os bytes do dist do próprio host`, async () => {
        const wrong = [];
        for (const file of files[area]) {
          if (NEVER_SERVED.has(file) || hidden(file)) continue;
          const res = await getBytes(app, foreignHost, urlOf(file));
          const mine = files[OTHER[area]].includes(file);
          if (!mine) {
            if (res.status !== 404) wrong.push(`${file}: status ${res.status}, devia ser 404`);
          } else if (res.status !== 200 || !res.bytes.equals(bytesOf(OTHER[area], file))) {
            wrong.push(`${file}: não veio com os bytes do dist da própria área (status ${res.status})`);
          }
        }
        expect(wrong).toEqual([]);
      });

      it(`cada arquivo do dist-${area.toLowerCase()} pedido no próprio host chega inteiro (controle positivo)`, async () => {
        const wrong = [];
        let served = 0;
        for (const file of files[area]) {
          if (NEVER_SERVED.has(file) || hidden(file)) continue;
          const res = await getBytes(app, HOST[area], urlOf(file));
          served += 1;
          if (res.status !== 200 || !res.bytes.equals(bytesOf(area, file))) wrong.push(`${file}: status ${res.status}`);
        }
        expect(served).toBeGreaterThan(5);
        expect(wrong).toEqual([]);
      });

      it(`index.html e modules.json do dist-${area.toLowerCase()} nunca saem como arquivo, em nenhum host`, async () => {
        for (const host of [HOST.CNPJ, HOST.CPF]) {
          for (const file of NEVER_SERVED) {
            if (!files[area].includes(file)) continue;
            for (const variant of [`/${file}`, `/${file.toUpperCase()}`]) {
              const res = await getBytes(app, host, variant);
              expect(res.status, `${host}${variant}`).toBe(404);
            }
          }
        }
      });

      it(`caminhos com ../ não alcançam o dist-${area.toLowerCase()} pelo host ${foreignHost}`, async () => {
        const dirName = path.basename(dirs[area]);
        const sample = files[area].filter((f) => !NEVER_SERVED.has(f) && !hidden(f)).slice(0, 25);
        expect(sample.length).toBeGreaterThan(0);
        for (const file of sample) {
          for (const attack of [`/..%2f${dirName}%2f${file}`, `/%2e%2e/${dirName}/${file}`, `/assets/..%2f..%2f${dirName}%2f${file}`, `//${dirName}/${file}`, `/${file}%00.js`]) {
            const res = await getBytes(app, foreignHost, attack);
            expect(res.status, `${foreignHost}${attack}`).not.toBe(200);
          }
        }
      });
    }

    it('arquivos de mesmo caminho nas duas áreas (favicon, manifest, sw.js...) têm conteúdo diferente: o teste de bytes distingue um do outro', () => {
      const shared = files.CNPJ.filter((f) => files.CPF.includes(f) && !NEVER_SERVED.has(f));
      expect(shared.length).toBeGreaterThan(0);
      expect(shared.filter((f) => !bytesOf('CNPJ', f).equals(bytesOf('CPF', f))).length).toBeGreaterThan(0);
    });

    it('um arquivo que não existe em nenhum dist responde 404 em texto simples nos dois hosts', async () => {
      for (const host of [HOST.CNPJ, HOST.CPF]) {
        for (const p of ['/assets/nao-existe-12345.js', '/nao-existe.css', '/.env', '/package.json', '/sitemap-que-nao-existe.xml']) {
          const res = await request(app).get(p).set('Host', host);
          expect(res.status, `${host}${p}`).toBe(404);
          expect(res.headers['content-type'], `${host}${p}`).toMatch(/text\/plain/);
        }
      }
    });

    it('host desconhecido não entrega arquivo de dist nenhum, e o apelido de redirecionamento só redireciona', async () => {
      const sample = nonEmpty('arquivos para o host desconhecido', [...files.CNPJ, ...files.CPF].filter((f) => !NEVER_SERVED.has(f)).slice(0, 40));
      for (const file of sample) {
        expect((await request(app).get(urlOf(file)).set('Host', 'x.up.railway.app')).status, file).toBe(404);
        const moved = await request(app).get(urlOf(file)).set('Host', 'temcpf.com.br');
        expect(moved.status, file).toBe(301);
        expect(moved.headers.location, file).toMatch(/^http:\/\/cpf\.temcnpj\.com\.br\//);
      }
    });
  });
}

fileSuite('dist de mentira', describe, () => {
  const webDist = makeWebDist();
  const root = path.dirname(webDist);
  return { app: areaApp(HOSTS, { webDist }).app, dirs: { CNPJ: path.join(root, 'dist-cnpj'), CPF: path.join(root, 'dist-cpf') }, cleanup: () => removeWebDist(webDist) };
});

fileSuite('build de verdade', describeBuild, () => ({
  app: areaApp(HOSTS, { webDist: REAL_WEB_DIST }).app,
  dirs: { CNPJ: realDistDir('CNPJ'), CPF: realDistDir('CPF') },
}));

describe('e · arquivos · o dist legado nunca é servido no modo de áreas (dist de mentira)', () => {
  it('um arquivo que só o dist/ legado tem responde 404 nos dois hosts de área', async () => {
    const webDist = makeWebDist();
    try {
      const { app } = areaApp(HOSTS, { webDist });
      const legacyOnly = nonEmpty(
        'arquivos só do dist legado',
        listFiles(webDist).filter((f) => !NEVER_SERVED.has(f) && !listFiles(path.join(path.dirname(webDist), 'dist-cnpj')).includes(f) && !listFiles(path.join(path.dirname(webDist), 'dist-cpf')).includes(f)),
      );
      for (const host of [HOST.CNPJ, HOST.CPF]) {
        for (const file of legacyOnly) expect((await getBytes(app, host, urlOf(file))).status, `${host}/${file}`).toBe(404);
      }
    } finally {
      removeWebDist(webDist);
    }
  });
});

// ---- a foto do feed: o único arquivo de usuário (ARQUITETURA 8) ---------------------------------
describeDb('e · arquivos · a foto de um post de uma área não sai pelo host da outra (com banco)', () => {
  let ctx;
  let token;
  let companyPost;
  let personPost;

  beforeAll(async () => {
    ctx = await setupApp({ ...AREA_ENV, DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
    const company = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    const other = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    const person = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    const otherPerson = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    const session = async (account, area) => (await insertSession(ctx.prisma, ctx.config, { userId: account.user.id, area })).token;
    token = { other: await session(other, 'CNPJ'), otherPerson: await session(otherPerson, 'CPF') };
    companyPost = await deliveredPost(ctx, company);
    personPost = await deliveredPost(ctx, person);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  const photo = (host, who, id, extra = {}) => call(ctx.app, host, 'get', `/api/social/posts/${id}/photo`, { origin: null, xrw: null, cookie: who ? `${DEV_COOKIE[host]}=${token[who]}` : undefined, ...extra });

  it('a foto da própria área sai (controle positivo), com cache privado', async () => {
    for (const [host, who, id] of [[CNPJ_HOST, 'other', companyPost], [CPF_HOST, 'otherPerson', personPost]]) {
      const res = await photo(host, who, id);
      expect(res.status, host).toBe(200);
      expect(res.headers['content-type']).toContain('image/jpeg');
      expect(res.headers['cache-control']).toMatch(/private/);
      expect(res.headers['cache-control']).toMatch(/no-store/);
    }
  });

  it('a foto de outra área responde 404, igual a um post que não existe', async () => {
    const nothing = await photo(CPF_HOST, 'otherPerson', 'post-que-nao-existe');
    expect(nothing.status).toBe(404);
    for (const [host, who, id] of [[CPF_HOST, 'otherPerson', companyPost], [CNPJ_HOST, 'other', personPost]]) {
      const res = await photo(host, who, id);
      expect(res.status, `${host}/${id}`).toBe(404);
      expect(res.body, `${host}/${id}`).toEqual(host === CPF_HOST ? nothing.body : (await photo(CNPJ_HOST, 'other', 'post-que-nao-existe')).body);
    }
  });

  it('sem sessão a foto não sai em host nenhum, e o token da outra área é recusado', async () => {
    for (const [host, id] of [[CNPJ_HOST, companyPost], [CPF_HOST, personPost], [CPF_HOST, companyPost], [CNPJ_HOST, personPost]]) {
      expect((await photo(host, null, id)).status, `${host}/${id}`).toBe(401);
    }
    const relabeled = await call(ctx.app, CPF_HOST, 'get', `/api/social/posts/${companyPost}/photo`, { origin: null, xrw: null, cookie: `${DEV_COOKIE[CPF_HOST]}=${token.other}` });
    expect(relabeled.status).toBe(403);
  });
});
