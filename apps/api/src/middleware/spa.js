// SPA por área (ARQUITETURA, seção 4). No modo de áreas, cada host recebe só o build da sua área:
// apps/web/dist-<área>, ao lado do `dist/` legado (que nunca é servido neste modo).
//
//  - Página da área (PAGES.<área> do manifesto): 200 com o index.html da área.
//  - Qualquer outro caminho de página: 404 com o mesmo index.html. O roteador da área mostra a
//    NotFound neutra; não há redirecionamento, e a resposta é igual para um caminho que existe
//    só na outra área e para um que não existe em lugar nenhum.
//  - Arquivos (assets, sw.js, manifest.webmanifest, robots.txt, favicon, ícones): só do dist da
//    área. Arquivo que não está nele responde 404 em texto simples.
//  - /index.html e /modules.json (lista de módulos do build) nunca são entregues como arquivo.
//
// O host decide a área (hostArea). Esta camada só escolhe a pasta; quem autoriza é a sessão.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { AREAS, distDirOf, isPageOf } from '@autopix/areas';
import { logger } from '@autopix/core';

/** Mesmo corpo do 404 do hostArea fora de /api. */
const notFoundText = (res) => res.status(404).type('text/plain').send('Not Found');

/** Arquivos do dist que existem, mas não são para o navegador. */
const NEVER_SERVED = new Set(['/index.html', '/modules.json']);

/** Parece pedido de arquivo (tem extensão, ou está em /assets) e não de página. */
const isFileLike = (pathname) => pathname.startsWith('/assets/') || /\.[A-Za-z0-9]+$/.test(pathname.slice(pathname.lastIndexOf('/') + 1));

/** Pasta de build da área, ao lado do webDist legado (apps/web/dist -> apps/web/dist-cnpj). */
export function areaDistDir(webDist, area) {
  return path.join(path.dirname(path.resolve(webDist)), distDirOf(area));
}

function areaHandler(area, dir) {
  const router = express.Router();
  const noCache = (res) => res.set('Cache-Control', 'no-cache');

  router.use((req, res, next) => (NEVER_SERVED.has(req.path.toLowerCase()) ? notFoundText(res) : next()));
  router.use('/assets', express.static(path.join(dir, 'assets'), { immutable: true, maxAge: '1y', index: false, redirect: false, dotfiles: 'ignore' }));
  // The service worker and manifest must always be revalidated so updates ship.
  router.use(
    express.static(dir, {
      index: false,
      redirect: false,
      dotfiles: 'ignore',
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        if (/(sw\.js|manifest\.webmanifest)$/.test(filePath)) noCache(res);
      },
    }),
  );
  router.use((req, res) => {
    const page = isPageOf(area, req.path);
    if (!page && isFileLike(req.path)) return notFoundText(res);
    noCache(res);
    return res.status(page ? 200 : 404).sendFile('index.html', { root: dir });
  });
  return router;
}

/**
 * Middleware que serve o SPA da área escolhida por `req.area`. Só GET e HEAD; o resto segue adiante.
 * Área sem host configurado ou sem build (dist-<área>/index.html) responde 404 neutro.
 */
export function areaSpa({ webDist, areas }) {
  const handlers = new Map();
  for (const area of AREAS) {
    if (!areas.hosts[area]) continue;
    const dir = areaDistDir(webDist, area);
    if (fs.existsSync(path.join(dir, 'index.html'))) handlers.set(area, areaHandler(area, dir));
    else logger.warn('areas: build da área ausente, o host responde 404 até rodar "npm run build:areas"', { area, dir });
  }
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const handler = handlers.get(req.area);
    return handler ? handler(req, res, next) : notFoundText(res);
  };
}
