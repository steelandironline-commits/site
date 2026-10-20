// moduleList: grava <outDir>/modules.json com todos os módulos de origem do grafo do build.
//
// "De origem" são os arquivos do repositório (apps/web/src, packages/ui/src, packages/shared/src,
// packages/areas/src/brand...). Pacotes de node_modules ficam de fora. O teste de isolamento
// compara esta lista entre as áreas. O servidor nunca entrega este arquivo.
import path from 'node:path';

const posix = (p) => p.split(path.sep).join('/');

export function moduleList(area, { repoRoot }) {
  return {
    name: 'module-list',
    apply: 'build',
    generateBundle(_, bundle) {
      const root = posix(repoRoot);
      const modules = new Set();
      for (const item of Object.values(bundle)) {
        if (item.type !== 'chunk') continue;
        for (const rawId of Object.keys(item.modules)) {
          if (rawId.startsWith('\0')) continue;
          const id = posix(rawId.split('?')[0]);
          if (id.includes('/node_modules/') || !id.startsWith(`${root}/`)) continue;
          modules.add(path.posix.relative(root, id));
        }
      }
      this.emitFile({
        type: 'asset',
        fileName: 'modules.json',
        source: `${JSON.stringify({ area: area.toLowerCase(), modules: [...modules].sort() }, null, 2)}\n`,
      });
    },
  };
}
