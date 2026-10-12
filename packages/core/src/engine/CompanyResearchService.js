import { logger } from '../logger.js';

/** Enriches a candidate with every research-capable adapter. */
export class CompanyResearchService {
  constructor({ adapters = [] } = {}) {
    this.adapters = adapters.filter((a) => a.canResearch && a.isEnabled());
  }

  async research(candidate) {
    const result = {
      text: candidate.text || '',
      title: null,
      description: null,
      industry: candidate.industry || null,
      city: candidate.city || null,
      state: candidate.state || null,
      cnpj: candidate.cnpj || null,
      contacts: [],
      sources: candidate.source ? [candidate.source] : [],
      facts: [],
      errors: [],
      websiteAnalyzed: false,
    };

    // Website first: it may reveal the CNPJ used by registry lookups.
    const ordered = [...this.adapters].sort((a, b) => (a.type === 'WEBSITE' ? -1 : 0) - (b.type === 'WEBSITE' ? -1 : 0));
    for (const adapter of ordered) {
      try {
        const r = await adapter.research({ ...candidate, cnpj: result.cnpj });
        if (!r) continue;
        if (r.text) result.text = `${result.text}\n${r.text}`.slice(0, 12000);
        result.title ??= r.title || null;
        result.description ??= r.description || null;
        result.industry ??= r.industry || null;
        result.city ??= r.city || null;
        result.state ??= r.state || null;
        result.cnpj ??= r.cnpj || null;
        if (r.active === false) result.inactiveRegistry = true;
        result.contacts.push(...(r.contacts || []));
        result.sources.push(...(r.sources || []));
        result.facts.push(...(r.facts || []));
        if (adapter.type === 'WEBSITE' || adapter.type === 'DEMO') result.websiteAnalyzed = true;
      } catch (err) {
        logger.debug('research adapter failed', { adapter: adapter.name, err });
        result.errors.push({ adapter: adapter.name, message: err.message });
      }
    }
    return result;
  }
}
