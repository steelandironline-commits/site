// Score de confiança da vaga: um indicador simples de sinais do ANÚNCIO. Não é avaliação oficial da empresa.
// Função pura. Começa em 50 e soma ou subtrai pontos, sempre com o motivo à vista.
import { foldText } from './text.js';

export const SCORE_BASE = 50;

/** Pontos de cada sinal. Pedir pagamento pesa o bastante para levar qualquer anúncio ao nível ATENÇÃO. */
export const SCORE_POINTS = Object.freeze({
  SALARY: 10,
  CONTACT: 15,
  DESCRIPTION: 10,
  COMPANY: 10,
  PAYMENT_REQUEST: -60,
  EASY_MONEY: -30,
  NO_COMPANY: -20,
  NO_CONTACT: -10,
});

/** Descrição "detalhada": mais do que isto, em caracteres. */
export const LONG_DESCRIPTION = 300;

export const SCORE_LEVELS = Object.freeze({
  BOM: { label: 'BOM SINAL', min: 70 },
  VERIFIQUE: { label: 'VERIFIQUE ANTES', min: 40 },
  ATENCAO: { label: 'ATENÇÃO', min: 0 },
});

/** Nível do score: 70 ou mais, BOM; de 40 a 69, VERIFIQUE; abaixo de 40, ATENCAO. */
export function scoreLevel(value) {
  if (value >= SCORE_LEVELS.BOM.min) return 'BOM';
  if (value >= SCORE_LEVELS.VERIFIQUE.min) return 'VERIFIQUE';
  return 'ATENCAO';
}

export const scoreLevelLabel = (level) => SCORE_LEVELS[level]?.label ?? SCORE_LEVELS.VERIFIQUE.label;

// Pedido de pagamento: taxa, depósito, cadastro pago, kit, curso, pix antecipado. Só o que é dito ao candidato
// ("pague", "deposite", "é necessário pagar"): "a empresa paga o curso" ou "pagamento semanal" não contam.
const PAYMENT = [
  /\btaxas?\b(?:\s+(?:de|da|do|para|pela|pelo))?\s+(?:inscricao|cadastro|adesao|admissao|treinamento|material|uniforme|selecao|participacao|ativacao|acesso|documentacao|contratacao|emissao|processamento|administrativa|unica)/,
  /\b(?:pague|deposite|transfira)\b[^.\n]{0,60}?\b(?:taxa|inscricao|cadastro|adesao|kit|uniforme|treinamento|curso|material|documentacao|r\$)/,
  /\b(?:deve|devera|precisa|precisara|tera que|tem que|e necessario|e obrigatorio|necessario|obrigatorio)\b[^.\n]{0,20}?\b(?:pagar|depositar|transferir|investir)\b/,
  /\bcadastro\s+(?:pago|com\s+taxa|mediante)/,
  /\binscricao\s+(?:paga|com\s+taxa|mediante)/,
  /\bmediante\s+(?:o\s+)?(?:pagamento|deposito)/,
  /\binvestimento\s+(?:inicial|minimo)/,
  /\bcompre\b[^.\n]{0,30}?\b(?:kit|uniforme|material|curso|cadastro)/,
  /\bpix\s+(?:antecipad\w+|para\s+(?:garantir|reservar|liberar|confirmar))/,
  /\bcustos?\s+(?:de\s+)?(?:inscricao|cadastro)/,
];

// Promessa de ganho fácil.
const EASY_MONEY = [
  /\brenda\s+extra\b/,
  /\bganhe\b[^.\n]{0,30}?\d[\d.,]*\s*(?:reais\s*)?(?:por|ao|\/)\s*(?:dia|semana|hora|mes)\b/,
  /\bganhe\s+(?:muito\s+)?(?:dinheiro|ate\s+r\$|r\$)/,
  /\btrabalhe\s+de\s+casa\b[^.\n]{0,30}?\b(?:ganhe|lucre|fature)/,
  /\bsem\s+experiencia\b[^.\n]{0,60}?\bganh(?:e|os)\b/,
  /\bganhos?\s+(?:ilimitados?|garantidos?|altissimos?|extraordinarios?)\b/,
  /\bdinheiro\s+facil\b/,
  /\bliberdade\s+financeira\b/,
  /\blucre\s+(?:de\s+)?(?:r\$|ate|\d)/,
  /\bfique\s+rico\b/,
];

// "Não cobramos taxa", "sem cobrança de taxa", "sem taxa de inscrição": negar o pedido não é pedir.
const NEGATED_PAYMENT = [
  /\b(?:nao|nunca|jamais)\s+(?:\w+\s+){0,3}?(?:cobra\w*|pedi\w*|solicita\w*|exig\w*|requer\w*)\b[^.\n]{0,40}?\b(?:taxas?|pagamentos?|depositos?|custos?|cobranca)\b/g,
  /\b(?:sem|isento\s+de)\s+(?:nenhum\w*\s+|qualquer\s+)?(?:taxas?|custos?|cobranca|pagamentos?|investimento)\b/g,
  /\bnao\s+(?:ha|tem|existe|existem)\s+(?:nenhum\w*\s+|qualquer\s+)?(?:taxas?|custos?|cobranca|pagamentos?)\b/g,
];

/** Os sinais de golpe presentes no texto, sem repetir negações. */
export function scamSignals(text) {
  const folded = NEGATED_PAYMENT.reduce((acc, re) => acc.replace(re, ' '), foldText(text));
  return {
    paymentRequest: PAYMENT.some((re) => re.test(folded)),
    easyMoney: EASY_MONEY.some((re) => re.test(folded)),
  };
}

/**
 * @param {{
 *   title?: string, company?: string|null, description?: string|null,
 *   salaryMin?: number|null, salaryMax?: number|null,
 *   contactWhatsapp?: string|null, contactEmail?: string|null, contactEmailOwnDomain?: boolean,
 * }} job
 * @returns {{ value: number, level: 'BOM'|'VERIFIQUE'|'ATENCAO', label: string, reasons: { code: string, delta: number, text: string }[] }}
 */
export function scoreJob(job) {
  const reasons = [];
  const add = (code, text) => reasons.push({ code, delta: SCORE_POINTS[code], text });

  const description = String(job?.description ?? '');
  const hasSalary = Number(job?.salaryMin) > 0 || Number(job?.salaryMax) > 0;
  const hasCompany = String(job?.company ?? '').trim().length >= 2;
  const identifiable = Boolean(job?.contactWhatsapp) || (Boolean(job?.contactEmail) && Boolean(job?.contactEmailOwnDomain));
  const anyContact = identifiable || Boolean(job?.contactEmail);

  if (hasSalary) add('SALARY', 'Salário informado');
  if (identifiable) add('CONTACT', 'Contato identificável (WhatsApp ou e-mail de domínio próprio)');
  if (description.trim().length > LONG_DESCRIPTION) add('DESCRIPTION', 'Descrição detalhada');
  if (hasCompany) add('COMPANY', 'Empresa identificada pelo nome');
  else add('NO_COMPANY', 'Sem nome de empresa');
  if (!anyContact) add('NO_CONTACT', 'Sem contato na vaga');

  const { paymentRequest, easyMoney } = scamSignals(`${job?.title ?? ''}\n${description}`);
  if (paymentRequest) add('PAYMENT_REQUEST', 'O texto pede pagamento, taxa, depósito ou cadastro pago');
  if (easyMoney) add('EASY_MONEY', 'Promete ganho fácil ("renda extra", "ganhe por dia")');

  const value = Math.max(0, Math.min(100, SCORE_BASE + reasons.reduce((sum, r) => sum + r.delta, 0)));
  const level = scoreLevel(value);
  return { value, level, label: scoreLevelLabel(level), reasons };
}
