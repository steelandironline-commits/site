import { DemoSourceAdapter } from './DemoSourceAdapter.js';
import { SearchSourceAdapter } from './SearchSourceAdapter.js';
import { WebsiteSourceAdapter } from './WebsiteSourceAdapter.js';
import { NewsSourceAdapter } from './NewsSourceAdapter.js';
import { PublicBusinessSourceAdapter } from './PublicBusinessSourceAdapter.js';

export { SourceAdapter } from './SourceAdapter.js';
export { DemoSourceAdapter, SearchSourceAdapter, WebsiteSourceAdapter, NewsSourceAdapter, PublicBusinessSourceAdapter };

/**
 * DEMO_MODE=true  -> only the DemoSourceAdapter (fictional data).
 * DEMO_MODE=false -> only real adapters; the demo adapter is never built.
 */
export function buildSourceAdapters(config) {
  if (config.demoMode) return [new DemoSourceAdapter({ enabled: true })];
  return [
    new SearchSourceAdapter({ provider: config.search.provider, apiKey: config.search.apiKey }),
    new NewsSourceAdapter({ enabled: config.search.newsEnabled }),
    new WebsiteSourceAdapter(),
    new PublicBusinessSourceAdapter({ enabled: config.search.publicBusinessEnabled }),
  ].filter((a) => a.isEnabled());
}
