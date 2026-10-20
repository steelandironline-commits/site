// hostArea: escolhe a área (Tem CNPJ, Tem CPF, admin) pelo nome do host.
//
// O HOST NÃO É FRONTEIRA DE SEGURANÇA. Ele só escolhe o app e, na ETAPA 4, o nome do
// cookie. Quem autoriza é a área gravada na sessão (ARQUITETURA, seção 6.3), que um
// cabeçalho `Host` forjado não altera. Este arquivo não mexe em cookie, sessão, CORS
// nem CSRF (quem usa a área para isso são app.js e security.js, via areaOrigins).
import { AREAS, hostnameOf, urlFor } from '@autopix/areas';
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
