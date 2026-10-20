import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { AREAS, EXCLUSIVE_FILES, distDirOf } from '@autopix/areas';
import { AREA_NAME as CNPJ_NAME } from '@autopix/areas/brand/cnpj';
import { AREA_NAME as CPF_NAME } from '@autopix/areas/brand/cpf';
import { areaBoundary } from './vite-plugins/areaBoundary.js';
import { areaHtml } from './vite-plugins/areaHtml.js';
import { moduleList } from './vite-plugins/moduleList.js';

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webRoot, '../..');

/**
 * Emits /sw.js with a build id and the list of hashed assets to precache
 * (everything except the lazily-loaded Three.js chunk and non-latin fonts).
 */
function autopixServiceWorker() {
  return {
    name: 'autopix-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter(
        (f) =>
          f.startsWith('assets/') &&
          !/three-/.test(f) &&
          (/\.(js|css)$/.test(f) || (/\.woff2$/.test(f) && /-latin-(400|500|600)-normal/.test(f))),
      );
      const precache = files.map((f) => `/${f}`).sort();
      const buildId = crypto.createHash('sha256').update(precache.join('|')).digest('hex').slice(0, 12);
      const template = fs.readFileSync(path.resolve(webRoot, 'pwa/sw-template.js'), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__BUILD_ID__', buildId).replace('__PRECACHE__', JSON.stringify(precache)),
      });
    },
  };
}

const manualChunks = (id) => {
  if (id.includes('node_modules/three') || id.includes('@react-three')) return 'three';
  if (id.includes('framer-motion')) return 'motion';
  if (id.includes('node_modules/react') || id.includes('react-router')) return 'react';
  return undefined;
};

const legacyConfig = {
  plugins: [react(), autopixServiceWorker()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks },
    },
  },
};

// Builds por área: `vite build --mode cnpj|cpf` grava em apps/web/dist-<área>, FORA de dist/ (o modo
// legado serve dist/ e não pode servi-las). O admin (--mode admin) entra na ETAPA 4.
const AREA_MODES = { cnpj: 'CNPJ', cpf: 'CPF' };
const AREA_BRAND_NAMES = { CNPJ: CNPJ_NAME, CPF: CPF_NAME };
// O CNPJ no 5173 e o CPF no 5174, como em PUBLIC_HOST_CNPJ=localhost:5173 e PUBLIC_HOST_CPF=cpf.localhost:5174.
const AREA_DEV_PORTS = { CNPJ: 5173, CPF: 5174 };

function areaConfig(area) {
  const own = area.toLowerCase();
  return {
    // A raiz continua sendo apps/web (src/, areas/): a entrada do build é areas/<área>/index.html.
    publicDir: path.join(webRoot, 'areas', own, 'public'),
    plugins: [
      react(),
      areaHtml(area, AREA_BRAND_NAMES[area]),
      areaBoundary(area, { repoRoot, webRoot, areas: AREAS, exclusiveFiles: EXCLUSIVE_FILES }),
      autopixServiceWorker(),
      moduleList(area, { repoRoot }),
    ],
    // "@area" é o código da área atual: o Vite só enxerga src/areas/<área do build>.
    resolve: { alias: { '@area': path.join(webRoot, 'src/areas', own) } },
    define: { 'import.meta.env.VITE_AREA': JSON.stringify(own) },
    server: {
      port: AREA_DEV_PORTS[area],
      strictPort: true,
      allowedHosts: ['localhost', 'cpf.localhost'],
      proxy: legacyConfig.server.proxy,
    },
    build: {
      ...legacyConfig.build,
      outDir: path.join(webRoot, distDirOf(area)),
      emptyOutDir: true,
      rollupOptions: {
        input: path.join(webRoot, 'areas', own, 'index.html'),
        output: { manualChunks },
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const area = AREA_MODES[mode];
  return area ? areaConfig(area) : legacyConfig;
});
