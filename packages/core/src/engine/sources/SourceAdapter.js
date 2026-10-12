/**
 * SourceAdapter — contract for every market data source.
 *
 * A Candidate is a company that may become an opportunity:
 *   { key?, name, website?, industry?, city?, state?, cnpj?, text, isDemo,
 *     source: { type, title, url?, snippet? } }
 *
 * A ResearchResult enriches a candidate:
 *   { text?, title?, description?, industry?, city?, state?, cnpj?,
 *     contacts: Contact[], sources: Source[], facts: string[] }
 *
 * Adapters must only use legitimate public business information. They must
 * never query leaked databases or harvest private personal data.
 */
export class SourceAdapter {
  name = 'abstract';
  /** Prisma SourceType */
  type = 'SEARCH';
  isDemo = false;

  isEnabled() {
    return true;
  }

  /** @returns {boolean} true when the adapter implements discover() */
  get canDiscover() {
    return false;
  }

  /** @returns {boolean} true when the adapter implements research() */
  get canResearch() {
    return false;
  }

  // eslint-disable-next-line no-unused-vars
  async discover(profile, options) {
    return [];
  }

  // eslint-disable-next-line no-unused-vars
  async research(candidate) {
    return null;
  }
}
