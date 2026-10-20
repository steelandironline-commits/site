import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { API_MOUNTS, AREAS, isAnyArea } from '@autopix/areas';
import { mountsOf } from '../src/middleware/area.js';
import { HOSTS, areaApp } from './areaHelpers.js';

// 4b · deriva: toda montagem de API do app.js está no manifesto (packages/areas), e o manifesto
// não tem montagem que o app não faz. Sem banco: o app sobe com um prisma de mentira.

const key = (m) => `${m.path} [${[...m.areas].sort().join(',')}]`;
const keysOf = (mounts) => [...new Set(mounts.map(key))].sort();
const appKeys = (env) => keysOf(mountsOf(areaApp(env).app));

describe('deriva · montagens do app.js contra o manifesto', () => {
  it('as montagens do app são as do manifesto, nem mais nem menos (modo de áreas)', () => {
    expect(appKeys(HOSTS)).toEqual(keysOf(API_MOUNTS));
  });

  it('o modo legado monta as mesmas rotas com as mesmas áreas declaradas', () => {
    expect(appKeys({})).toEqual(keysOf(API_MOUNTS));
  });

  it('com ADMIN_HOST, /api/admin sai do host CNPJ e nenhuma outra montagem muda', () => {
    const withAdminHost = appKeys({ ...HOSTS, ADMIN_HOST: 'admin.temcnpj.com.br' });
    const expected = keysOf(API_MOUNTS.map((m) => (m.path === '/api/admin' ? { path: m.path, areas: ['ADMIN'] } : m)));
    expect(withAdminHost).toEqual(expected);
  });

  it('o app não monta a mesma rota duas vezes, exceto os dois webhooks (corpo bruto)', () => {
    const mounts = mountsOf(areaApp(HOSTS).app).map((m) => m.path);
    const repeated = mounts.filter((p, i) => mounts.indexOf(p) !== i);
    expect(repeated).toEqual(['/api/webhooks']);
  });

  it('toda montagem do app declara áreas conhecidas', () => {
    for (const mount of mountsOf(areaApp(HOSTS).app)) {
      expect(mount.areas.length, mount.path).toBeGreaterThan(0);
      if (isAnyArea(mount.areas)) continue;
      for (const area of mount.areas) expect(AREAS, `${mount.path} ${area}`).toContain(area);
    }
  });

  it('nenhum router de API é montado fora do mountArea no app.js', () => {
    const source = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/app.js'), 'utf8');
    // `app.use('/api/...', xxxRoutes(ctx))` seria uma rota sem área declarada.
    const loose = [...source.matchAll(/app\.(use|get|post|put|patch|delete)\(\s*['"`]\/api[^'"`]*['"`]\s*,[^;]*Routes\(/g)].map((m) => m[0]);
    expect(loose).toEqual([]);
    // Os routers em si: cada função *Routes importada é montada por mountArea.
    const imported = [...source.matchAll(/\b(\w+Routes)\b/g)].map((m) => m[1]);
    const mounted = [...source.matchAll(/mountArea\(app,[^;]*?\b(\w+Routes)\(ctx\)\)/g)].map((m) => m[1]);
    expect(new Set(mounted)).toEqual(new Set([...imported].filter((n) => n !== 'Routes')));
  });
});
