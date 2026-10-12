const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlInt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat('pt-BR');

/** Format an amount in cents as BRL, e.g. 59700 -> "R$ 597,00". */
export function formatCents(cents) {
  return brl.format((Number(cents) || 0) / 100).replace(/ /g, ' ');
}

/** Format whole reais without decimals, e.g. 18000 -> "R$ 18.000". */
export function formatBRL(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return brlInt.format(Number(value)).replace(/ /g, ' ');
}

/** Format a min/max range in reais. */
export function formatRange(min, max) {
  if (min == null && max == null) return '—';
  if (min == null) return `até ${formatBRL(max)}`;
  if (max == null || max === min) return formatBRL(min);
  return `${formatBRL(min)} – ${formatBRL(max)}`;
}

export function formatNumber(value) {
  return num.format(Number(value) || 0);
}

/** Normalize a business name/domain to a dedupe key. */
export function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Lowercase + strip accents, useful for keyword matching. */
export function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function onlyDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

/** Validate a CNPJ (digits + check digits). */
export function isValidCnpj(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base) => {
    const weights = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base.split('').reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = calc(cnpj.slice(0, 12));
  const d2 = calc(cnpj.slice(0, 12) + d1);
  return cnpj.endsWith(`${d1}${d2}`);
}

/** Validate a CPF (digits + check digits). */
export function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export function formatCpf(value) {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

/** CPF (up to 11 digits) or CNPJ (12–14), masked while typing. */
export function formatDocument(value) {
  const d = onlyDigits(value).slice(0, 14);
  return d.length <= 11 ? formatCpf(d) : formatCnpj(d);
}

/** Show only the middle of a CPF: ***.456.789-** */
export function maskCpf(value) {
  const d = onlyDigits(value);
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : '';
}

export function formatCnpj(value) {
  const d = onlyDigits(value).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}
