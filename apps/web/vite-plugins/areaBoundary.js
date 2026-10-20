// areaBoundary: o build de uma área não pode carregar código de outra.
//
// Falha o build (resolveId e load) quando um módulo do grafo é:
//   1. de src/areas/<outra área>/;
//   2. a marca da outra área (packages/areas/src/brand/<outra>.js);
//   3. código só de servidor do @autopix/areas (manifest.js, areas.js, index.js, urls.js): eles
//      citam as duas áreas e nunca vão para o navegador;
//   4. um arquivo que o manifesto (EXCLUSIVE_FILES) classifica como exclusivo de outra área;
//   5. o código do build legado (src/App.jsx, src/main.jsx, src/legacyNav.js e src/legacy/), que
//      convive até o go-live e tem o vocabulário das duas áreas junto.
//
// Os módulos são conferidos pelo caminho já resolvido (os links simbólicos do workspace viram o
// caminho real), então alias, import relativo e import dinâmico passam todos pela mesma regra.
import path from 'node:path';

const posix = (p) => p.split(path.sep).join('/');
const withSlash = (p) => (p.endsWith('/') ? p : `${p}/`);

/** Arquivos de apps/web/src do build legado. Nenhuma área os importa. */
const LEGACY_FILES = ['legacy/', 'legacyNav.js', 'App.jsx', 'main.jsx'];

/**
 * @param {string} area            área do build ('cnpj', 'cpf'...), em qualquer caixa
 * @param {object} options
 * @param {string} options.repoRoot   raiz do repositório
 * @param {string} options.webRoot    apps/web
 * @param {string[]} options.areas    todas as áreas ('CNPJ', 'CPF', 'ADMIN')
 * @param {Record<string,string[]>} options.exclusiveFiles  EXCLUSIVE_FILES do manifesto
 */
export function areaBoundary(area, { repoRoot, webRoot, areas, exclusiveFiles }) {
  const own = area.toLowerCase();
  const srcDir = withSlash(posix(path.join(webRoot, 'src')));
  const areasPkg = withSlash(posix(path.join(repoRoot, 'packages/areas/src')));
  const rules = [];

  for (const other of areas.map((a) => a.toLowerCase()).filter((a) => a !== own)) {
    const dir = withSlash(`${srcDir}areas/${other}`);
    rules.push({ reason: `pasta da área ${other.toUpperCase()}`, test: (id) => id.startsWith(dir) });

    const brand = `${areasPkg}brand/${other}.js`;
    rules.push({ reason: `marca da área ${other.toUpperCase()}`, test: (id) => id === brand });

    for (const entry of exclusiveFiles[other.toUpperCase()] ?? []) {
      const target = `${srcDir}${entry}`;
      const test = entry.endsWith('/') ? (id) => id.startsWith(target) : (id) => id === target;
      rules.push({ reason: `arquivo exclusivo da área ${other.toUpperCase()} (manifesto)`, test });
    }
  }

  for (const entry of LEGACY_FILES) {
    const target = `${srcDir}${entry}`;
    const test = entry.endsWith('/') ? (id) => id.startsWith(target) : (id) => id === target;
    rules.push({ reason: 'arquivo do build legado', test });
  }

  // Tudo do @autopix/areas, menos a marca da plataforma e a marca da própria área.
  const allowed = new Set([`${areasPkg}brand/platform.js`, `${areasPkg}brand/${own}.js`]);
  rules.push({
    reason: 'código só de servidor do @autopix/areas (cita as duas áreas)',
    test: (id) => id.startsWith(areasPkg) && !allowed.has(id) && !id.startsWith(`${areasPkg}brand/`),
  });

  const verdict = (rawId) => {
    if (typeof rawId !== 'string' || rawId.startsWith('\0')) return null;
    const id = posix(rawId.split('?')[0].split('#')[0]);
    const rule = rules.find((r) => r.test(id));
    return rule ? { id, reason: rule.reason } : null;
  };
  const rel = (id) => (id.startsWith('/') ? path.posix.relative(posix(repoRoot), id) : id);

  return {
    name: 'area-boundary',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || source.startsWith('\0')) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || resolved.external) return null;
      const hit = verdict(resolved.id);
      if (hit) {
        this.error(`Fronteira de área (${own}): "${rel(posix(importer.split('?')[0]))}" importa "${rel(hit.id)}", que é ${hit.reason}.`);
      }
      return null;
    },
    load(id) {
      const hit = verdict(id);
      if (hit) this.error(`Fronteira de área (${own}): o módulo "${rel(hit.id)}" é ${hit.reason} e não pode entrar neste build.`);
      return null;
    },
  };
}
