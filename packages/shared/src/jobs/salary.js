// Salário da vaga: leitura de valores em reais no texto ou no campo da fonte, e o texto para exibir.
// Funções puras. Nunca inventam valor: sem número claro, o resultado é `null` ("Salário não informado").
import { foldText } from './text.js';

/** Períodos aceitos: mês, hora e dia. O texto do período é o de "por mês", "por hora" e "por dia". */
export const SALARY_PERIODS = Object.freeze({ MES: 'mês', HORA: 'hora', DIA: 'dia' });

/** Faixa plausível por período; fora dela o número é de outra coisa (um ano, uma carga horária, um CEP). */
const PLAUSIBLE = Object.freeze({
  MES: [300, 200_000],
  HORA: [3, 2_000],
  DIA: [20, 5_000],
});

/**
 * Valor em reais de um texto: "2.500", "2500", "R$ 2.500,00", "15,50", "1.234,56" -> número, ou null.
 * Com ponto e vírgula, o último separador é o decimal. Só ponto: milhar se vier em grupos de três
 * ("2.500"), senão decimal ("15.5"). Só vírgula: decimal.
 */
export function parseMoney(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : null;
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/r\$/gi, '').replace(/\s+/g, '');
  if (!/^\d[\d.,]*$/.test(text)) return null;
  let normalized;
  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalIsComma = lastComma > lastDot;
    const dec = decimalIsComma ? ',' : '.';
    const thousand = decimalIsComma ? '.' : ',';
    const decimals = text.length - 1 - text.lastIndexOf(dec);
    if (decimals < 1 || decimals > 2) return null;
    normalized = text.split(thousand).join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    if ((text.match(/,/g) ?? []).length > 1) return null;
    const decimals = text.length - 1 - lastComma;
    normalized = decimals >= 1 && decimals <= 2 ? text.replace(',', '.') : decimals === 3 ? text.replace(',', '') : null;
  } else if (lastDot >= 0) {
    normalized = /^\d{1,3}(\.\d{3})+$/.test(text) ? text.replace(/\./g, '') : (text.match(/\./g) ?? []).length === 1 && text.length - 1 - lastDot <= 2 ? text : null;
  } else {
    normalized = text;
  }
  if (normalized == null) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

const AMOUNT = String.raw`(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(\s*mil\b)?`;
const AMOUNT_RE = new RegExp(AMOUNT, 'g');
const RANGE_NEXT = new RegExp(String.raw`^\s*(?:a|ate|-|–|—|e|/|ou)\s*${AMOUNT}`);

/** Palavras que indicam que o número é remuneração (sem "R$" na frente). */
const SALARY_WORD = /(salario|remuneracao|piso|ganhos?|valor|pagamento|bolsa|fixo|diaria|vencimentos?)[^0-9]{0,30}$/;
/** Benefícios e variáveis: um valor ao lado deles não é o salário. */
const BENEFIT_BEFORE = /(ganhe|lucre|vale|vr|va|vt|auxilio|bonus|comissao|comissoes|premio|premiacao|cesta|gratificacao|ajuda de custo|plano|desconto|multa|taxa|mensalidade)\b[^0-9]{0,25}$/;
const BENEFIT_AFTER = /^\s*(?:\/\s*\w+\s*)?(?:de\s+|em\s+)?(?:vale|vr\b|va\b|vt\b|bonus|comiss|premi|auxilio|cesta|gratific|plano|desconto)/;

/** "2.500 por mês", "15,50/hora": o período colado no número basta como contexto de remuneração. */
const STRICT_PERIOD_AFTER = /^\s*(?:por\s+(?:hora|mes|dia)\b|ao\s+(?:mes|dia)\b|\/\s*(?:h|hora|mes|dia)\b|mensais?\b|p\/\s*h\b)/;

const PERIOD_AFTER = [
  ['HORA', /^[^0-9]{0,6}(?:por hora|a hora|\/\s*h\b|\/\s*hora|p\/\s*h\b|horista|hora\b|hr\b)/],
  ['DIA', /^[^0-9]{0,6}(?:por dia|ao dia|\/\s*dia|diaria|diario)/],
  ['MES', /^[^0-9]{0,6}(?:por mes|ao mes|\/\s*mes|mensal|mensais|mes\b)/],
];
const PERIOD_BEFORE = [
  ['HORA', /(?:valor hora|por hora|horista)[^0-9]{0,12}$/],
  ['DIA', /(?:diaria|valor dia|por dia)[^0-9]{0,12}$/],
  ['MES', /(?:salario mensal|mensal|por mes)[^0-9]{0,12}$/],
];

function amountOf(match) {
  const base = parseMoney(match[1]);
  if (base === null) return null;
  return match[2] ? base * 1000 : base;
}

function periodAround(folded, start, end) {
  const after = folded.slice(end, end + 40);
  for (const [period, re] of PERIOD_AFTER) if (re.test(after)) return period;
  const before = folded.slice(Math.max(0, start - 40), start);
  for (const [period, re] of PERIOD_BEFORE) if (re.test(before)) return period;
  return null;
}

/**
 * Primeira remuneração citada no texto: `{ min, max, period }` ou null.
 * Só conta o número que tem "R$" na frente ou uma palavra de remuneração antes ("salário 2500").
 * Aceita faixa ("R$ 2.500 a R$ 3.000", "2500-3000", "entre 2.000 e 2.500"), "3 mil", "por hora", "por mês".
 * Sem período dito, assume mês, desde que o valor caiba numa faixa mensal.
 */
export function extractSalary(text) {
  const folded = foldText(text);
  if (!folded) return null;
  for (const match of folded.matchAll(AMOUNT_RE)) {
    const hasCurrency = /r\$/.test(match[0]);
    const start = match.index;
    let end = start + match[0].length;
    const before = folded.slice(Math.max(0, start - 40), start);
    if (!hasCurrency && !SALARY_WORD.test(before) && !STRICT_PERIOD_AFTER.test(folded.slice(end, end + 16))) continue;
    if (BENEFIT_BEFORE.test(before) || BENEFIT_AFTER.test(folded.slice(end, end + 24))) continue;
    const first = amountOf(match);
    if (first === null) continue;
    let second = null;
    const next = RANGE_NEXT.exec(folded.slice(end));
    if (next) {
      const value = parseMoney(next[1]);
      if (value !== null) second = next[2] ? value * 1000 : value;
      if (second !== null) end += next[0].length;
    }
    const period = periodAround(folded, start, end) ?? 'MES';
    let [min, max] = second !== null && second >= first ? [first, second] : [first, first];
    const [low, high] = PLAUSIBLE[period];
    if (min < low || max > high) continue;
    // "R$ 1.500 e 2" não é faixa: o segundo número tem de caber na mesma escala.
    if (max > min * 20) max = min;
    min = Math.round(min * 100) / 100;
    max = Math.round(max * 100) / 100;
    return { min, max, period };
  }
  return null;
}

/**
 * Salário que a fonte entrega em campos. Valores previstos pela fonte (não ditos pelo anunciante) ou
 * fora de faixa são descartados. `period` ausente vira mês.
 * @param {{ min?: number|string|null, max?: number|string|null, period?: string|null, predicted?: boolean }} fields
 */
export function salaryFromFields({ min, max, period, predicted = false } = {}) {
  if (predicted) return null;
  const low = parseMoney(min ?? null);
  const high = parseMoney(max ?? null);
  const a = low ?? high;
  const b = high ?? low;
  if (a === null || b === null || a <= 0) return null;
  const p = Object.hasOwn(SALARY_PERIODS, period) ? period : 'MES';
  const [lo, hi] = PLAUSIBLE[p];
  const [x, y] = a <= b ? [a, b] : [b, a];
  if (x < lo || y > hi) return null;
  return { min: Math.round(x * 100) / 100, max: Math.round(y * 100) / 100, period: p };
}

/** "2.500" ou "2.500,50": pt-BR, sem centavos quando o valor é inteiro. */
export function formatMoney(value) {
  const cents = Math.round(Number(value) * 100);
  if (!Number.isFinite(cents) || cents < 0) return '';
  const whole = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const rest = cents % 100;
  return rest === 0 ? whole : `${whole},${String(rest).padStart(2, '0')}`;
}

/**
 * Texto do salário para o cartão: "Salário: R$ 2.500 a R$ 3.000 por mês", "Salário: R$ 15,50 por hora"
 * ou "Salário não informado".
 * @param {{ min?: number|null, max?: number|null, period?: string|null }|null} salary
 */
export function salaryLabel(salary) {
  const min = Number(salary?.min);
  const max = Number(salary?.max ?? salary?.min);
  if (!salary || !Number.isFinite(min) || min <= 0) return 'Salário não informado';
  const high = Number.isFinite(max) && max >= min ? max : min;
  const per = SALARY_PERIODS[salary.period] ?? SALARY_PERIODS.MES;
  const amount = high === min ? `R$ ${formatMoney(min)}` : `R$ ${formatMoney(min)} a R$ ${formatMoney(high)}`;
  return `Salário: ${amount} por ${per}`;
}
