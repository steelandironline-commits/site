import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { renderToPipeableStream, renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { BrandProvider, SessionProvider } from '@autopix/ui';
import { AREA_BRAND as CNPJ_BRAND } from '@autopix/areas/brand/cnpj';
import { AREA_BRAND as CPF_BRAND } from '@autopix/areas/brand/cpf';
import Login from '../src/pages/auth/Login.jsx';
import * as cnpjFlow from '../src/areas/cnpj/Onboarding.jsx';
import * as cpfFlow from '../src/areas/cpf/Onboarding.jsx';
import { COPY as CNPJ_COPY } from '../src/areas/cnpj/copy.js';
import { COPY as CPF_COPY } from '../src/areas/cpf/copy.js';

// ETAPA 5 · telas divididas por área. Cada tela mostra só o documento e o vocabulário da própria área.

const wrap = (brand, node) => (
  <MemoryRouter>
    <BrandProvider brand={brand}>
      <SessionProvider>{node}</SessionProvider>
    </BrandProvider>
  </MemoryRouter>
);

/** HTML final de uma árvore com Suspense/lazy (espera tudo carregar). */
function htmlOf(node) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const sink = new PassThrough();
    sink.on('data', (c) => chunks.push(c));
    sink.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    const { pipe } = renderToPipeableStream(node, { onAllReady: () => pipe(sink), onError: reject });
  });
}

/** Texto visível de um HTML: o símbolo do real (imagem) volta a ser "R$" e as marcações saem. */
const visibleText = (html) =>
  html
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/<!-- -->/g, '')
    .replace(/\s+/g, ' ');

describe('login: cada área pede só o seu documento', () => {
  it('CPF: o campo é CPF e a tela não fala de CNPJ, MEI nem colaborador', () => {
    const html = renderToStaticMarkup(wrap(CPF_BRAND, <Login copy={CPF_COPY.login} />));
    expect(html).toContain('>CPF<');
    expect(html).toContain('placeholder="000.000.000-00"');
    expect(html).not.toMatch(/CNPJ|\bMEI\b|olaborador|empresa|agentes/i);
    expect(html).not.toContain('CPF ou');
  });

  it('CNPJ: o campo é CNPJ, o colaborador entra com o CPF dele, e a tela não fala de pessoa física', () => {
    const html = renderToStaticMarkup(wrap(CNPJ_BRAND, <Login copy={CNPJ_COPY.login} />));
    expect(html).toContain('>CNPJ<');
    expect(html).toContain('placeholder="00.000.000/0000-00"');
    expect(html).toContain('Colaboradores entram com o próprio CPF.');
    expect(html).not.toMatch(/pessoa f[ií]sica|Tem CPF/i);
    expect(html).not.toContain('CPF ou');
  });

  it('a máscara de cada área: o CPF só formata CPF; o CNPJ formata o CPF do colaborador e o CNPJ da empresa', () => {
    expect(CPF_COPY.login.identifier.mask('12345678901')).toBe('123.456.789-01');
    expect(CPF_COPY.login.identifier.mask('123456789012345')).toBe('123.456.789-01');
    expect(CNPJ_COPY.login.identifier.mask('12345678901')).toBe('123.456.789-01');
    expect(CNPJ_COPY.login.identifier.mask('12345678000195')).toBe('12.345.678/0001-95');
  });
});

describe('ativação: o texto do link inválido é da área', () => {
  it('o CPF não manda o usuário a um checkout que não existe', () => {
    expect(CPF_COPY.activate.invalidHelp).not.toMatch(/checkout/i);
    expect(CNPJ_COPY.activate.invalidHelp).toContain('checkout');
  });
});

describe('cadastro: etapas e primeiro passo de cada área', () => {
  it('CNPJ: pergunta o tipo de operação, o cliente ideal e o ticket; pede CNPJ e nome da empresa', () => {
    const keys = cnpjFlow.stepsFor().map((s) => s.key);
    expect(keys[0]).toBe('start');
    expect(keys).toEqual(expect.arrayContaining(['operacao', 'sells', 'services', 'customer', 'where', 'ticket', 'review']));
    expect(keys).not.toEqual(expect.arrayContaining(['work', 'contact']));
    const html = renderToStaticMarkup(<cnpjFlow.StartFields account={{ accountType: 'COMPANY', name: '', email: '', companyName: '', document: '' }} setAccount={() => {}} errors={{}} />);
    expect(html).toContain('CNPJ (empresa ou MEI)');
    expect(html).toContain('Nome da empresa');
    expect(html).toContain('placeholder="00.000.000/0000-00"');
    expect(html).not.toMatch(/Pessoa F|>CPF</);
    expect(html.match(/type="email"/g)).toHaveLength(1);
  });

  it('CPF: vai direto à profissão, sem tipo de operação; pede só o CPF, sem nome de empresa', () => {
    const keys = cpfFlow.stepsFor().map((s) => s.key);
    expect(keys.slice(0, 2)).toEqual(['start', 'work']);
    expect(keys).not.toContain('operacao');
    expect(keys.indexOf('contact')).toBeGreaterThan(keys.indexOf('where'));
    expect(keys).not.toEqual(expect.arrayContaining(['sells', 'customer', 'ticket']));
    const html = renderToStaticMarkup(<cpfFlow.StartFields account={{ accountType: 'PERSON', name: '', email: '', companyName: '', document: '' }} setAccount={() => {}} errors={{}} />);
    expect(html).toContain('>CPF<');
    expect(html).toContain('placeholder="000.000.000-00"');
    expect(html).not.toMatch(/CNPJ|empresa|\bMEI\b/i);
    expect(html.match(/type="email"/g)).toHaveLength(1);
  });

  it('a validação de cada área só conhece o documento dela', () => {
    const base = { name: 'Maria', email: 'maria@x.com.br', companyName: 'Oficina', document: '' };
    const empty = { form: {}, profile: {} };
    // CPF válido: aceito no CPF, recusado como CNPJ (e o contrário).
    expect(cpfFlow.validate('start', { ...empty, account: { ...base, document: '52998224725' } })).toEqual({});
    expect(cnpjFlow.validate('start', { ...empty, account: { ...base, document: '52998224725' } }).document).toBe('CNPJ inválido');
    expect(cnpjFlow.validate('start', { ...empty, account: { ...base, document: '11222333000181' } })).toEqual({});
    expect(cpfFlow.validate('start', { ...empty, account: { ...base, document: '11222333000181' } }).document).toBe('CPF inválido');
    // O nome da empresa só é exigido no CNPJ.
    expect(cnpjFlow.validate('start', { ...empty, account: { ...base, companyName: '', document: '11222333000181' } }).companyName).toBeTruthy();
    expect(cpfFlow.validate('start', { ...empty, account: { ...base, companyName: '', document: '52998224725' } })).toEqual({});
  });

  it('o CPF termina o cadastro sem cobrança: a tela final manda o link de ativação e não fala de Pix, taxa nem checkout', async () => {
    const html = await htmlOf(wrap(CPF_BRAND, <cpfFlow.Ready account={{}} form={{}} onSave={async () => {}} />));
    expect(html).toContain('ENVIAR LINK DE ATIVAÇÃO');
    expect(html).toContain('Cadastro grátis');
    expect(html).not.toMatch(/Pix|PIX|taxa|checkout|comiss/i);
  });

  it('o CNPJ termina o cadastro na taxa única, pelo Pix', async () => {
    const html = await htmlOf(wrap(CNPJ_BRAND, <cnpjFlow.Ready account={{ companyName: 'Oficina Alfa' }} form={{}} onSave={async () => {}} />));
    const text = visibleText(html);
    expect(text).toContain('Falta só a taxa única de cadastro.');
    expect(text).toContain('PAGAR R$200,00 COM PIX');
    expect(text).toContain('Oficina Alfa');
  });
});
