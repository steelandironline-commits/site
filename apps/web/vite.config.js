import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
      const template = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'pwa/sw-template.js'), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__BUILD_ID__', buildId).replace('__PRECACHE__', JSON.stringify(precache)),
      });
    },
  };
}

export default defineConfig({
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
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three') || id.includes('@react-three')) return 'three';
          if (id.includes('framer-motion')) return 'motion';
          if (id.includes('node_modules/react') || id.includes('react-router')) return 'react';
          return undefined;
        },
      },
    },
  },
});
