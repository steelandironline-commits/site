// SOMENTE SERVIDOR. Monta links absolutos por área.
import { hostFor, isArea } from './areas.js';

/**
 * URL absoluta de um caminho numa área: `https://<host>` em produção e
 * `http://<host>` fora dela. `config` é o objeto de `loadConfig`.
 *
 * - Modo legado (`config.areas.enabled` falso): usa `config.appUrl`, como
 *   os links de hoje.
 * - ADMIN sem `ADMIN_HOST` vive no host CNPJ (Q6).
 * - Área sem host no modo de áreas: lança erro, em vez de montar um link torto.
 */
export function urlFor(area, path, config) {
  if (!isArea(area)) throw new TypeError(`área desconhecida: ${String(area)}`);
  const suffix = normalizePath(path);

  if (!config?.areas?.enabled) {
    if (!config?.appUrl) throw new TypeError('urlFor: config sem appUrl');
    return `${config.appUrl.replace(/\/$/, '')}${suffix}`;
  }

  const host = hostFor(area, config.areas) ?? (area === 'ADMIN' ? hostFor('CNPJ', config.areas) : null);
  if (!host) throw new Error(`Sem host configurado para a área ${area}`);
  return `${config.isProduction ? 'https' : 'http'}://${host}${suffix}`;
}

function normalizePath(path) {
  const value = path === undefined || path === null || path === '' ? '/' : String(path);
  return value.startsWith('/') ? value : `/${value}`;
}
