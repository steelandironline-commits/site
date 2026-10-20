import { Children, isValidElement } from 'react';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { renderToPipeableStream } from 'react-dom/server';
import { MemoryRouter, Navigate, Routes, createRoutesFromChildren } from 'react-router-dom';
import { BrandProvider, SessionProvider } from '@autopix/ui';
import { ALL_PAGES, EXCLUSIVE_PAGES, PAGES, isPageOf } from '@autopix/areas';
import { AREA_BRAND as CNPJ_BRAND } from '@autopix/areas/brand/cnpj';
import { AREA_BRAND as CPF_BRAND } from '@autopix/areas/brand/cpf';
import LegacyApp from '../src/App.jsx';
import CnpjApp from '../src/areas/cnpj/App.jsx';
import CpfApp from '../src/areas/cpf/App.jsx';
import * as cnpjNav from '../src/areas/cnpj/nav.js';
import * as cpfNav from '../src/areas/cpf/nav.js';
import * as legacyNav from '../src/legacyNav.js';

// Deriva de rotas: as rotas declaradas em cada App.jsx têm de ser exatamente as do manifesto
// (packages/areas/src/manifest.js). Rota nova no front sem entrada no manifesto, ou o contrário, falha aqui.

/** Acha o elemento <Routes> na árvore devolvida pelo App (que não usa hook, então basta chamá-lo). */
function findRoutes(node) {
  if (!isValidElement(node)) return null;
  if (node.type === Routes) return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = findRoutes(child);
    if (found) return found;
  }
  return null;
}

/** Rotas planas: { path completo, elemento }. O curinga "*" entra como "*" ou "<pai>/*". */
function flatRoutes(App) {
  const routes = createRoutesFromChildren(findRoutes(App()).props.children);
  const out = [];
  const walk = (list, parent) => {
    for (const route of list) {
      const own = route.index ? '' : (route.path ?? '');
      const full = own.startsWith('/') ? own : [parent, own].filter(Boolean).join('/');
      out.push({ path: full === '' ? '/' : full, wildcard: own === '*' || own.endsWith('/*'), element: route.element });
      if (route.children) walk(route.children, full === '/' ? '' : full);
    }
  };
  walk(routes, '');
  return out;
}

const patternsOf = (App) => [...new Set(flatRoutes(App).filter((r) => !r.wildcard).map((r) => r.path))].sort();

describe('deriva de rotas: o roteador de cada build bate com o manifesto', () => {
  it('CNPJ declara exatamente PAGES.CNPJ', () => {
    expect(patternsOf(CnpjApp)).toEqual([...PAGES.CNPJ].sort());
  });

  it('CPF declara exatamente PAGES.CPF (as comuns mais as do CPF)', () => {
    expect(patternsOf(CpfApp)).toEqual([...PAGES.CPF].sort());
  });

  it('o build legado declara a união das áreas (toda página, inclusive o admin), menos as páginas que só existem nas áreas', () => {
    // "Meu perfil" (/app/perfil) é do CPF: no legado a pessoa vê o perfil em /app/company, a tela da empresa.
    const areaOnly = EXCLUSIVE_PAGES.CPF;
    expect(areaOnly).toEqual(['/app/perfil']);
    expect(patternsOf(LegacyApp)).toEqual(ALL_PAGES.filter((p) => !areaOnly.includes(p)).sort());
    for (const page of areaOnly) expect(patternsOf(LegacyApp)).not.toContain(page);
  });

  it('o CPF não declara nenhuma rota do CNPJ nem do admin, e vice-versa', () => {
    const cpf = patternsOf(CpfApp);
    const cnpj = patternsOf(CnpjApp);
    for (const page of PAGES.CNPJ.filter((p) => !PAGES.CPF.includes(p))) expect(cpf, page).not.toContain(page);
    for (const page of PAGES.CPF.filter((p) => !PAGES.CNPJ.includes(p))) expect(cnpj, page).not.toContain(page);
    expect(cpf).not.toContain('/app/admin');
    expect(cnpj).not.toContain('/app/admin');
  });

  it('nas áreas só há um curinga, no topo, e ele não é redirecionamento', () => {
    for (const App of [CnpjApp, CpfApp]) {
      const wildcards = flatRoutes(App).filter((r) => r.wildcard);
      expect(wildcards.map((r) => r.path)).toEqual(['*']);
      expect(wildcards[0].element.type).not.toBe(Navigate);
    }
  });

  it('o único redirecionamento das áreas fica dentro da própria área', () => {
    for (const [App, area] of [[CnpjApp, 'CNPJ'], [CpfApp, 'CPF']]) {
      for (const route of flatRoutes(App).filter((r) => r.element?.type === Navigate)) {
        expect(isPageOf(area, route.element.props.to), `${area} ${route.path}`).toBe(true);
      }
    }
  });
});

describe('o menu de cada área só aponta para páginas da própria área', () => {
  const cases = [
    ['CNPJ', cnpjNav],
    ['CPF', cpfNav],
  ];

  for (const [area, nav] of cases) {
    it(`${area}: cada item e cada cabeçalho de volta são páginas de PAGES.${area}`, () => {
      expect(nav.NAV.length).toBeGreaterThan(0);
      for (const item of nav.NAV) expect(isPageOf(area, item.to), `${item.to}`).toBe(true);
      for (const [, backTo] of nav.BACK) expect(isPageOf(area, backTo), backTo).toBe(true);
      // Todo item com ícone e rótulo, e sem repetição.
      expect(new Set(nav.NAV.map((i) => i.to)).size).toBe(nav.NAV.length);
      for (const item of nav.NAV) {
        expect(typeof item.label).toBe('string');
        expect(item.icon).toBeTruthy();
      }
      // A barra do celular cabe na tela: de 3 a 4 atalhos.
      const tabs = nav.NAV.filter((i) => i.tab);
      expect(tabs.length).toBeGreaterThanOrEqual(3);
      expect(tabs.length).toBeLessThanOrEqual(4);
    });
  }

  it('o menu do CNPJ é o mesmo do build legado (menos o item do admin e o que depende do tipo da conta)', () => {
    // companyOnly e personLabel existem só no menu legado, que serve os dois tipos de conta; o CNPJ é só empresa.
    const shape = (list) => list.map(({ to, label, shortLabel, end, tab }) => ({ to, label, shortLabel, end, tab }));
    expect(shape(cnpjNav.NAV)).toEqual(shape(legacyNav.NAV));
    expect(cnpjNav.BACK.map((r) => [r[0].source, r[1], r[2]])).toEqual(legacyNav.BACK.map((r) => [r[0].source, r[1], r[2]]));
  });

  it('cada menu é só da própria área: "Meu perfil" só no CPF, e nenhum item de empresa nele', () => {
    expect(cpfNav.NAV.map((i) => i.to)).toContain('/app/perfil');
    expect(cnpjNav.NAV.map((i) => i.to)).not.toContain('/app/perfil');
    const cpfLabels = cpfNav.NAV.map((i) => i.label).join('|');
    expect(cpfLabels).not.toMatch(/Licita|Pagamentos|Cargas|Equipes|Agentes|Empresa|Plano|Oportunidades|Radar|Intermedia/);
    expect(cnpjNav.NAV.map((i) => i.label).join('|')).not.toContain('Meu perfil');
    for (const nav of [cnpjNav, cpfNav]) {
      for (const item of nav.NAV) {
        expect(item.companyOnly, item.to).toBeUndefined();
        expect(item.personLabel, item.to).toBeUndefined();
      }
    }
  });

  it('o cadastro em andamento vai para o checkout só no CNPJ; o CPF não tem checkout', () => {
    expect(cnpjNav.onboardingPath({ user: { status: 'PENDING_PAYMENT' } })).toBe('/checkout');
    expect(cnpjNav.onboardingPath({ user: { status: 'PENDING_ACTIVATION' } })).toBe('/onboarding');
    expect(cpfNav.onboardingPath({ user: { status: 'PENDING_PAYMENT' } })).toBe('/onboarding');
    expect(cpfNav.onboardingPath({ user: { status: 'PENDING_ACTIVATION' } })).toBe('/onboarding');
    expect(legacyNav.onboardingPath({ user: { status: 'PENDING_PAYMENT' } })).toBe('/checkout');
    expect(legacyNav.onboardingPath({ user: { status: 'PENDING_ACTIVATION' } })).toBe('/onboarding');
  });

  it('o item do admin só existe no build legado', () => {
    expect(legacyNav.ADMIN_NAV.to).toBe('/app/admin');
    for (const nav of [cnpjNav, cpfNav]) {
      expect(nav.ADMIN_NAV).toBeUndefined();
      expect(nav.NAV.some((i) => i.to === '/app/admin')).toBe(false);
    }
  });
});

describe('caminho fora da lista da área mostra a NotFound neutra, sem redirecionar', () => {
  function html(App, brand, url) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      const sink = new PassThrough();
      sink.on('data', (c) => chunks.push(c));
      sink.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      const { pipe } = renderToPipeableStream(
        <MemoryRouter initialEntries={[url]}>
          <BrandProvider brand={brand}>
            <SessionProvider>
              <App />
            </SessionProvider>
          </BrandProvider>
        </MemoryRouter>,
        { onAllReady: () => pipe(sink), onError: reject },
      );
    });
  }

  // Toda página que o manifesto marca como só do CNPJ (com um id no lugar dos parâmetros) cai na NotFound do CPF.
  const concrete = (page) => page.replace(/:\w+/g, '1');
  const outsideCpf = [
    ...PAGES.CNPJ.filter((p) => !PAGES.CPF.includes(p)).map(concrete),
    '/app/admin',
    '/app/nao-existe',
    '/qualquer/coisa',
  ];
  const outsideCnpj = [...PAGES.CPF.filter((p) => !PAGES.CNPJ.includes(p)).map(concrete), '/app/admin', '/app/nao-existe', '/qualquer/coisa'];

  it('a lista de caminhos de fora inclui as telas de empresa e de pessoa que o inventário separa', () => {
    expect(outsideCpf).toEqual(expect.arrayContaining(['/checkout', '/app/licitacoes', '/app/company', '/app/subscription', '/app/pay/transactions/1', '/app/payments/1', '/app/freight/matches/1', '/app/workforce/matches/1', '/app/intermediacao', '/app/opportunities/1', '/app/radar', '/app/agents']));
    expect(outsideCnpj).toContain('/app/perfil');
  });

  it('CPF', async () => {
    for (const url of outsideCpf) {
      const page = await html(CpfApp, CPF_BRAND, url);
      expect(page, url).toContain('Página não encontrada.');
      expect(page, url).toContain('aria-label="Tem CPF"');
    }
  }, 30_000);

  it('CNPJ', async () => {
    for (const url of outsideCnpj) {
      const page = await html(CnpjApp, CNPJ_BRAND, url);
      expect(page, url).toContain('Página não encontrada.');
      expect(page, url).toContain('aria-label="Tem CNPJ"');
    }
  }, 30_000);

  it('a NotFound não cita a outra área nem oferece caminho para ela', async () => {
    const cpf = await html(CpfApp, CPF_BRAND, '/app/licitacoes');
    expect(cpf).not.toMatch(/CNPJ|Licita/);
    const cnpj = await html(CnpjApp, CNPJ_BRAND, '/app/admin');
    expect(cnpj).not.toMatch(/CPF/);
  }, 30_000);

  it('a home do CPF é a Home neutra, não a landing', async () => {
    const page = await html(CpfApp, CPF_BRAND, '/');
    expect(page).toContain('Tem CPF');
    expect(page).toContain('Criar conta');
    expect(page).not.toMatch(/CNPJ|TemPix/);
  }, 30_000);
});
