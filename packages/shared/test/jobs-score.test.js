import { describe, expect, it } from 'vitest';
import { LONG_DESCRIPTION, SCORE_BASE, SCORE_POINTS, scamSignals, scoreJob, scoreLevel, scoreLevelLabel } from '../src/index.js';

const longText = 'Atividades: operar a máquina, conferir a produção e registrar os lotes. '.repeat(6);
const complete = {
  title: 'Soldador MIG',
  company: 'Metalúrgica Alfa',
  description: longText,
  salaryMin: 2800,
  salaryMax: 3200,
  contactWhatsapp: '5547999998888',
  contactEmail: 'rh@alfa.com.br',
  contactEmailOwnDomain: true,
};
const codes = (score) => score.reasons.map((r) => r.code);

describe('vagas · níveis do score', () => {
  it('70 ou mais é BOM SINAL; de 40 a 69, VERIFIQUE ANTES; abaixo de 40, ATENÇÃO', () => {
    expect(scoreLevel(100)).toBe('BOM');
    expect(scoreLevel(70)).toBe('BOM');
    expect(scoreLevel(69)).toBe('VERIFIQUE');
    expect(scoreLevel(40)).toBe('VERIFIQUE');
    expect(scoreLevel(39)).toBe('ATENCAO');
    expect(scoreLevel(0)).toBe('ATENCAO');
    expect(scoreLevelLabel('BOM')).toBe('BOM SINAL');
    expect(scoreLevelLabel('VERIFIQUE')).toBe('VERIFIQUE ANTES');
    expect(scoreLevelLabel('ATENCAO')).toBe('ATENÇÃO');
  });
});

describe('vagas · score de confiança', () => {
  it('começa em 50 e o anúncio completo e limpo é BOM SINAL, com os motivos', () => {
    expect(SCORE_BASE).toBe(50);
    const score = scoreJob(complete);
    expect(score.value).toBe(95);
    expect(score.level).toBe('BOM');
    expect(score.label).toBe('BOM SINAL');
    expect(codes(score)).toEqual(['SALARY', 'CONTACT', 'DESCRIPTION', 'COMPANY']);
    expect(score.reasons.every((r) => r.delta > 0 && r.text.length > 5)).toBe(true);
    expect(score.value).toBe(SCORE_BASE + score.reasons.reduce((n, r) => n + r.delta, 0));
  });

  it('anúncio mediano (empresa e descrição, sem salário nem contato) é VERIFIQUE ANTES', () => {
    const score = scoreJob({ ...complete, salaryMin: null, salaryMax: null, contactWhatsapp: null, contactEmail: null, contactEmailOwnDomain: false });
    expect(score.value).toBe(60);
    expect(score.level).toBe('VERIFIQUE');
    expect(codes(score)).toEqual(['DESCRIPTION', 'COMPANY', 'NO_CONTACT']);
    expect(score.reasons.find((r) => r.code === 'NO_CONTACT').delta).toBeLessThan(0);
  });

  it('anúncio vazio: sem empresa e sem contato é ATENÇÃO', () => {
    const score = scoreJob({ title: 'Vaga', description: 'Venha trabalhar.' });
    expect(score.value).toBe(20);
    expect(score.level).toBe('ATENCAO');
    expect(codes(score)).toEqual(['NO_COMPANY', 'NO_CONTACT']);
  });

  it('+ salário informado (um dos dois limites basta)', () => {
    expect(codes(scoreJob({ ...complete, salaryMin: null, salaryMax: 3000 }))).toContain('SALARY');
    expect(codes(scoreJob({ ...complete, salaryMin: null, salaryMax: null }))).not.toContain('SALARY');
  });

  it('+ contato identificável: WhatsApp ou e-mail de domínio próprio; e-mail gratuito não conta como identificável nem como "sem contato"', () => {
    const base = { ...complete, contactWhatsapp: null, contactEmail: null, contactEmailOwnDomain: false };
    expect(codes(scoreJob({ ...base, contactWhatsapp: '5547999998888' }))).toContain('CONTACT');
    expect(codes(scoreJob({ ...base, contactEmail: 'rh@alfa.com.br', contactEmailOwnDomain: true }))).toContain('CONTACT');
    const free = codes(scoreJob({ ...base, contactEmail: 'joao@gmail.com', contactEmailOwnDomain: false }));
    expect(free).not.toContain('CONTACT');
    expect(free).not.toContain('NO_CONTACT');
  });

  it(`+ descrição com mais de ${LONG_DESCRIPTION} caracteres`, () => {
    expect(codes(scoreJob({ ...complete, description: 'x'.repeat(LONG_DESCRIPTION) }))).not.toContain('DESCRIPTION');
    expect(codes(scoreJob({ ...complete, description: 'x'.repeat(LONG_DESCRIPTION + 1) }))).toContain('DESCRIPTION');
  });

  it('+ empresa com nome / − sem nome de empresa', () => {
    expect(codes(scoreJob(complete))).toContain('COMPANY');
    for (const company of [null, undefined, '', '  ', 'x']) {
      const score = scoreJob({ ...complete, company });
      expect(codes(score), String(company)).toContain('NO_COMPANY');
      expect(codes(score)).not.toContain('COMPANY');
    }
  });

  it('− texto que pede pagamento, taxa, depósito ou cadastro pago leva a ATENÇÃO', () => {
    for (const text of [
      'Vaga imediata. Pague a taxa de inscrição de R$ 50 para participar.',
      'Para garantir a vaga, deposite R$ 80 na conta abaixo.',
      'Cadastro pago, mediante pagamento de R$ 30.',
      'É necessário pagar o kit de uniforme antes de começar.',
      'Taxa administrativa de R$ 20 no primeiro dia.',
      'Investimento inicial de R$ 200 para começar.',
      'Envie o pix antecipado para reservar sua vaga.',
    ]) {
      const score = scoreJob({ ...complete, description: `${longText} ${text}` });
      expect(codes(score), text).toContain('PAYMENT_REQUEST');
      expect(score.level, text).toBe('ATENCAO');
      expect(score.value, text).toBeLessThan(40);
    }
  });

  it('− promessa de ganho fácil', () => {
    for (const text of [
      'Renda extra todos os dias!',
      'Ganhe R$ 300 por dia sem sair de casa.',
      'Trabalhe de casa e ganhe até R$ 5.000.',
      'Sem experiência, ganhe muito dinheiro.',
      'Ganhos ilimitados.',
    ]) {
      const score = scoreJob({ ...complete, description: `${longText} ${text}` });
      expect(codes(score), text).toContain('EASY_MONEY');
      expect(score.value, text).toBe(95 - 30);
      expect(score.level).toBe('VERIFIQUE');
    }
  });

  it('pagamento e ganho fácil juntos são ATENÇÃO e o valor nunca sai de 0 a 100', () => {
    const score = scoreJob({ ...complete, description: `${longText} Renda extra! Pague a taxa de inscrição.` });
    expect(codes(score)).toEqual(expect.arrayContaining(['PAYMENT_REQUEST', 'EASY_MONEY']));
    expect(score.level).toBe('ATENCAO');
    const worst = scoreJob({ title: 'Renda extra, pague taxa de inscrição', description: 'Renda extra. Pague taxa de inscrição.' });
    expect(worst.value).toBe(0);
    expect(scoreJob(complete).value).toBeLessThanOrEqual(100);
  });

  it('o aviso vale para o título também', () => {
    expect(codes(scoreJob({ ...complete, title: 'RENDA EXTRA trabalhando em casa' }))).toContain('EASY_MONEY');
  });

  it('não acusa quem diz que NÃO cobra, nem o empregador que paga', () => {
    for (const text of [
      'Não cobramos taxa de inscrição.',
      'Sem taxa de inscrição ou qualquer cobrança.',
      'A empresa nunca solicita pagamento ou depósito do candidato.',
      'Pagamento semanal de R$ 800. A empresa paga o curso e o uniforme.',
      'Pagamos o salário até o quinto dia útil.',
    ]) {
      const signals = scamSignals(text);
      expect(signals.paymentRequest, text).toBe(false);
      expect(codes(scoreJob({ ...complete, description: `${longText} ${text}` })), text).not.toContain('PAYMENT_REQUEST');
    }
  });

  it('cada motivo traz código, pontos e texto em português, sem a palavra CNPJ', () => {
    const score = scoreJob({ ...complete, description: `${longText} Pague a taxa de inscrição. Renda extra.`, company: null, contactWhatsapp: null, contactEmail: null });
    for (const reason of score.reasons) {
      expect(Object.keys(reason).sort()).toEqual(['code', 'delta', 'text']);
      expect(reason.delta).toBe(SCORE_POINTS[reason.code]);
      expect(reason.text).not.toMatch(/cnpj/i);
    }
    expect(score.label).not.toMatch(/cnpj/i);
  });

  it('aceita entrada vazia', () => {
    const score = scoreJob(undefined);
    expect(score.value).toBe(20);
    expect(score.level).toBe('ATENCAO');
  });
});
