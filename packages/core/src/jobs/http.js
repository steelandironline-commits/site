import { logger } from '../logger.js';

/** Erro de uma fonte de vagas. Nunca carrega a URL (ela pode levar a chave da API): só o nome da fonte e o status. */
export class JobSourceError extends Error {
  constructor(source, status, message) {
    super(message || `${source} ${status || 'sem resposta'}`);
    this.name = 'JobSourceError';
    this.source = source;
    this.status = status || 0;
  }
}

export const DEFAULT_SLEEP = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MAX_WAIT_MS = 120_000;

/**
 * Espera antes da próxima tentativa. 429: respeita Retry-After (em segundos ou data), senão 15 s, 30 s, 60 s...
 * Erro de servidor ou de rede: 2 s, 4 s, 8 s... Sempre limitada.
 */
export function retryWaitMs(status, attempt, retryAfter) {
  if (status === 429) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, MAX_WAIT_MS);
    const date = retryAfter ? Date.parse(retryAfter) : NaN;
    if (Number.isFinite(date) && date > Date.now()) return Math.min(date - Date.now(), MAX_WAIT_MS);
    return Math.min(15_000 * 2 ** attempt, MAX_WAIT_MS);
  }
  return Math.min(2000 * 2 ** attempt, MAX_WAIT_MS);
}

/**
 * GET com tentativas. Repete em 429, 5xx e falha de rede (até `maxAttempts`); qualquer outro status de erro
 * encerra na hora. Devolve o corpo em texto e o cabeçalho content-type. Falha final: JobSourceError.
 */
export async function getWithBackoff(source, url, { fetchImpl = globalThis.fetch, sleep = DEFAULT_SLEEP, maxAttempts = 3, timeoutMs = 30_000, maxBytes = 5 * 1024 * 1024, headers = {} } = {}) {
  let status = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res = null;
    try {
      res = await fetchImpl(url, { headers: { Accept: 'application/json, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5', ...headers }, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
      status = res.status;
    } catch {
      status = 0;
    }
    if (res?.ok) {
      const declared = Number(res.headers?.get?.('content-length'));
      if (Number.isFinite(declared) && declared > maxBytes) throw new JobSourceError(source, 0, `${source}: resposta grande demais`);
      const text = await res.text();
      if (text.length > maxBytes) throw new JobSourceError(source, 0, `${source}: resposta grande demais`);
      return { text, contentType: res.headers?.get?.('content-type') || '' };
    }
    const retryable = status === 0 || status === 429 || status >= 500;
    if (!retryable) throw new JobSourceError(source, status);
    if (attempt + 1 >= maxAttempts) break;
    const wait = retryWaitMs(status, attempt, res?.headers?.get?.('retry-after'));
    logger.warn('job source retry', { source, status, attempt: attempt + 1, waitMs: wait });
    await sleep(wait);
  }
  throw new JobSourceError(source, status);
}
