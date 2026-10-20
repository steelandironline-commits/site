// SOMENTE SERVIDOR, build e testes. NUNCA importar no navegador: este arquivo cita
// as duas áreas, e o plugin de build `areaBoundary` quebra o build se ele entrar num bundle.
//
// Fonte dos caminhos: apps/web/src/App.jsx (build legado, que convive até o go-live)
// e a tabela de rotas do docs/divisao/INVENTARIO.md, seção 1. As linhas que o
// inventário deixou como DÚVIDA seguem as premissas do docs/divisao/ARQUITETURA.md
// (seção 1 e tabela 6.5). Rota nova no front precisa entrar aqui (há teste de deriva).
import { AREAS } from './areas.js';

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

/** Páginas de cada área, já com as comuns. */
export const PAGES = Object.freeze({
  CNPJ: Object.freeze([...COMMON_PAGES, ...EXCLUSIVE_PAGES.CNPJ]),
  CPF: Object.freeze([...COMMON_PAGES, ...EXCLUSIVE_PAGES.CPF]),
  ADMIN: Object.freeze([...EXCLUSIVE_PAGES.ADMIN]),
});

/**
 * Montagens de API de cada área: { path, areas } por `mountArea`.
 * preenchida na ETAPA 4
 */
export const API_MOUNTS = Object.freeze([]);

/** Todas as páginas declaradas, sem repetição. */
export const ALL_PAGES = Object.freeze([...new Set(AREAS.flatMap((area) => PAGES[area]))]);

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
