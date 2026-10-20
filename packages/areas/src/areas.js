// SOMENTE SERVIDOR. Este arquivo cita as duas áreas e nunca vai para o navegador.
// O navegador importa apenas brand/platform.js e o brand/<área>.js da própria área.

/** As áreas de sessão. CNPJ e CPF são públicas; ADMIN é a conta da plataforma. */
export const AREAS = Object.freeze(['CNPJ', 'CPF', 'ADMIN']);

/**
 * Marcador de uma montagem de API que responde em qualquer host, inclusive sem área
 * (infraestrutura sem sessão: /api/health e /api/webhooks/*). Só infraestrutura usa isto.
 */
export const ANY_AREA = Object.freeze(['*']);

/** A lista de áreas de uma montagem é o marcador ANY_AREA (compara o conteúdo, não a identidade)? */
export const isAnyArea = (areas) => Array.isArray(areas) && areas.length === 1 && areas[0] === ANY_AREA[0];

/**
 * Variável de ambiente que traz o host de cada área. Nenhum domínio fica
 * fixo no código (Q14): quem manda é a configuração.
 */
export const AREA_HOST_VARS = Object.freeze({
  CNPJ: 'PUBLIC_HOST_CNPJ',
  CPF: 'PUBLIC_HOST_CPF',
  ADMIN: 'ADMIN_HOST',
});

/** Variável com a lista de hosts que redirecionam (301) para o host da área. */
export const REDIRECT_HOST_VARS = Object.freeze({
  CNPJ: 'PUBLIC_HOST_CNPJ_REDIRECT',
  CPF: 'PUBLIC_HOST_CPF_REDIRECT',
});

/**
 * Pasta de saída do build de cada área, dentro de apps/web. Ficam FORA de `dist/` de propósito:
 * se ficassem dentro dele, o modo legado (que serve `dist/`) as serviria. O build e o servidor
 * leem esta tabela; nenhum dos dois repete os nomes.
 */
export const AREA_DIST_DIRS = Object.freeze({
  CNPJ: 'dist-cnpj',
  CPF: 'dist-cpf',
  ADMIN: 'dist-admin',
});

/** Nome da pasta de build da área (ex.: `dist-cpf`). */
export function distDirOf(area) {
  const dir = Object.hasOwn(AREA_DIST_DIRS, area) ? AREA_DIST_DIRS[area] : undefined;
  if (!dir) throw new TypeError(`área desconhecida: ${String(area)}`);
  return dir;
}

export const isArea = (value) => AREAS.includes(value);

const ACCOUNT_TYPE_AREA = Object.freeze({ COMPANY: 'CNPJ', PERSON: 'CPF' });

/**
 * Área de um registro de negócio, a partir do `accountType` da empresa dona.
 * COMPANY → CNPJ, PERSON → CPF. Qualquer outro valor lança erro: devolver
 * `null` aqui viraria um filtro "sem área" em alguma consulta (falha aberta).
 */
export function areaOf(accountType) {
  const area = Object.hasOwn(ACCOUNT_TYPE_AREA, accountType) ? ACCOUNT_TYPE_AREA[accountType] : undefined;
  if (!area) throw new TypeError(`accountType desconhecido: ${String(accountType)}`);
  return area;
}

const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const HOST_RE = new RegExp(`^${LABEL}(?:\\.${LABEL})*(?::(\\d{1,5}))?$`);

/**
 * Valida um host de URL (`nome[:porta]`, sem esquema, caminho nem espaços).
 * Devolve o host em minúsculas ou `null` se for inválido.
 */
export function parseHost(value) {
  if (typeof value !== 'string') return null;
  const host = value.trim().toLowerCase();
  if (host.length === 0 || host.length > 259) return null;
  const match = HOST_RE.exec(host);
  if (!match) return null;
  if (match[1] !== undefined) {
    const port = Number(match[1]);
    if (port < 1 || port > 65535) return null;
  }
  return host;
}

/**
 * Nome do host para comparação: minúsculas, sem porta e sem ponto final.
 * Serve tanto para `req.hostname` quanto para o valor configurado.
 */
export function hostnameOf(host) {
  if (typeof host !== 'string') return '';
  return host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
}

/** Host configurado de uma área (`config.areas`), ou `null` se ela não tem host. */
export function hostFor(area, areasConfig) {
  return areasConfig?.hosts?.[area] ?? null;
}
