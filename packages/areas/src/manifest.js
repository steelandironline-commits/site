// SOMENTE SERVIDOR, build e testes. NUNCA importar no navegador: este arquivo cita
// as duas áreas, e o plugin de build `areaBoundary` quebra o build se ele entrar num bundle.
//
// Fonte dos caminhos: apps/web/src/App.jsx (build legado, que convive até o go-live)
// e a tabela de rotas do docs/divisao/INVENTARIO.md, seção 1. As linhas que o
// inventário deixou como DÚVIDA seguem as premissas do docs/divisao/ARQUITETURA.md
// (seção 1 e tabela 6.5). Rota nova no front precisa entrar aqui (há teste de deriva).
import { ANY_AREA, AREAS } from './areas.js';

/**
 * Páginas servidas nas duas áreas públicas. Cada área tem o seu próprio conteúdo
 * e texto nelas (Q8, Q9, Q10); aqui entram só caminhos que existem nas duas.
 */
export const COMMON_PAGES = Object.freeze([
  '/',
  '/onboarding',
  '/login',
  '/activate/:token',
  '/forgot-password',
  '/reset-password/:token',
  '/app',
  '/app/social',
  '/app/operacao',
  '/app/activity',
  '/app/settings',
  '/app/confirm/:id',
]);

/** Páginas exclusivas de cada área. */
export const EXCLUSIVE_PAGES = Object.freeze({
  CNPJ: Object.freeze([
    '/checkout',
    '/app/radar',
    '/app/licitacoes',
    '/app/opportunities',
    '/app/opportunities/:id',
    '/app/agents',
    '/app/company',
    '/app/subscription',
    // Q3, Q4 e Q13: Pagamentos, Intermediação, Cargas e Equipes ficam só no CNPJ nesta versão.
    '/app/pay',
    '/app/pay/transactions/:id',
    '/app/payments',
    '/app/payments/:id',
    '/app/intermediacao',
    '/app/freight',
    '/app/freight/matches/:id',
    '/app/workforce',
    '/app/workforce/matches/:id',
  ]),
  // Sem tela exclusiva hoje. O CPF ganha a tela de perfil na ETAPA 5.
  CPF: Object.freeze([]),
  // Admin da plataforma (Q6). Sem ADMIN_HOST, quem serve é o host CNPJ; a regra de
  // quem serve o quê entra na ETAPA 4.
  ADMIN: Object.freeze(['/app/admin']),
});

/**
 * Arquivos de apps/web/src que só uma área pode importar. Caminhos relativos a apps/web/src;
 * os que terminam em "/" valem para a pasta inteira. Sai daqui a fronteira do build: o plugin
 * `areaBoundary` derruba o build de uma área que importe um arquivo da lista de outra.
 *
 * As pastas src/areas/<área>/ são sempre exclusivas da área e não precisam constar aqui.
 * O arquivo é do tipo "só uma área usa hoje": entrou aqui porque só as páginas daquela área
 * (e o que elas puxam sozinhas) o alcançam. Um teste (apps/web/test/bundle-isolation) compara a
 * lista com os módulos reais de cada build, e acusa arquivo exclusivo que ficou de fora.
 * Na ETAPA 5, quando a tela comum for dividida, o arquivo muda de lugar e sai daqui.
 */
export const EXCLUSIVE_FILES = Object.freeze({
  CNPJ: Object.freeze([
    // Home atual (landing) e vitrine: o CPF tem a sua em src/areas/cpf/Home.jsx.
    'pages/landing/',
    'lib/demoFeed.js',
    'components/brand/WhatsAppIcon.jsx',
    // Páginas listadas em EXCLUSIVE_PAGES.CNPJ e o que só elas usam.
    'pages/checkout/',
    'pages/app/RadarPage.jsx',
    'components/radar/',
    'pages/app/Tenders.jsx',
    'pages/app/tenders.module.css',
    'pages/app/Opportunities.jsx',
    'pages/app/OpportunityDetail.jsx',
    'pages/app/Agents.jsx',
    'pages/app/Company.jsx',
    'pages/app/Subscription.jsx',
    'pages/app/Pay.jsx',
    'pages/app/TransactionDetail.jsx',
    'pages/app/PaymentDetail.jsx',
    'pages/app/Intermediation.jsx',
    'pages/app/Freight.jsx',
    'pages/app/Workforce.jsx',
  ]),
  CPF: Object.freeze([]),
  ADMIN: Object.freeze(['pages/app/Admin.jsx']),
});

/** Páginas de cada área, já com as comuns. */
export const PAGES = Object.freeze({
  CNPJ: Object.freeze([...COMMON_PAGES, ...EXCLUSIVE_PAGES.CNPJ]),
  CPF: Object.freeze([...COMMON_PAGES, ...EXCLUSIVE_PAGES.CPF]),
  ADMIN: Object.freeze([...EXCLUSIVE_PAGES.ADMIN]),
});

/**
 * Montagens de API: { path, areas }, uma por `mountArea` de apps/api/src/app.js (ARQUITETURA 6.5).
 * `areas` lista os hosts em que a montagem existe; em qualquer outro a resposta é 404, antes da
 * autenticação. `ANY_AREA` é só para infraestrutura sem sessão.
 *
 * Rota nova na API entra aqui E no app.js: o teste de deriva (apps/api/test/api-mounts.test.js)
 * falha se as duas listas divergirem, e o de isolamento percorre esta lista.
 *
 * /api/admin: o host de admin sempre; o host CNPJ só quando ADMIN_HOST não está definido (Q6).
 * Com ADMIN_HOST definido, o app monta apenas ['ADMIN'].
 */
export const API_MOUNTS = Object.freeze(
  [
    // Infraestrutura (qualquer host).
    { path: '/api/webhooks', areas: ANY_AREA },
    { path: '/api/health', areas: ANY_AREA },
    // Sistema.
    { path: '/api/session', areas: ['CNPJ', 'CPF', 'ADMIN'] },
    { path: '/api/cep', areas: ['CNPJ', 'CPF'] },
    { path: '/api/config', areas: ['CNPJ', 'CPF'] },
    // Conta e acesso.
    { path: '/api/auth', areas: ['CNPJ', 'CPF', 'ADMIN'] },
    { path: '/api/me', areas: ['CNPJ', 'CPF', 'ADMIN'] },
    { path: '/api/onboarding', areas: ['CNPJ', 'CPF'] },
    // Recursos do painel.
    { path: '/api/company', areas: ['CNPJ'] },
    { path: '/api/opportunities', areas: ['CNPJ'] },
    { path: '/api/activity', areas: ['CNPJ', 'CPF'] },
    { path: '/api/agents', areas: ['CNPJ'] },
    { path: '/api/dashboard', areas: ['CNPJ', 'CPF'] },
    { path: '/api/payments', areas: ['CNPJ'] },
    { path: '/api/subscription', areas: ['CNPJ'] },
    { path: '/api/team', areas: ['CNPJ'] },
    // Ações e desafios: a ação de outra área responde 404 "Ação desconhecida" (ActionEngine).
    // ADMIN entra porque as ações de administração só existem para essa área.
    { path: '/api/actions', areas: ['CNPJ', 'CPF', 'ADMIN'] },
    { path: '/api/challenges', areas: ['CNPJ', 'CPF', 'ADMIN'] },
    { path: '/api/whatsapp', areas: ['CNPJ', 'CPF'] },
    { path: '/api/notifications', areas: ['CNPJ', 'CPF'] },
    // Q3, Q4 e Q13: Cargas, Licitações, Equipes, Pagamentos e Intermediação ficam só no CNPJ.
    { path: '/api/freight', areas: ['CNPJ'] },
    { path: '/api/tenders', areas: ['CNPJ'] },
    { path: '/api/workforce', areas: ['CNPJ'] },
    { path: '/api/events', areas: ['CNPJ', 'CPF'] },
    { path: '/api/pay', areas: ['CNPJ'] },
    { path: '/api/social', areas: ['CNPJ', 'CPF'] },
    { path: '/api/intermediation', areas: ['CNPJ'] },
    { path: '/api/admin', areas: ['CNPJ', 'ADMIN'] },
  ].map((mount) => Object.freeze({ path: mount.path, areas: Object.freeze([...mount.areas]) })),
);

/** Todas as páginas declaradas, sem repetição. */
export const ALL_PAGES = Object.freeze([...new Set(AREAS.flatMap((area) => PAGES[area]))]);

export function exclusiveFilesOf(area) {
  const files = Object.hasOwn(EXCLUSIVE_FILES, area) ? EXCLUSIVE_FILES[area] : undefined;
  if (!files) throw new TypeError(`área desconhecida: ${String(area)}`);
  return files;
}

export function pagesOf(area) {
  const pages = PAGES[area];
  if (!pages) throw new TypeError(`área desconhecida: ${String(area)}`);
  return pages;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const compiled = new Map();
function matcherFor(pattern) {
  let re = compiled.get(pattern);
  if (!re) {
    const body = pattern
      .split('/')
      .filter(Boolean)
      .map((segment) => (segment.startsWith(':') ? '[^/]+' : escapeRe(segment)))
      .join('/');
    // Como o roteador do cliente: sem diferença de maiúsculas e com barra final opcional.
    re = new RegExp(`^/${body}${body ? '/?' : ''}$`, 'i');
    compiled.set(pattern, re);
  }
  return re;
}

/** `pathname` é só o caminho, sem consulta nem âncora. */
export function isPageOf(area, pathname) {
  return pagesOf(area).some((pattern) => matcherFor(pattern).test(pathname));
}

/** Áreas que servem um caminho. Vazio quando nenhuma o declara. */
export function areasOfPage(pathname) {
  return AREAS.filter((area) => isPageOf(area, pathname));
}
