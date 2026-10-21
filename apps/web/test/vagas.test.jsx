import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToPipeableStream } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { BrandProvider, SessionProvider } from '@autopix/ui';
import { JOB_AREAS } from '@autopix/shared';
import { AREA_BRAND as CPF_BRAND } from '@autopix/areas/brand/cpf';
import Vagas, { JobCard } from '../src/areas/cpf/Vagas.jsx';
import { ProfileForm, toForm, toPayload } from '../src/areas/cpf/Profile.jsx';
import { VAGAS } from '../src/areas/cpf/copy.js';
import { NAV } from '../src/areas/cpf/nav.js';

// Vagas (área CPF) renderizada de verdade (SSR), com a resposta de GET /api/jobs trocada por dados de teste:
// o cartão (cargo, empresa, local, salário, publicada há N dias, prazo, contato, score com motivos, descrição, fonte),
// os avisos (sem área, dados de demonstração, fonte não configurada) e o que a área CPF não pode mostrar.

const api = vi.hoisted(() => ({ data: {} }));
vi.mock('@autopix/ui', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    useApi: (path) => ({ data: api.data[String(path).split('?')[0]] ?? null, error: null, loading: false, reload: () => {}, setData: () => {} }),
    useVisibleInterval: () => {},
    get: async () => ({ items: [] }),
  };
});

beforeEach(() => {
  api.data = {};
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
    .replace(/<!-- -->/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const page = (node) => (
  <MemoryRouter initialEntries={['/app/vagas']}>
    <BrandProvider brand={CPF_BRAND}>
      <SessionProvider>{node}</SessionProvider>
    </BrandProvider>
  </MemoryRouter>
);

const job = (over = {}) => ({
  id: 'job1',
  source: 'ADZUNA',
  sourceName: 'Adzuna',
  title: 'Soldador MIG / MAG Pleno para estruturas metálicas',
  company: 'Metalúrgica Alfa',
  city: 'Joinville',
  state: 'SC',
  area: { slug: 'metalurgia', name: 'Metalurgia e solda' },
  salary: { min: 3200, max: 3800, period: 'MES', label: 'Salário: R$ 3.200 a R$ 3.800 por mês' },
  salaryLabel: 'Salário: R$ 3.200 a R$ 3.800 por mês',
  postedAt: '2026-10-19T10:00:00.000Z',
  expiresAt: '2026-10-31T10:00:00.000Z',
  postedDays: 2,
  deadlineDays: 10,
  postedLabel: 'publicada há 2 dias',
  deadlineLabel: 'prazo: 10 dias',
  contact: {
    whatsapp: { number: '5547999998888', display: '(47) 99999-8888', url: 'https://wa.me/5547999998888?text=Ol%C3%A1' },
    email: { address: 'rh@alfa.com.br', url: 'mailto:rh@alfa.com.br?subject=Vaga%3A%20Soldador' },
    order: ['WHATSAPP', 'EMAIL'],
    preferred: null,
  },
  score: {
    value: 95,
    level: 'BOM',
    label: 'BOM SINAL',
    reasons: [
      { code: 'SALARY', delta: 10, text: 'Salário informado' },
      { code: 'CONTACT', delta: 15, text: 'Contato identificável (WhatsApp ou e-mail de domínio próprio)' },
      { code: 'COMPANY', delta: 10, text: 'Empresa identificada pelo nome' },
    ],
  },
  excerpt: 'Atuar na soldagem de estruturas metálicas em turno diurno.',
  descriptionTruncated: false,
  sourceUrl: 'https://www.adzuna.com.br/land/ad/1',
  ...over,
});

const response = (items, { profile, source, nextCursor = null } = {}) => ({
  items,
  nextCursor,
  profile: { workArea: 'metalurgia', workAreaName: 'Metalurgia e solda', jobTitle: 'Soldador', contactPreference: null, needsArea: false, ...profile },
  source: { configured: true, demo: false, lastSuccessAt: new Date().toISOString(), ...source },
});

describe('Vagas · cartão', () => {
  it('mostra o cargo completo, a empresa, o local, o salário, a data, o prazo, o contato, o score com os motivos e a fonte', async () => {
    api.data = { '/api/jobs': response([job()]) };
    const html = await htmlOf(page(<Vagas />));
    const text = visibleText(html);
    expect(text).toContain('Soldador MIG / MAG Pleno para estruturas metálicas'); // cargo inteiro, sem corte
    expect(text).toContain('Metalúrgica Alfa');
    expect(text).toContain('Joinville / SC');
    expect(text).toContain('Metalurgia e solda');
    expect(text).toContain('Salário: R$3.200 a R$3.800 por mês'); // o símbolo do real é uma imagem, que leva o espaço junto
    expect(text).toContain('publicada há 2 dias');
    expect(text).toContain('prazo: 10 dias');
    expect(text).toContain('BOM SINAL');
    expect(text).toContain('Salário informado');
    expect(text).toContain('Contato identificável');
    expect(text).toContain('+10');
    expect(text).toContain('+15');
    expect(text).toContain('Não é avaliação oficial da empresa');
    expect(text).toContain('Atuar na soldagem de estruturas metálicas em turno diurno.');
    expect(text).toContain('Fonte: Adzuna');
    expect(html).toContain('href="https://www.adzuna.com.br/land/ad/1"');
    expect(text).toContain('ver na fonte');
    expect(html).toMatch(/rel="noopener noreferrer nofollow"/);
  });

  it('os botões de contato levam ao wa.me e ao mailto:', async () => {
    api.data = { '/api/jobs': response([job()]) };
    const html = await htmlOf(page(<Vagas />));
    expect(html).toContain('href="https://wa.me/5547999998888?text=Ol%C3%A1"');
    expect(html).toContain('href="mailto:rh@alfa.com.br?subject=Vaga%3A%20Soldador"');
    expect(html).toContain('aria-label="Chamar no WhatsApp: (47) 99999-8888"');
    expect(html).toContain('aria-label="Enviar e-mail para rh@alfa.com.br"');
    expect(html).toMatch(/rel="noopener noreferrer"/);
  });

  it('a ordem dos botões segue a preferência de contato', async () => {
    const order = (html) => [html.indexOf('wa.me/'), html.indexOf('mailto:')];
    const whatsFirst = order(await htmlOf(page(<JobCard item={job()} />)));
    expect(whatsFirst[0]).toBeGreaterThan(-1);
    expect(whatsFirst[0]).toBeLessThan(whatsFirst[1]);
    const item = job({ contact: { ...job().contact, order: ['EMAIL', 'WHATSAPP'], preferred: 'EMAIL' } });
    const emailFirst = order(await htmlOf(page(<JobCard item={item} />)));
    expect(emailFirst[1]).toBeLessThan(emailFirst[0]);
  });

  it('só mostra o botão do contato que a vaga tem; sem nenhum, avisa', async () => {
    const onlyMail = await htmlOf(page(<JobCard item={job({ contact: { whatsapp: null, email: job().contact.email, order: ['WHATSAPP', 'EMAIL'], preferred: null } })} />));
    expect(onlyMail).toContain('mailto:');
    expect(onlyMail).not.toContain('wa.me');
    const none = visibleText(await htmlOf(page(<JobCard item={job({ contact: { whatsapp: null, email: null, order: ['WHATSAPP', 'EMAIL'], preferred: null } })} />)));
    expect(none).toContain(VAGAS.noContact);
  });

  it('prazo: sem data da fonte diz "prazo não informado pela fonte", nunca um número', async () => {
    const text = visibleText(await htmlOf(page(<JobCard item={job({ expiresAt: null, deadlineDays: null, deadlineLabel: 'prazo não informado pela fonte' })} />)));
    expect(text).toContain('prazo não informado pela fonte');
    expect(text).not.toMatch(/prazo: \d/);
  });

  it('salário não informado', async () => {
    const text = visibleText(await htmlOf(page(<JobCard item={job({ salary: null, salaryLabel: 'Salário não informado' })} />)));
    expect(text).toContain('Salário não informado');
  });

  it('o score ATENÇÃO e os motivos negativos aparecem com o sinal de menos', async () => {
    const item = job({
      score: { value: 0, level: 'ATENCAO', label: 'ATENÇÃO', reasons: [{ code: 'PAYMENT_REQUEST', delta: -60, text: 'O texto pede pagamento, taxa, depósito ou cadastro pago' }, { code: 'NO_CONTACT', delta: -10, text: 'Sem contato na vaga' }] },
    });
    const text = visibleText(await htmlOf(page(<JobCard item={item} />)));
    expect(text).toContain('ATENÇÃO');
    expect(text).toContain('-60');
    expect(text).toContain('O texto pede pagamento, taxa, depósito ou cadastro pago');
    const verify = visibleText(await htmlOf(page(<JobCard item={job({ score: { value: 55, level: 'VERIFIQUE', label: 'VERIFIQUE ANTES', reasons: [] } })} />)));
    expect(verify).toContain('VERIFIQUE ANTES');
  });

  it('descrição longa: mostra o trecho e o "ver completo" que abre o restante', async () => {
    const html = await htmlOf(page(<JobCard item={job({ descriptionTruncated: true, excerpt: 'Começo da descrição…' })} />));
    const text = visibleText(html);
    expect(text).toContain('Começo da descrição…');
    expect(text).toContain('ver completo');
    expect(html).toContain('aria-expanded="false"');
    // descrição curta cabe inteira: não há o que expandir
    expect(visibleText(await htmlOf(page(<JobCard item={job()} />)))).not.toContain('ver completo');
  });

  it('link da fonte que não é http(s) e contato com forma estranha não viram link', async () => {
    const item = job({
      sourceUrl: 'javascript:alert(1)',
      contact: { whatsapp: { number: '1', display: null, url: 'javascript:alert(1)' }, email: { address: 'a@b.c', url: 'data:text/html,x' }, order: ['WHATSAPP', 'EMAIL'], preferred: null },
    });
    const html = await htmlOf(page(<JobCard item={item} />));
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('data:text');
    expect(visibleText(html)).not.toContain('ver na fonte');
    expect(visibleText(html)).toContain(VAGAS.noContact);
  });

  it('texto de fonte externa com marcação aparece como texto, nunca como HTML', async () => {
    const html = await htmlOf(page(<JobCard item={job({ title: '<img src=x onerror=alert(1)> Soldador', company: '<b>ACME</b>' })} />));
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; Soldador');
    expect(html).not.toContain('<b>ACME</b>');
  });
});

describe('Vagas · avisos e listas', () => {
  it('sem área no perfil: faixa de aviso com o link para Meu perfil', async () => {
    api.data = { '/api/jobs': response([job({ area: { slug: 'logistica', name: 'Logística e transporte' } })], { profile: { workArea: null, workAreaName: null, needsArea: true } }) };
    const html = await htmlOf(page(<Vagas />));
    expect(visibleText(html)).toContain('Escolha a sua área de atuação');
    expect(html).toContain('href="/app/perfil"');
    expect(visibleText(html)).toContain('Meu perfil');
  });

  it('com área no perfil, sem aviso', async () => {
    api.data = { '/api/jobs': response([job()]) };
    const html = await htmlOf(page(<Vagas />));
    expect(visibleText(html)).not.toContain('Escolha a sua área de atuação');
    expect(html).toContain('Metalurgia e solda</option>');
  });

  it('dados DEMO: mostra a faixa "Dados de demonstração"; dados reais, não', async () => {
    api.data = { '/api/jobs': response([job({ source: 'DEMO', sourceName: 'Demonstração', title: '(DEMO) Soldador', company: '(DEMO) Metalúrgica' })], { source: { demo: true } }) };
    const demo = visibleText(await htmlOf(page(<Vagas />)));
    expect(demo).toContain('Dados de demonstração');
    expect(demo).toContain('(DEMO) Soldador');
    expect(demo).toContain('(DEMO) Metalúrgica');
    api.data = { '/api/jobs': response([job()]) };
    expect(visibleText(await htmlOf(page(<Vagas />)))).not.toContain('Dados de demonstração');
  });

  it('fonte não configurada: "Fonte de vagas não configurada"', async () => {
    api.data = { '/api/jobs': response([], { source: { configured: false, lastSuccessAt: null } }) };
    const text = visibleText(await htmlOf(page(<Vagas />)));
    expect(text).toContain('Fonte de vagas não configurada');
  });

  it('fonte ligada, mas sem primeira sincronização: "Buscando as primeiras vagas"; depois: "Nenhuma vaga para você agora"', async () => {
    api.data = { '/api/jobs': response([], { source: { configured: true, lastSuccessAt: null } }) };
    expect(visibleText(await htmlOf(page(<Vagas />)))).toContain('Buscando as primeiras vagas');
    api.data = { '/api/jobs': response([]) };
    expect(visibleText(await htmlOf(page(<Vagas />)))).toContain('Nenhuma vaga para você agora');
  });

  it('carregando: mostra o esqueleto, sem erro', async () => {
    const html = await htmlOf(page(<Vagas />));
    expect(visibleText(html)).toContain('Carregando…');
    expect(visibleText(html)).not.toContain('Não foi possível');
  });

  it('mais páginas: botão "Carregar mais" só com nextCursor', async () => {
    api.data = { '/api/jobs': response([job()], { nextCursor: 'abc' }) };
    expect(visibleText(await htmlOf(page(<Vagas />)))).toContain('Carregar mais');
    api.data = { '/api/jobs': response([job()]) };
    expect(visibleText(await htmlOf(page(<Vagas />)))).not.toContain('Carregar mais');
  });

  it('lista várias vagas, uma por cartão', async () => {
    api.data = { '/api/jobs': response([job({ id: 'a', title: 'Vaga A' }), job({ id: 'b', title: 'Vaga B' }), job({ id: 'c', title: 'Vaga C' })]) };
    const html = await htmlOf(page(<Vagas />));
    expect(html.match(/<article/g)).toHaveLength(3);
    expect(visibleText(html)).toContain('3 vagas');
  });

  it('nada de empresa de cobrança nem de CNPJ nos textos da página (só o nome da empresa da vaga)', async () => {
    api.data = { '/api/jobs': response([job()], { profile: { workArea: null, needsArea: true } }) };
    const text = visibleText(await htmlOf(page(<Vagas />)));
    expect(text).not.toMatch(/CNPJ|Licita|Colaborador|checkout|Agentes|Oportunidades|Pagamentos/i);
    const copy = JSON.stringify(VAGAS);
    expect(copy).not.toMatch(/CNPJ|Licita|Colaborador|checkout|agentes|Oportunidades|Cargas|Equipes/i);
    // A única menção à empresa é a nota do score, sobre quem publicou a vaga ("não é avaliação oficial da empresa").
    expect(JSON.stringify({ ...VAGAS, scoreNote: '' })).not.toMatch(/empresa/i);
    expect(VAGAS.scoreNote).toContain('Não é avaliação oficial da empresa');
  });
});

describe('Vagas · menu e Meu perfil', () => {
  it('"Vagas" está no menu do CPF, na barra do celular', () => {
    expect(NAV.filter((i) => i.tab).map((i) => i.label)).toEqual(['Visão Geral', 'Vagas', 'Social', 'Meu perfil']);
    expect(NAV.find((i) => i.to === '/app/vagas')).toMatchObject({ label: 'Vagas', tab: true });
  });

  const profile = { name: 'Maria', phone: '', postalCode: '', city: 'Joinville', state: 'SC', serviceRadiusKm: 0, description: '', services: [], cpfMasked: '***.456.789-**', workArea: 'eletrica', jobTitle: 'Eletricista predial', contactPreference: 'EMAIL' };

  it('"Meu perfil" tem a área (as 16 da lista), o cargo e o contato preferido', async () => {
    const html = await htmlOf(page(<ProfileForm profile={profile} onSaved={() => {}} />));
    const text = visibleText(html);
    expect(text).toContain('Vagas para você');
    expect(text).toContain('Área de atuação');
    expect(text).toContain('Cargo que você procura');
    expect(text).toContain('Contato preferido nas vagas');
    for (const area of JOB_AREAS) expect(html, area.slug).toContain(`value="${area.slug}"`);
    expect(html).toMatch(/<option value="eletrica" selected="">/);
    expect(html).toContain('value="Eletricista predial"');
    expect(html).toContain('maxLength="80"');
    expect(html).toMatch(/<option value="EMAIL" selected="">/);
    expect(text).toContain('Área das vagas Elétrica'); // na lateral "Seu cadastro"
    expect(text).not.toMatch(/CNPJ|empresa/i);
  });

  it('o formulário envia os três campos (vazio vira null para apagar)', () => {
    expect(toPayload(toForm(profile))).toMatchObject({ workArea: 'eletrica', jobTitle: 'Eletricista predial', contactPreference: 'EMAIL' });
    expect(toPayload(toForm({ ...profile, workArea: null, jobTitle: null, contactPreference: null }))).toMatchObject({ workArea: null, jobTitle: null, contactPreference: null });
    expect(toPayload({ ...toForm(profile), jobTitle: '   ' }).jobTitle).toBeNull();
    expect(toForm({ name: 'M' })).toMatchObject({ workArea: '', jobTitle: '', contactPreference: '' });
  });
});
