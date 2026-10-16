import { FinancialError, withRetry } from '../errors.js';
import { logger } from '../../logger.js';
import { networkReason } from './http.js';

/**
 * BancoDoBrasilAuthService — OAuth2 client_credentials against BB.
 *  - token cached in backend memory, refreshed `refreshSkewMs` before expiry
 *  - concurrent callers share one in-flight request (single flight)
 *  - network/5xx/429 retried with exponential backoff
 *  - never logs client secret or tokens; never exposed to the frontend
 */
export class BancoDoBrasilAuthService {
  constructor({ clientId, clientSecret, oauthUrl, scopes, fetchImpl, now = () => Date.now(), refreshSkewMs = 60_000, sleep } = {}) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.oauthUrl = oauthUrl;
    this.scopes = scopes;
    this.fetch = fetchImpl;
    this.now = now;
    this.refreshSkewMs = refreshSkewMs;
    this.sleep = sleep;
    this.cached = null; // { token, expiresAt }
    this.inflight = null;
  }

  invalidate() {
    this.cached = null;
  }

  async getToken() {
    if (this.cached && this.cached.expiresAt - this.refreshSkewMs > this.now()) return this.cached.token;
    if (!this.inflight) {
      this.inflight = this.#request().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  async #request() {
    if (!this.clientId || !this.clientSecret) throw new FinancialError('PROVIDER_AUTH_FAILED', { detail: 'missing BB client credentials' });
    const started = this.now();
    const data = await withRetry(
      async () => {
        let res;
        try {
          res = await this.fetch(this.oauthUrl, {
            method: 'POST',
            headers: {
              Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            // An empty scope list is not sent at all (configurable per API).
            body: new URLSearchParams({ grant_type: 'client_credentials', ...(this.scopes ? { scope: this.scopes } : {}) }).toString(),
            signal: AbortSignal.timeout(10_000),
          });
        } catch (err) {
          throw new FinancialError('PROVIDER_UNAVAILABLE', { detail: `oauth network: ${networkReason(err)}`, retryable: true });
        }
        if (res.status === 429) throw new FinancialError('RATE_LIMITED', { retryable: true, providerStatus: 429 });
        if (res.status >= 500) throw new FinancialError('PROVIDER_UNAVAILABLE', { retryable: true, providerStatus: res.status });
        if (!res.ok) {
          // The bank's error code only (e.g. invalid_client, invalid_scope); never the request.
          const body = await res.json().catch(() => ({}));
          throw new FinancialError('PROVIDER_AUTH_FAILED', { providerStatus: res.status, detail: `oauth rejected: ${String(body?.error || body?.erro || '').slice(0, 60)}` });
        }
        return res.json();
      },
      { retries: 3, sleep: this.sleep },
    );
    if (!data?.access_token) throw new FinancialError('PROVIDER_AUTH_FAILED', { detail: 'oauth response without token' });
    const ttlMs = Math.max(60, Number(data.expires_in) || 600) * 1000;
    this.cached = { token: data.access_token, expiresAt: this.now() + ttlMs };
    // Safe metadata only.
    logger.info('bb oauth token issued', { expiresInS: Math.round(ttlMs / 1000), ms: this.now() - started });
    return this.cached.token;
  }
}
