import { fold, normalizeKey } from '@autopix/shared';
import { logger } from '../logger.js';

/** Runs discovery adapters, de-duplicates and filters candidates. */
export class OpportunityDiscoveryService {
  constructor({ adapters = [] } = {}) {
    this.adapters = adapters.filter((a) => a.canDiscover && a.isEnabled());
  }

  get hasSources() {
    return this.adapters.length > 0;
  }

  static candidateKey(c) {
    return normalizeKey(c.website || c.name);
  }

  async discover(profile, { limit = 12, seed } = {}) {
    const errors = [];
    const all = [];
    for (const adapter of this.adapters) {
      try {
        const found = await adapter.discover(profile, { limit, seed });
        all.push(...found.map((c) => ({ ...c, adapter: adapter.name })));
      } catch (err) {
        logger.warn('discovery adapter failed', { adapter: adapter.name, err });
        errors.push({ adapter: adapter.name, message: err.message });
      }
    }

    const own = new Set([normalizeKey(profile.name), normalizeKey(profile.website || '')].filter(Boolean));
    const excluded = (profile.excludedIndustries || []).map(fold);
    const seen = new Set();
    const candidates = [];
    for (const c of all) {
      const key = OpportunityDiscoveryService.candidateKey(c);
      if (!key || seen.has(key) || own.has(key)) continue;
      if (c.industry && excluded.some((x) => fold(c.industry).includes(x))) continue;
      seen.add(key);
      candidates.push({ ...c, key });
      if (candidates.length >= limit) break;
    }
    return { candidates, errors, sources: this.adapters.map((a) => a.name) };
  }
}
