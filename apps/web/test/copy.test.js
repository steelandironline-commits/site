import { describe, expect, it } from 'vitest';
import { COPY as LEGACY_COPY, LANDING as LEGACY_LANDING } from '../src/legacy/copy.js';
import { COPY as CNPJ_COPY, LANDING as CNPJ_LANDING } from '../src/areas/cnpj/copy.js';
import { COPY as CPF_COPY } from '../src/areas/cpf/copy.js';

// ETAPA 5 · a cópia de cada build. As três (legado, CNPJ, CPF) têm o mesmo formato, porque as telas
// que as duas áreas dividem pedem a cópia por props; e a de cada área não leva texto da outra.

/** Chaves cujo valor é uma folha mesmo sendo um objeto numa área e nulo na outra (o botão do estado vazio do Social). */
const LEAVES = new Set(['social.emptyAction']);

/** Caminhos de todas as chaves de um objeto de cópia (folhas: texto, função, lista ou nulo). */
function shape(value, prefix = '') {
  if (value && typeof value === 'object' && !Array.isArray(value) && !LEAVES.has(prefix)) {
    return Object.entries(value).flatMap(([k, v]) => shape(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

/** Todo texto de uma cópia, em uma só string (funções entram pela chamada de exemplo). */
function textOf(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'function') {
    try {
      const out = value('5% a 2%');
      return typeof out === 'string' ? out : '';
    } catch {
      return '';
    }
  }
  if (Array.isArray(value)) return value.map(textOf).join('\n');
  if (value && typeof value === 'object') return Object.values(value).map(textOf).join('\n');
  return '';
}

describe('cópia por build', () => {
  it('as três cópias têm as mesmas chaves', () => {
    expect(shape(CNPJ_COPY).sort()).toEqual(shape(LEGACY_COPY).sort());
    expect(shape(CPF_COPY).sort()).toEqual(shape(LEGACY_COPY).sort());
  });

  it('a cópia da página inicial existe no legado e no CNPJ, com as mesmas chaves (o CPF tem a Home própria)', () => {
    expect(shape(CNPJ_LANDING).sort()).toEqual(shape(LEGACY_LANDING).sort());
  });

  it('o legado reproduz o que o build de produção sempre disse', () => {
    expect(LEGACY_COPY.login.identifier.label).toBe('CPF ou CNPJ');
    expect(LEGACY_COPY.login.identifier.hint).toBe('Empresas e MEI entram com o CNPJ. Pessoa física e colaboradores, com o CPF.');
    expect(LEGACY_COPY.login.identifier.placeholder).toBe('000.000.000-00 ou 00.000.000/0000-00');
    expect(LEGACY_COPY.layout.offline).toBe('Seus agentes continuam trabalhando no servidor. Reconecte para ver as novidades.');
    expect(LEGACY_COPY.activity.subtitle).toBe('Tudo o que seus agentes fizeram, em ordem cronológica.');
    expect(LEGACY_COPY.social.emptyAction).toEqual({ to: '/app/pay', label: 'Ver meus contratos' });
    expect(LEGACY_COPY.confirm.afterConfirm({ payment: { id: 'p1' } })).toBe('/app/payments/p1');
    expect(LEGACY_COPY.confirm.afterConfirm({})).toBe('/app');
    expect(LEGACY_LANDING.priceLead('X')).toBe(
      'Profissional entra grátis. Empresa paga só um cadastro, uma única vez. Depois, o TemPix só ganha quando você ganha: X dos valores intermediados com sucesso.',
    );
  });

  it('o legado mostra todos os filtros e todas as categorias de aviso de sempre', () => {
    expect(LEGACY_COPY.activity.filters.map((f) => f.key)).toEqual(['', 'SEARCH', 'RESEARCH', 'SIGNAL', 'OPPORTUNITY', 'AGENT', 'SYSTEM']);
    expect(LEGACY_COPY.settings.notificationCategories.map((c) => c.key)).toEqual(['OPPORTUNITIES', 'FREIGHT', 'WORKFORCE', 'PAYMENTS', 'SYSTEM', 'AGENTS']);
    expect(LEGACY_COPY.settings.notificationCategories.map((c) => c.label)).toEqual(['Oportunidades', 'Cargas', 'Equipes', 'Pagamentos', 'Sistema', 'Agentes']);
    expect(CNPJ_COPY.settings.notificationCategories).toEqual(LEGACY_COPY.settings.notificationCategories);
  });

  it('a cópia do CPF não tem texto, link nem rota de empresa, cobrança ou pagamento', () => {
    const text = textOf(CPF_COPY);
    for (const marker of ['Tem CNPJ', 'CNPJ', 'Licitações', 'Colaborador', '/app/licitacoes', '/api/team', '/api/company', '/api/pay', '/checkout']) {
      expect(text, marker).not.toContain(marker);
    }
    expect(text).not.toMatch(/checkout|agentes|empresa|\/app\/pay|\/app\/payments|TemPix Pay|Oportunidades|Cargas|Equipes/i);
    expect(CPF_COPY.social.emptyAction).toBeNull();
    expect(CPF_COPY.confirm.afterConfirm({ payment: { id: 'p1' } })).toBe('/app');
    expect(CPF_COPY.activity.eventLink({ opportunityId: 'o1' })).toBeNull();
    expect(CPF_COPY.settings.notificationCategories).toEqual([{ key: 'SYSTEM', label: 'Sistema' }]);
  });

  it('a cópia do CNPJ não tem texto de pessoa física nem "Meu perfil"', () => {
    const text = `${textOf(CNPJ_COPY)}\n${textOf(CNPJ_LANDING)}`;
    for (const marker of ['Tem CPF', 'pessoa física', 'Meu perfil', '/api/profile']) expect(text, marker).not.toContain(marker);
    expect(text).not.toMatch(/pessoa f[ií]sica|Profissional entra|profissionais/i);
  });
});
