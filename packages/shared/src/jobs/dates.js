// Datas da vaga: há quantos dias foi publicada e quantos dias restam de prazo. Funções puras.
const DAY_MS = 24 * 60 * 60 * 1000;

const toTime = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

/**
 * Dias inteiros desde a publicação ("publicada há N dias"). Nunca negativo: uma data no futuro
 * (relógio da fonte adiantado) conta como hoje. `null` quando a vaga não tem data.
 */
export function daysSincePosted(postedAt, now = new Date()) {
  const posted = toTime(postedAt);
  const current = toTime(now);
  if (posted === null || current === null) return null;
  return Math.max(0, Math.floor((current - posted) / DAY_MS));
}

/**
 * Dias inteiros até o prazo (`expiresAt`), quando a fonte informa. Sem data, `null`: o prazo nunca é inventado.
 * Prazo vencido dá número negativo.
 */
export function daysUntilDeadline(expiresAt, now = new Date()) {
  const expires = toTime(expiresAt);
  const current = toTime(now);
  if (expires === null || current === null) return null;
  return Math.floor((expires - current) / DAY_MS);
}

/** "publicada hoje", "publicada há 1 dia", "publicada há N dias". */
export function postedLabel(days) {
  if (days === null || days === undefined) return 'data de publicação não informada';
  if (days <= 0) return 'publicada hoje';
  return days === 1 ? 'publicada há 1 dia' : `publicada há ${days} dias`;
}

/** "prazo: N dias" quando a fonte informa o prazo; senão, "prazo não informado pela fonte". */
export function deadlineLabel(days) {
  if (days === null || days === undefined) return 'prazo não informado pela fonte';
  if (days < 0) return 'prazo encerrado';
  if (days === 0) return 'prazo: termina hoje';
  return days === 1 ? 'prazo: 1 dia' : `prazo: ${days} dias`;
}
