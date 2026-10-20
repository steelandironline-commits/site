// Marca dentro do catálogo de perfil operacional. O texto guarda o token {marca} e a tela troca pelo
// nome da marca da entrada (o BrandProvider). Assim o mesmo catálogo serve às duas áreas e ao legado
// sem que o nome de uma área fique fixo no pacote.

/** Token que o catálogo usa no lugar do nome da marca. */
export const BRAND_TOKEN = '{marca}';

/** Troca o token por `name` num texto; qualquer outro valor volta como veio. */
export function brandText(value, name) {
  return typeof value === 'string' ? value.replaceAll(BRAND_TOKEN, name) : value;
}

/**
 * Cópia profunda do catálogo com o nome da marca em todo texto. Só percorre arrays e objetos simples;
 * funções, números e demais valores passam por referência.
 */
export function withBrand(value, name) {
  if (typeof value === 'string') return brandText(value, name);
  if (Array.isArray(value)) return value.map((item) => withBrand(item, name));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out = {};
    for (const key of Object.keys(value)) out[key] = withBrand(value[key], name);
    return out;
  }
  return value;
}
