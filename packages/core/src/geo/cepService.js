import { logger } from '../logger.js';

/**
 * CEP → cidade/UF through ViaCEP (free, public). Called by the API, never by the
 * browser (the page only talks to its own server). Results are cached in memory.
 */
export class CepService {
  constructor({ fetchImpl = globalThis.fetch, ttlMs = 24 * 60 * 60 * 1000, now = () => Date.now() } = {}) {
    this.fetch = fetchImpl;
    this.ttlMs = ttlMs;
    this.now = now;
    this.cache = new Map();
  }

  /** @returns {Promise<{cep:string, city:string, state:string, district:string|null}|null>} null when the CEP does not exist. */
  async lookup(cep) {
    const digits = String(cep || '').replace(/\D/g, '');
    if (!/^\d{8}$/.test(digits)) return null;
    const hit = this.cache.get(digits);
    if (hit && hit.at + this.ttlMs > this.now()) return hit.value;

    let res;
    try {
      res = await this.fetch(`https://viacep.com.br/ws/${digits}/json/`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
    } catch (err) {
      logger.warn('cep lookup unavailable', { reason: err.name });
      throw Object.assign(new Error('cep lookup unavailable'), { unavailable: true });
    }
    if (!res.ok) {
      if (res.status === 400) return null;
      throw Object.assign(new Error('cep lookup unavailable'), { unavailable: true });
    }
    const data = await res.json().catch(() => ({}));
    const value = data?.erro || !data?.localidade ? null : { cep: digits, city: data.localidade, state: data.uf, district: data.bairro || null };
    this.cache.set(digits, { at: this.now(), value });
    if (this.cache.size > 5000) this.cache.delete(this.cache.keys().next().value);
    return value;
  }
}
