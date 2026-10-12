import { SourceAdapter } from './SourceAdapter.js';
import { buildSearchQueries } from './queries.js';

/**
 * Web search discovery. Currently implements the Brave Search API
 * (SEARCH_PROVIDER=brave, SEARCH_API_KEY). Disabled when not configured.
 */
export class SearchSourceAdapter extends SourceAdapter {
  name = 'search';
  type = 'SEARCH';

  constructor({ provider, apiKey, fetchImpl = globalThis.fetch } = {}) {
    super();
    this.provider = provider;
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
  }

  isEnabled() {
    return this.provider === 'brave' && Boolean(this.apiKey);
  }

  get canDiscover() {
    return true;
  }

  async discover(profile, { limit = 12 } = {}) {
    if (!this.isEnabled()) return [];
    const queries = buildSearchQueries(profile).slice(0, 3);
    const out = [];
    for (const q of queries) {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&country=BR&search_lang=pt-br&count=10`;
      const res = await this.fetch(url, {
        headers: { Accept: 'application/json', 'X-Subscription-Token': this.apiKey },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`search provider status ${res.status}`);
      const data = await res.json();
      for (const r of data.web?.results || []) {
        const name = String(r.title || '')
          .split(/\s[|\-–—:]\s/)[0]
          .trim();
        if (!name || name.length < 3) continue;
        let website = null;
        try {
          website = new URL(r.url).origin;
        } catch {
          /* ignore */
        }
        out.push({
          name,
          website,
          text: `${r.title}. ${r.description || ''}`.replace(/<[^>]+>/g, ''),
          isDemo: false,
          query: q,
          source: { type: 'SEARCH', title: r.title, url: r.url, snippet: (r.description || '').replace(/<[^>]+>/g, '') },
        });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }
}
