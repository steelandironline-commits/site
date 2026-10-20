// hostArea: escolhe a área (Tem CNPJ, Tem CPF, admin) pelo nome do host.
//
// O HOST NÃO É FRONTEIRA DE SEGURANÇA. Ele só escolhe o app e, na ETAPA 4, o nome do
// cookie. Quem autoriza é a área gravada na sessão (ARQUITETURA, seção 6.3), que um
// cabeçalho `Host` forjado não altera. Este arquivo não mexe em cookie, sessão, CORS
// nem CSRF (quem usa a área para isso são app.js e security.js, via areaOrigins).
import { AREAS, ANY_AREA, hostnameOf, isAnyArea, urlFor } from '@autopix/areas';
import { notFoundApi } from './errors.js';

/** Infraestrutura sem sessão: responde em qualquer host e nunca tem área. */
function isInfrastructure(req) {
  if (req.path.startsWith('/api/webhooks/')) return true;
  // O Express atende HEAD com a rota GET; monitores de uptime costumam usar HEAD.
  return req.path === '/api/health' && (req.method === 'GET' || req.method === 'HEAD');
}

/**
 * Origem de cada área no modo de áreas (`https://<host>` em produção, `http://<host>` fora dela),
 * em um Map área -> origem. Só entram as áreas com host; no modo legado o Map é vazio. É a única
 * origem que o CORS e o CSRF aceitam para a área: sem curinga, sem a origem da outra área.
 */
export function areaOrigins(config) {
  const origins = new Map();
  if (!config.areas?.enabled) return origins;
  for (const area of AREAS) {
    if (config.areas.hosts[area]) origins.set(area, new URL(urlFor(area, '/', config)).origin);
  }
  return origins;
}

const isApiPath = (req) => /^\/api(\/|$)/i.test(req.path);

/** 404 neutro: o mesmo corpo de uma rota de API inexistente; texto simples fora de /api. */
function neutralNotFound(req, res, next) {
  if (isApiPath(req)) return notFoundApi(req, res, next);
  return res.status(404).type('text/plain').send('Not Found');
}

/**
 * Modo legado (`config.areas.enabled` falso): não faz nada além de deixar `req.area` nulo.
 * Modo de áreas: host de área -> `req.area`; host de redirecionamento -> 301 para o host
 * da área, com caminho e consulta; qualquer outro host -> 404 neutro.
 */
export function hostArea(config) {
  const areas = config.areas;
  if (!areas?.enabled) {
    return (req, res, next) => {
      req.area = null;
      next();
    };
  }

  const areaByHost = new Map();
  for (const area of AREAS) if (areas.hosts[area]) areaByHost.set(hostnameOf(areas.hosts[area]), area);
  const redirectByHost = new Map(areas.redirects.map((r) => [hostnameOf(r.host), r.area]));

  return (req, res, next) => {
    if (isInfrastructure(req)) {
      req.area = null;
      return next();
    }

    const host = hostnameOf(req.hostname);

    const area = areaByHost.get(host);
    if (area) {
      req.area = area;
      return next();
    }

    const target = redirectByHost.get(host);
    if (target) {
      // Só caminho e consulta: uma linha de requisição fora do formato (URL absoluta) não vira host.
      const rest = req.originalUrl.startsWith('/') ? req.originalUrl : '/';
      return res.redirect(301, urlFor(target, rest, config));
    }

    req.area = null;
    return neutralNotFound(req, res, next);
  };
}

/**
 * Guarda de área de uma montagem: responde 404 neutro quando `req.area` não está em `areas`.
 * Roda ANTES da autenticação (uma rota CNPJ chamada no host CPF responde 404, não 401).
 *
 * - `areas` é uma lista de áreas (CNPJ, CPF, ADMIN) ou ANY_AREA (infraestrutura sem sessão).
 * - `enabled` é o modo de áreas. No modo legado a guarda não bloqueia nada, como antes das áreas.
 * - Host sem área (req.area nulo) só passa em ANY_AREA: falha fechada.
 */
export function onlyArea(areas, enabled) {
  assertDeclared('onlyArea', areas);
  if (!enabled || isAnyArea(areas)) return (req, res, next) => next();
  const allowed = new Set(areas);
  return (req, res, next) => (allowed.has(req.area) ? next() : notFoundApi(req, res, next));
}

/** Recusa montagem sem áreas declaradas ou com área desconhecida (erro na partida do servidor). */
function assertDeclared(who, areas) {
  if (!Array.isArray(areas) || areas.length === 0) {
    throw new TypeError(`${who}: declare as áreas da montagem (${AREAS.join(', ')} ou ANY_AREA)`);
  }
  if (isAnyArea(areas)) return;
  for (const area of areas) {
    if (!AREAS.includes(area)) throw new TypeError(`${who}: área desconhecida: ${String(area)}`);
  }
}

/**
 * Liga o registro de montagens do app e diz em que modo ele roda. `mountArea` recusa montar
 * antes disto (falha fechada: um app sem modo declarado não pode montar rota sem guarda).
 */
export function initAreaMounts(app, config) {
  app.set('areaMode', Boolean(config.areas?.enabled));
  app.locals.areaMounts = [];
  return app;
}

/**
 * Monta `router` em `path` precedido de `onlyArea(areas)` e registra a montagem para os testes
 * (deriva contra o manifesto e isolamento de rota). É o único jeito de montar API em app.js.
 * Sem áreas declaradas, lança erro: toda rota nasce com a sua área.
 */
export function mountArea(app, path, areas, router) {
  const mode = app.get('areaMode');
  if (typeof mode !== 'boolean') throw new Error('mountArea: o app não declarou o modo de áreas (chame initAreaMounts antes)');
  if (typeof path !== 'string' || !path.startsWith('/')) throw new TypeError(`mountArea: caminho inválido: ${String(path)}`);
  if (typeof router !== 'function') throw new TypeError(`mountArea: ${path} sem router`);
  assertDeclared(`mountArea ${path}`, areas);
  app.locals.areaMounts.push(Object.freeze({ path, areas: Object.freeze([...areas]) }));
  app.use(path, onlyArea(areas, mode), router);
}

/** Montagens registradas por `mountArea` neste app, na ordem em que foram feitas. */
export function mountsOf(app) {
  return [...(app.locals.areaMounts ?? [])];
}

export { ANY_AREA };
