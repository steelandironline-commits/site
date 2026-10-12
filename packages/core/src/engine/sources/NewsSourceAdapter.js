import { SourceAdapter } from './SourceAdapter.js';
import { buildSearchQueries } from './queries.js';
import { safeFetchText } from './safeFetch.js';

const ACTION = /\s(anuncia|inaugura|investe|amplia|contrata|abre|constr[oó]i|expande|vai investir|planeja|lan[cç]a|recebe|adquire)\b/i;

function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/** Extract the subject company of a headline such as "Empresa X anuncia nova fábrica". */
export function extractCompanyFromHeadline(title) {
  const clean = decode(title).replace(/\s-\s[^-]+$/, ''); // drop " - Publisher"
  const m = clean.match(ACTION);
  if (!m || m.index < 3) return null;
  const subject = clean.slice(0, m.index).trim();
  if (subject.split(/\s+/).length > 6) return null;
  return subject;
}

/** Public news discovery through Google News RSS (no API key). */
export class NewsSourceAdapter extends SourceAdapter {
  name = 'news';
  type = 'NEWS';

  constructor({ enabled = false, fetchImpl } = {}) {
    super();
    this.enabled = enabled;
    this.fetchImpl = fetchImpl;
  }

  isEnabled() {
    return this.enabled;
  }

  get canDiscover() {
    return true;
  }

  async discover(profile, { limit = 10 } = {}) {
    if (!this.enabled) return [];
    const out = [];
    for (const q of buildSearchQueries(profile, { news: true }).slice(0, 3)) {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
      const { text: xml } = await safeFetchText(url, { fetchImpl: this.fetchImpl, accept: 'application/rss+xml' });
      const items = xml.split(/<item>/).slice(1);
      for (const item of items) {
        const title = decode(item.match(/<title>([\s\S]*?)<\/title>/)?.[1]);
        const link = decode(item.match(/<link>([\s\S]*?)<\/link>/)?.[1]);
        const name = extractCompanyFromHeadline(title);
        if (!name) continue;
        out.push({
          name,
          website: null,
          text: title,
          isDemo: false,
          query: q,
          source: { type: 'NEWS', title, url: link, snippet: title },
        });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }
}
