import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToPipeableStream } from 'react-dom/server';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { BrandProvider, SessionProvider } from '@autopix/ui';
import { AREA_BRAND as CNPJ_BRAND } from '@autopix/areas/brand/cnpj';
import { AREA_BRAND as CPF_BRAND } from '@autopix/areas/brand/cpf';
import { ToastProvider } from '../src/lib/toast.jsx';
import Settings from '../src/pages/app/Settings.jsx';
import Activity from '../src/pages/app/Activity.jsx';
import Social from '../src/pages/app/Social.jsx';
import { TeamCard } from '../src/pages/app/TeamCard.jsx';
import { PayoutCard } from '../src/pages/app/PayoutCard.jsx';
import CpfOverview from '../src/areas/cpf/Overview.jsx';
import { ProfileForm } from '../src/areas/cpf/Profile.jsx';
import { SOURCE as CPF_SOURCE } from '../src/areas/cpf/OperationsPage.jsx';
import { SOURCE as CNPJ_SOURCE } from '../src/areas/cnpj/OperationsPage.jsx';
import { SOURCE as LEGACY_SOURCE } from '../src/legacy/OperationsPage.jsx';
import { COPY as CNPJ_COPY } from '../src/areas/cnpj/copy.js';
import { COPY as CPF_COPY } from '../src/areas/cpf/copy.js';

// ETAPA 5 · as telas das áreas renderizadas de verdade (SSR), com as respostas da API trocadas por dados de
// teste: o que cada área mostra, e o que a tela do CPF não pode mostrar.

const api = vi.hoisted(() => ({ data: {}, calls: [] }));
vi.mock('@autopix/ui', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    useApi: (path) => ({ data: api.data[String(path).split('?')[0]] ?? null, error: null, loading: false, reload: () => {}, setData: () => {} }),
    put: async (path, body) => {
      api.calls.push(['put', path, body]);
      return { profile: { ...body, services: [], cpfMasked: '***.456.789-**' } };
    },
  };
});

beforeEach(() => {
  api.data = {};
  api.calls = [];
});

function htmlOf(node) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const sink = new PassThrough();
    sink.on('data', (c) => chunks.push(c));
    sink.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    const { pipe } = renderToPipeableStream(node, { onAllReady: () => pipe(sink), onError: reject });
  });
}

const visibleText = (html) =>
  html
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

/** Renderiza `node` como filho de uma rota com contexto de Outlet (o que o AppLayout entrega às páginas). */
function inApp(brand, node, context = {}) {
  const me = { user: { id: 'u1', name: 'Maria da Silva', email: 'maria@x.com.br', role: 'OWNER' }, company: { accountType: 'PERSON', name: 'Maria da Silva' }, subscription: { status: 'ACTIVE' } };
  const stream = { events: [], mode: 'live', loading: false, latest: null };
  return (
    <MemoryRouter initialEntries={['/app']}>
      <BrandProvider brand={brand}>
        <SessionProvider>
          <ToastProvider>
            <Routes>
              <Route path="/app" element={<Outlet context={{ me, stream, demoMode: false, onLogout: () => {}, ...context }} />}>
                <Route index element={node} />
              </Route>
            </Routes>
          </ToastProvider>
        </SessionProvider>
      </BrandProvider>
    </MemoryRouter>
  );
}

describe('Configurações', () => {
  it('CPF: senha, WhatsApp, avisos e sessões; sem equipe, sem chave Pix de repasse e sem categorias de empresa', async () => {
    api.data = { '/api/me/sessions': { items: [] }, '/api/notifications/preferences': { preferences: { IN_APP: { SYSTEM: true }, WHATSAPP: { SYSTEM: false }, EMAIL: { SYSTEM: true }, PUSH: { SYSTEM: true } } } };
    const text = visibleText(await htmlOf(inApp(CPF_BRAND, <Settings copy={CPF_COPY.settings} />)));
    expect(text).toContain('Alterar senha');
    expect(text).toContain('Sessões ativas');
    expect(text).toContain('Notificações');
    expect(text).toContain('Sistema');
    expect(text).toContain('Modo produção: somente atividades reais da sua conta.');
    expect(text).not.toMatch(/Equipe|Chave Pix|colaborador|CNPJ|Cargas|Pagamentos|Agentes|Equipes|Oportunidades|empresa/i);
  });

  it('CNPJ: com a equipe (login por CPF do colaborador), a chave Pix de recebimento e todas as categorias de aviso', async () => {
    api.data = {
      '/api/me/sessions': { items: [] },
      '/api/team': { members: [{ id: 'm1', name: 'Dono', role: 'OWNER', login: '11222333000181', status: 'ACTIVE' }] },
      '/api/company': { company: { payoutPixKeyType: null } },
      '/api/notifications/preferences': { preferences: Object.fromEntries(['IN_APP', 'WHATSAPP', 'EMAIL', 'PUSH'].map((c) => [c, {}])) },
    };
    const me = { user: { id: 'u1', name: 'Dono', email: 'd@x.com.br', role: 'OWNER' }, company: { accountType: 'COMPANY', name: 'Oficina' } };
    const node = <Settings copy={CNPJ_COPY.settings} team={(who) => <TeamCard me={who} />} payout={<PayoutCard />} />;
    const text = visibleText(await htmlOf(inApp(CNPJ_BRAND, node, { me })));
    expect(text).toContain('Equipe');
    expect(text).toContain('colaboradores');
    expect(text).toContain('Chave Pix de recebimento');
    for (const label of ['Oportunidades', 'Cargas', 'Equipes', 'Pagamentos', 'Sistema', 'Agentes']) expect(text, label).toContain(label);
    expect(text).not.toMatch(/pessoa f[ií]sica|Tem CPF|Meu perfil/i);
  });
});

describe('Atividade e Social', () => {
  it('CPF: a atividade fala da conta, com dois filtros; o Social vazio não leva ao Pagamentos', async () => {
    api.data = { '/api/social/posts': { items: [], nextCursor: null }, '/api/social/eligible': { items: [] } };
    const activity = visibleText(await htmlOf(inApp(CPF_BRAND, <Activity copy={CPF_COPY.activity} />)));
    expect(activity).toContain('Tudo o que aconteceu na sua conta');
    expect(activity).toContain('Sistema');
    expect(activity).not.toMatch(/agentes|Search|Opportunities/i);
    const html = await htmlOf(inApp(CPF_BRAND, <Social copy={CPF_COPY.social} />));
    const text = visibleText(html);
    expect(text).toContain('Depois que um serviço seu for concluído e confirmado pelo cliente');
    expect(html).not.toContain('/app/pay');
    expect(text).not.toMatch(/Ver meus contratos|TemPix Pay/);
  });

  it('CNPJ: o Social vazio leva aos contratos do Pagamentos', async () => {
    api.data = { '/api/social/posts': { items: [], nextCursor: null }, '/api/social/eligible': { items: [] } };
    const html = await htmlOf(inApp(CNPJ_BRAND, <Social copy={CNPJ_COPY.social} />));
    expect(html).toContain('href="/app/pay"');
    expect(visibleText(html)).toContain('Ver meus contratos');
  });
});

describe('painel e "Meu perfil" do CPF', () => {
  it('o painel mostra os atalhos da pessoa e nenhum indicador de empresa', async () => {
    const html = await htmlOf(inApp(CPF_BRAND, <CpfOverview />));
    const text = visibleText(html);
    expect(text).toContain('Maria');
    for (const to of ['/app/perfil', '/app/operacao', '/app/social']) expect(html, to).toContain(`href="${to}"`);
    expect(text).not.toMatch(/Oportunidades|Buscar agora|Ver plano|Empresas analisadas|agentes|Potencial/i);
    expect(html).not.toContain('/app/opportunities');
    expect(html).not.toContain('/app/subscription');
  });

  const profile = { name: 'Maria da Silva', phone: '(47) 99999-0000', postalCode: '89201000', city: 'Joinville', state: 'SC', serviceRadiusKm: 80, description: 'Eletricista.', services: ['Eletricista'], cpfMasked: '***.456.789-**' };

  it('"Meu perfil" mostra o perfil, o CPF mascarado e a região, sem nada de empresa', async () => {
    const text = visibleText(await htmlOf(inApp(CPF_BRAND, <ProfileForm profile={profile} onSaved={() => {}} />)));
    expect(text).toContain('Meu perfil');
    expect(text).toContain('***.456.789-**');
    expect(text).toContain('Joinville / SC');
    expect(text).toContain('80 km');
    expect(text).toContain('Eletricista');
    expect(text).not.toMatch(/CNPJ|empresa|Ticket|Produtos|Cliente ideal|Instagram|Website/i);
  });
});

describe('perfil operacional: de onde cada build lê e para onde grava', () => {
  it('CPF: GET/PUT /api/profile, conta de pessoa; nunca /api/company nem a ação de empresa', async () => {
    expect(CPF_SOURCE.path).toBe('/api/profile');
    expect(CPF_SOURCE.accountType()).toBe('PERSON');
    expect(CPF_SOURCE.select({ profile: { a: 1 } })).toEqual({ a: 1 });
    const saved = await CPF_SOURCE.save({ types: ['profissional_autonomo'] });
    expect(api.calls).toEqual([['put', '/api/profile', { operationalProfile: { types: ['profissional_autonomo'] } }]]);
    expect(CPF_SOURCE.merge({ profile: { name: 'M', city: 'X' } }, { city: 'Y' })).toEqual({ profile: { name: 'M', city: 'Y' } });
    expect(saved.name).toBeUndefined();
    expect(String(CPF_SOURCE.save)).not.toMatch(/company|UPDATE_COMPANY_PROFILE/i);
  });

  it('CNPJ e legado: /api/company; o legado descobre o tipo pela conta, o CNPJ é sempre empresa', () => {
    for (const source of [CNPJ_SOURCE, LEGACY_SOURCE]) {
      expect(source.path).toBe('/api/company');
      expect(source.select({ company: { id: 'c' } })).toEqual({ id: 'c' });
      expect(source.merge({ company: { id: 'c', name: 'A' } }, { name: 'B' })).toEqual({ company: { id: 'c', name: 'B' } });
    }
    expect(CNPJ_SOURCE.accountType()).toBe('COMPANY');
    expect(LEGACY_SOURCE.accountType({ accountType: 'PERSON' })).toBe('PERSON');
    expect(LEGACY_SOURCE.accountType({ accountType: 'COMPANY' })).toBe('COMPANY');
    expect(LEGACY_SOURCE.accountType(undefined)).toBe('COMPANY');
  });
});
