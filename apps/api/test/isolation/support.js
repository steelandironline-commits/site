import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import request from 'supertest';
import { distDirOf, isAnyArea } from '@autopix/areas';
import { EmailService } from '@autopix/core';
import { buildServices } from '../../src/app.js';
import { stubPrisma } from '../areaHelpers.js';
import { ROOT } from '../dbUrl.js';
import { AREA_ENV, call } from '../authAreaHelpers.js';
import { testConfig } from '../helpers.js';

// Apoio da suíte de isolamento (ETAPA 7, `npm run test:isolation`). Não tem teste próprio.
//
// Regra da suíte: nada é pulado em silêncio. Sem banco de teste ou sem o build das áreas, o grupo
// que depende deles aparece como PULADO com o motivo no próprio título (e o script da raiz soma e
// avisa). No modo estrito (ISOLATION_STRICT=1, que `npm run test:isolation` liga sozinho quando CI=true)
// o mesmo caso FALHA, em vez de pular: a suíte é obrigatória lá. `npm test` não é estrito, porque no
// CI ele roda antes de `npm run build:areas`; quem garante o build é o `test:isolation`.

/** ISOLATION_STRICT=1 (ligado por scripts/test-isolation.mjs no CI ou com --strict): pular vira falha. */
export const STRICT = process.env.ISOLATION_STRICT === '1';

/** O globalSetup do vitest (apps/api/test/globalSetup.js) liga isto quando o banco de teste migrou. */
export const dbReady = process.env.AUTOPIX_TEST_DB_READY === '1';

const NO_DB = 'sem banco de teste: defina DATABASE_URL ou TEST_DATABASE_URL de um Postgres local (o nome deve conter "test") e rode de novo';
const NO_BUILD = 'sem os builds das áreas: rode "npm run build:areas" antes';

/** Um grupo que precisa de banco. Sem banco: PULADO com motivo, ou FALHA no modo estrito. */
export function describeDb(name, fn) {
  if (dbReady) return describe(name, fn);
  return unavailable(name, fn, NO_DB);
}

/** Um grupo que precisa de apps/web/dist-cnpj e dist-cpf. Sem eles: PULADO com motivo, ou FALHA no modo estrito. */
export function describeBuild(name, fn) {
  if (realBuildReady) return describe(name, fn);
  return unavailable(name, fn, NO_BUILD);
}

/** Um grupo que precisa dos dois. */
export function describeDbAndBuild(name, fn) {
  if (dbReady && realBuildReady) return describe(name, fn);
  return unavailable(name, fn, [dbReady ? null : NO_DB, realBuildReady ? null : NO_BUILD].filter(Boolean).join(' | '));
}

function unavailable(name, fn, reason) {
  if (STRICT) {
    return describe(name, () => {
      it(`obrigatório no modo estrito (CI): ${reason}`, () => {
        throw new Error(`${name}: ${reason}`);
      });
    });
  }
  return describe.skip(`${name} [PULADO: ${reason}]`, fn);
}

/** Falha na hora (na coleta) se uma lista que deveria ser derivada do app ou do manifesto vier vazia. */
export function nonEmpty(label, list) {
  if (!Array.isArray(list) || list.length === 0) throw new Error(`A lista "${label}" veio vazia: o teste passaria sem provar nada.`);
  return list;
}

// ---------------------------------------------------------------------------------------------
// Builds de verdade (apps/web/dist-cnpj e dist-cpf), os mesmos que o deploy serve.

export const WEB_ROOT = path.join(ROOT, 'apps/web');
/** `webDist` do createApp: só o dirname importa no modo de áreas (dist-<área> fica ao lado). */
export const REAL_WEB_DIST = path.join(WEB_ROOT, 'dist');
export const realDistDir = (area) => path.join(WEB_ROOT, distDirOf(area));
export const realBuildReady = ['CNPJ', 'CPF'].every((area) => fs.existsSync(path.join(realDistDir(area), 'index.html')));

/** Todos os arquivos de uma pasta, como caminhos relativos com "/" (ordem estável). */
export function listFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) walk(file);
      else out.push(path.relative(dir, file).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/** GET que devolve os bytes (Buffer), qualquer que seja o tipo do arquivo. */
export async function getBytes(app, host, urlPath) {
  const res = await request(app)
    .get(urlPath)
    .set('Host', host)
    .buffer(true)
    .parse((r, cb) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
  return { status: res.status, bytes: res.body instanceof Buffer ? res.body : Buffer.from(''), type: res.headers['content-type'] };
}

/** O caminho de um arquivo como URL (cada segmento codificado). */
export const urlOf = (file) => `/${file.split('/').map(encodeURIComponent).join('/')}`;

/** O caminho de uma página do manifesto com valores de exemplo no lugar dos parâmetros. */
export const concretePath = (pattern) => pattern.replace(/:token\b/g, 'tok-abc123').replace(/:[A-Za-z]+/g, '123');

// ---------------------------------------------------------------------------------------------
// Rotas cruzadas.

export const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } };
export const METHODS = ['get', 'head', 'post', 'put', 'patch', 'delete'];
export const SUBPATHS = ['', '/qualquer', '/1/detalhe'];

/** Montagens em que o host da área NÃO existe (a infraestrutura existe em todos). */
export const foreignTo = (mounts, area) => mounts.filter((m) => !isAnyArea(m.areas) && !m.areas.includes(area));

/** Montagens em que o host da área existe (e a infraestrutura). */
export const ownTo = (mounts, area) => mounts.filter((m) => isAnyArea(m.areas) || m.areas.includes(area));

/**
 * Pede cada montagem, com cada método e subcaminho, e devolve o que NÃO foi um 404 neutro
 * (lista vazia = isolado). `auth` troca o jeito de se identificar. HEAD não tem corpo: só o status vale.
 */
export async function leaks(app, host, mounts, auth = {}) {
  const out = [];
  for (const mount of mounts) {
    for (const method of METHODS) {
      for (const sub of SUBPATHS) {
        const res = await call(app, host, method, `${mount.path}${sub}`, { body: ['get', 'head'].includes(method) ? undefined : {}, ...auth });
        const neutral = res.status === 404 && (method === 'head' || JSON.stringify(res.body) === JSON.stringify(NOT_FOUND));
        if (!neutral) out.push(`${method.toUpperCase()} ${host}${mount.path}${sub} -> ${res.status} ${JSON.stringify(res.body).slice(0, 80)}`);
      }
    }
  }
  return out;
}

/** Junta listas de montagens de fontes diferentes (app.js e manifesto) sem repetir caminho+áreas. */
export function unionMounts(...lists) {
  const seen = new Map();
  for (const mount of lists.flat()) seen.set(`${mount.path} [${[...mount.areas].sort().join(',')}]`, mount);
  return [...seen.values()];
}

// ---------------------------------------------------------------------------------------------
// Ações.

/** O catálogo de ações como o motor o registra: { name, areas }. Sem banco (prisma de mentira). */
export function registeredActions(env = AREA_ENV) {
  const config = testConfig(env);
  const services = buildServices({ config, prisma: stubPrisma, email: new EmailService({ config }) });
  return [...services.actions.actions.values()].map(({ name, areas }) => ({ name, areas }));
}

// ---------------------------------------------------------------------------------------------
// Dados.

const PHOTO = 'data:image/jpeg;base64,/9j/2Q==';

/**
 * Negócio entregue e confirmado do vendedor, com a opinião já publicada (foto de 4 bytes).
 * Devolve o id do post. `ctx` é o que `setupApp` devolve.
 */
export async function deliveredPost(ctx, seller, { photo = PHOTO } = {}) {
  const t = await ctx.services.transactions.create({ user: seller.user, company: seller.company, grossCents: 100000, description: 'Serviço', buyerEmail: null });
  await ctx.prisma.marketplaceTransaction.update({
    where: { id: t.id },
    data: {
      status: 'PAID',
      sellerCompletedAt: new Date(),
      buyerConfirmedAt: new Date(),
      isSandbox: true,
      payment: { create: { companyId: seller.company.id, idempotencyKey: `social-area-${t.id}`, kind: 'CHARGE', status: 'CONFIRMED', provider: 'mock', amountCents: 100000, paidAt: new Date(), isSandbox: true } },
    },
  });
  const { post } = await ctx.services.social.publish({ user: seller.user, company: seller.company, transactionId: t.id, body: `Opinião de ${seller.user.name}`, photo });
  return post.id;
}
