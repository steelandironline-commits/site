import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ALL_PAGES, API_MOUNTS, EXCLUSIVE_PAGES, PAGES, isAnyArea } from '@autopix/areas';
import { disconnectPrisma } from '@autopix/core';
import { mountsOf } from '../../src/middleware/area.js';
import { HOSTS, areaApp, makeWebDist, removeWebDist } from '../areaHelpers.js';
import { setupApp, resetDb } from '../helpers.js';
import { AREA_ENV, CNPJ_HOST, CPF_HOST, DEV_COOKIE, call, insertSession, makeAccount } from '../authAreaHelpers.js';
import {
  REAL_WEB_DIST,
  concretePath,
  describeBuild,
  describeDb,
  foreignTo,
  leaks,
  nonEmpty,
  ownTo,
  realDistDir,
  registeredActions,
  unionMounts,
} from './support.js';

// ISOLAMENTO · item a (PLANO_DIVISAO, ETAPA 7, item 1).
// A partir do host CPF, toda rota e todo endpoint do CNPJ responde 404 (ou 403). A partir do host CNPJ,
// toda rota e todo endpoint do CPF também. As listas NÃO são escritas à mão: vêm das montagens do
// próprio app.js (mountsOf), do manifesto (API_MOUNTS, PAGES) e do catálogo de ações do motor.
// Uma lista vazia derruba o arquivo na coleta: um teste que itera nada não prova nada.
//
// A parte de cima não precisa de banco (o app sobe com um prisma de mentira; o 404 vem antes de
// qualquer autenticação). A de baixo percorre as ações com sessões de verdade e precisa do banco.

const HOST = { CNPJ: CNPJ_HOST, CPF: CPF_HOST };
const OTHER = { CNPJ: 'CPF', CPF: 'CNPJ' };
const UNKNOWN_ACTION = { error: { code: 'NOT_FOUND', message: 'Ação desconhecida.' } };

// ---- listas derivadas (na coleta) ------------------------------------------------------------
const appMounts = nonEmpty('montagens do app.js (mountsOf)', mountsOf(areaApp(HOSTS).app));
const manifestMounts = nonEmpty('montagens do manifesto (API_MOUNTS)', [...API_MOUNTS]);
const MOUNTS = unionMounts(appMounts, manifestMounts);

/** Páginas do manifesto que o host da área NÃO tem (as das outras áreas, menos as que a área também tem). */
const foreignPages = (area) =>
  nonEmpty(
    `páginas de outras áreas vistas do host ${area}`,
    [...new Set(Object.keys(PAGES).filter((a) => a !== area).flatMap((a) => PAGES[a]))].filter((p) => !PAGES[area].includes(p)).map(concretePath),
  );

/** Resposta de uma página: o que o navegador receberia, para comparar uma página estranha com uma que não existe. */
const shape = (res) => ({ status: res.status, text: res.text, type: res.headers['content-type'], cache: res.headers['cache-control'], length: res.headers['content-length'], location: res.headers.location });

// ---- API: sem banco --------------------------------------------------------------------------
describe('a · API · toda montagem da outra área responde 404 neutro (sem banco)', () => {
  const { app } = areaApp(HOSTS);

  it('as listas existem: o app, o manifesto e o que cada host não tem', () => {
    expect(appMounts.length).toBeGreaterThan(25);
    expect(MOUNTS.length, 'o app e o manifesto declaram as mesmas montagens').toBe(manifestMounts.length);
    expect(foreignTo(MOUNTS, 'CPF').map((m) => m.path)).toEqual(expect.arrayContaining(['/api/company', '/api/pay', '/api/team', '/api/payments', '/api/intermediation', '/api/freight', '/api/workforce', '/api/tenders']));
    expect(foreignTo(MOUNTS, 'CNPJ').map((m) => m.path)).toEqual(['/api/profile']);
  });

  for (const area of ['CPF', 'CNPJ']) {
    const foreign = nonEmpty(`montagens que o host ${area} não tem`, foreignTo(MOUNTS, area));
    for (const mount of foreign) {
      it(`${HOST[area]} · ${mount.path} [${mount.areas.join(',')}] responde 404 em todo método e subcaminho`, async () => {
        expect(await leaks(app, HOST[area], [mount])).toEqual([]);
      });
    }

    it(`${HOST[area]} · o preflight (OPTIONS) de rota da outra área é igual ao de uma rota que não existe`, async () => {
      const preflight = (p) => request(app).options(p).set('Host', HOST[area]).set('Origin', `http://${HOST[area]}`).set('Access-Control-Request-Method', 'POST');
      const baseline = await preflight('/api/nao-existe-mesmo');
      for (const mount of foreign) {
        const res = await preflight(mount.path);
        expect({ status: res.status, allow: res.headers['access-control-allow-origin'] }, mount.path).toEqual({ status: baseline.status, allow: baseline.headers['access-control-allow-origin'] });
      }
    });

    it(`${HOST[area]} · as montagens do próprio host continuam existindo (a guarda não fecha a área certa)`, async () => {
      const own = nonEmpty(`montagens do host ${area}`, ownTo(MOUNTS, area).filter((m) => !isAnyArea(m.areas)));
      let reached = 0;
      for (const mount of own) {
        // Alguns routers só têm subcaminhos (/api/cep/:cep, /api/auth/login): a raiz deles responde 404 em qualquer host.
        const res = await call(app, HOST[area], 'get', mount.path, { origin: null, xrw: null });
        if (res.status !== 404) reached += 1;
      }
      expect(reached, `${reached} de ${own.length} montagens chegam ao router no host ${area}`).toBeGreaterThanOrEqual(Math.ceil(own.length / 2));
    });
  }

  it('host desconhecido: toda montagem (menos a infraestrutura) e toda página do manifesto respondem 404', async () => {
    const stranger = 'x.up.railway.app';
    const guarded = nonEmpty('montagens com área', MOUNTS.filter((m) => !isAnyArea(m.areas)));
    for (const mount of guarded) {
      const res = await call(app, stranger, 'get', mount.path, { origin: null, xrw: null });
      expect(res.status, mount.path).toBe(404);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
    for (const page of nonEmpty('páginas do manifesto', ALL_PAGES.map(concretePath))) {
      const res = await request(app).get(page).set('Host', stranger);
      expect(res.status, page).toBe(404);
      expect(res.text, page).toBe('Not Found');
    }
  });

  it('host de redirecionamento nunca serve rota: responde 301 para o host da área dona do apelido', async () => {
    const aliases = [['temcpf.com.br', 'cpf.temcnpj.com.br'], ['www.temcpf.com.br', 'cpf.temcnpj.com.br'], ['www.temcnpj.com.br', 'temcnpj.com.br']];
    for (const [alias, target] of aliases) {
      for (const mount of nonEmpty('montagens com área', MOUNTS.filter((m) => !isAnyArea(m.areas)))) {
        const res = await call(app, alias, 'get', `${mount.path}?x=1`, { origin: null, xrw: null });
        expect(res.status, `${alias}${mount.path}`).toBe(301);
        const location = new URL(res.headers.location);
        expect(location.host, `${alias}${mount.path}`).toBe(target);
        expect(location.pathname + location.search).toBe(`${mount.path}?x=1`);
      }
    }
  });
});

// ---- páginas: sem banco ----------------------------------------------------------------------
/**
 * O mesmo conjunto de provas, com o dist de mentira (sempre) e com o build de verdade. Os nomes dos casos
 * vêm do manifesto; o app e o index.html só são lidos dentro dos casos, então o grupo do build de verdade
 * pode ser PULADO (com motivo) sem mexer na lista.
 */
function pageSuite(label, describeFn, makeApp, indexOf) {
  describeFn(`a · páginas · toda página da outra área responde 404 sem redirecionar (${label})`, () => {
    let app;
    let cleanup = () => {};
    beforeAll(() => {
      const built = makeApp();
      app = built.app;
      cleanup = built.cleanup ?? cleanup;
    });
    afterAll(() => cleanup());

    const page = (host, p) => request(app).get(p).set('Host', host);

    it('o manifesto declara páginas próprias de cada área e do admin', () => {
      expect(EXCLUSIVE_PAGES.CNPJ.length).toBeGreaterThan(10);
      expect(EXCLUSIVE_PAGES.CPF.length).toBeGreaterThan(0);
      expect(EXCLUSIVE_PAGES.ADMIN.length).toBeGreaterThan(0);
    });

    for (const area of ['CPF', 'CNPJ']) {
      const pages = foreignPages(area);
      for (const p of pages) {
        it(`${HOST[area]}${p} responde 404 com o index.html da própria área, igual a uma página que não existe`, async () => {
          const res = await page(HOST[area], p);
          expect(res.status).toBe(404);
          expect(res.headers.location).toBeUndefined();
          expect(res.headers['content-type']).toMatch(/text\/html/);
          expect(res.text).toBe(indexOf(area));
          const nowhere = await page(HOST[area], '/rota/que/nao/existe');
          expect(shape(res)).toEqual(shape(nowhere));
        });
      }

      it(`${HOST[area]} · as páginas da própria área respondem 200 (a guarda não fecha a área certa)`, async () => {
        for (const p of nonEmpty(`páginas do host ${area}`, PAGES[area].map(concretePath))) {
          const res = await page(HOST[area], p);
          expect(res.status, `${HOST[area]}${p}`).toBe(200);
          expect(res.text).toBe(indexOf(area));
        }
      });
    }

    it('as páginas do admin não existem em nenhum dos dois hosts', async () => {
      for (const p of EXCLUSIVE_PAGES.ADMIN) {
        for (const area of ['CPF', 'CNPJ']) expect((await page(HOST[area], p)).status, `${HOST[area]}${p}`).toBe(404);
      }
    });

    it('a consulta e a caixa das letras não abrem a página da outra área', async () => {
      for (const area of ['CPF', 'CNPJ']) {
        for (const p of foreignPages(area)) {
          for (const variant of [`${p}?x=1`, p.toUpperCase(), `${p}/`]) {
            expect((await page(HOST[area], variant)).status, `${HOST[area]}${variant}`).toBe(404);
          }
        }
      }
    });
  });
}

pageSuite(
  'dist de mentira',
  describe,
  () => {
    const webDist = makeWebDist();
    return { app: areaApp(HOSTS, { webDist }).app, cleanup: () => removeWebDist(webDist) };
  },
  (area) => `<!doctype html><title>spa-fixture-${area.toLowerCase()}</title><div id="root"></div>`,
);

pageSuite(
  'build de verdade',
  describeBuild,
  () => ({ app: areaApp(HOSTS, { webDist: REAL_WEB_DIST }).app }),
  (area) => fs.readFileSync(path.join(realDistDir(area), 'index.html'), 'utf8'),
);

// ---- ações: com banco ------------------------------------------------------------------------
const ACTIONS = nonEmpty('catálogo de ações do motor', registeredActions());
const LISTED = { CPF: ACTIONS.filter((a) => !a.areas.includes('CPF')), CNPJ: ACTIONS.filter((a) => !a.areas.includes('CNPJ')), ADMIN: ACTIONS.filter((a) => !a.areas.includes('ADMIN')) };

describeDb('a · ações · todo endpoint de ação da outra área responde 404 "Ação desconhecida" (com banco)', () => {
  let ctx;
  let token;

  beforeAll(async () => {
    ctx = await setupApp(AREA_ENV);
    await resetDb(ctx.prisma);
    const company = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    const person = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    const admin = await makeAccount(ctx.prisma, { accountType: 'PERSON', platformAdmin: true });
    token = {
      CNPJ: (await insertSession(ctx.prisma, ctx.config, { userId: company.user.id, area: 'CNPJ' })).token,
      CPF: (await insertSession(ctx.prisma, ctx.config, { userId: person.user.id, area: 'CPF' })).token,
      ADMIN: (await insertSession(ctx.prisma, ctx.config, { userId: admin.user.id, area: 'ADMIN' })).token,
    };
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  const act = (area, host, name) => call(ctx.app, host, 'post', `/api/actions/${name}`, { body: { input: {} }, cookie: `${DEV_COOKIE[host]}=${token[area]}` });

  it('o catálogo tem ações de cada tipo (a lista do motor não está vazia nem é de uma área só)', () => {
    expect(ACTIONS.length).toBeGreaterThan(30);
    for (const area of ['CPF', 'CNPJ', 'ADMIN']) expect(LISTED[area].length, area).toBeGreaterThan(0);
    expect(ACTIONS.some((a) => a.areas.includes('CPF'))).toBe(true);
    expect(ACTIONS.every((a) => Array.isArray(a.areas) && a.areas.length > 0)).toBe(true);
  });

  for (const [area, host] of [['CPF', CPF_HOST], ['CNPJ', CNPJ_HOST], ['ADMIN', CNPJ_HOST]]) {
    for (const action of LISTED[area]) {
      it(`${area} em ${host} · ${action.name} (áreas: ${action.areas.join(',')}) responde 404 "Ação desconhecida"`, async () => {
        const res = await act(area, host, action.name);
        expect(res.status).toBe(404);
        expect(res.body).toEqual(UNKNOWN_ACTION);
      });
    }

    it(`${area} em ${host} · o catálogo listado é exatamente o das ações da área (nenhuma de outra aparece)`, async () => {
      const res = await call(ctx.app, host, 'get', '/api/actions', { origin: null, xrw: null, cookie: `${DEV_COOKIE[host]}=${token[area]}` });
      expect(res.status).toBe(200);
      const expected = ACTIONS.filter((a) => a.areas.includes(area)).map((a) => a.name).sort();
      expect(expected.length).toBeGreaterThan(0);
      expect(res.body.items.map((a) => a.name).sort()).toEqual(expected);
    });
  }
});
