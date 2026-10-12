import { describe, it, expect } from 'vitest';
import { SignalDetectionService } from '../src/engine/SignalDetectionService.js';
import { OpportunityScoringService } from '../src/engine/OpportunityScoringService.js';
import { OpportunityDiscoveryService } from '../src/engine/OpportunityDiscoveryService.js';
import { DemoSourceAdapter } from '../src/engine/sources/DemoSourceAdapter.js';
import { buildSourceAdapters } from '../src/engine/sources/index.js';
import { extractCompanyFromHeadline } from '../src/engine/sources/NewsSourceAdapter.js';
import { isPrivateAddress } from '../src/engine/sources/safeFetch.js';
import { SalesIntelligenceService } from '../src/engine/SalesIntelligenceService.js';

const profile = {
  id: 'c1',
  name: 'Usinagem Sul',
  services: ['Usinagem', 'Caldeiraria'],
  products: [],
  keywords: ['manutenção preventiva'],
  preferredIndustries: ['Indústria'],
  excludedIndustries: ['Varejo'],
  serviceLocations: ['Joinville - SC'],
  city: 'Joinville',
  state: 'SC',
  averageTicket: 20000,
  minimumDeal: 5000,
  idealCustomer: 'Indústrias',
};

describe('SignalDetectionService', () => {
  it('detects expansion and purchase signals in Portuguese text', () => {
    const s = new SignalDetectionService().detect({
      candidate: { text: 'A Indústria X anunciou expansão com nova unidade. Abertura de cotação para fornecedores de usinagem.' },
      research: null,
    });
    const types = s.map((x) => x.type);
    expect(types).toContain('EXPANSION');
    expect(types).toContain('PURCHASE');
    expect(s[0].strength).toBeGreaterThan(0.8);
  });

  it('returns nothing for neutral text', () => {
    expect(new SignalDetectionService().detect({ candidate: { text: 'Empresa tradicional da região.' } })).toEqual([]);
  });
});

describe('OpportunityScoringService', () => {
  const scoring = new OpportunityScoringService();
  const signals = new SignalDetectionService();

  it('scores a strong local match highly and explains why', () => {
    const candidate = { name: 'Indústria Alpha', industry: 'Indústria', city: 'Joinville', state: 'SC', text: 'Expansão da fábrica; busca fornecedor de usinagem e caldeiraria.' };
    const sig = signals.detect({ candidate });
    const r = scoring.score({ profile, candidate, research: { websiteAnalyzed: true, sources: [{}, {}], contacts: [{}] }, signals: sig });
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.priority).toBe('HIGH');
    expect(r.matchingServices).toEqual(['Usinagem', 'Caldeiraria']);
    expect(r.reasons.join(' ')).toMatch(/Setor preferencial/);
    expect(r.estimate.max).toBeGreaterThan(r.estimate.min);
  });

  it('disqualifies excluded industries', () => {
    const r = scoring.score({ profile, candidate: { name: 'Loja', industry: 'Varejo', text: 'expansão' }, research: null, signals: [] });
    expect(r.score).toBe(0);
    expect(r.disqualified).toBe('excluded_industry');
  });

  it('penalizes distant, unrelated candidates', () => {
    const candidate = { name: 'Hotel', industry: 'Hotelaria', city: 'Recife', state: 'PE', text: 'Contratando recepcionistas.' };
    const r = scoring.score({ profile, candidate, research: null, signals: signals.detect({ candidate }) });
    expect(r.score).toBeLessThan(60);
  });
});

describe('sources', () => {
  it('demo adapter is the only adapter in DEMO_MODE and absent otherwise', () => {
    const base = { search: { provider: undefined, apiKey: undefined, newsEnabled: false, publicBusinessEnabled: false } };
    expect(buildSourceAdapters({ ...base, demoMode: true }).map((a) => a.name)).toEqual(['demo']);
    const real = buildSourceAdapters({ ...base, demoMode: false });
    expect(real.some((a) => a.isDemo)).toBe(false);
  });

  it('demo candidates are fictional (.example) and respect exclusions', async () => {
    const adapter = new DemoSourceAdapter({ enabled: true });
    const disc = new OpportunityDiscoveryService({ adapters: [adapter] });
    const { candidates } = await disc.discover({ ...profile, preferredIndustries: [], excludedIndustries: ['Varejo', 'Saúde'] }, { seed: 42, limit: 6 });
    expect(candidates.length).toBeGreaterThanOrEqual(3);
    for (const c of candidates) {
      expect(c.isDemo).toBe(true);
      expect(new URL(c.website).hostname.endsWith('.example')).toBe(true);
      expect(['Varejo', 'Saúde']).not.toContain(c.industry);
    }
  });

  it('extracts companies from news headlines', () => {
    expect(extractCompanyFromHeadline('Metalúrgica Exemplo anuncia nova fábrica em Joinville - Jornal')).toBe('Metalúrgica Exemplo');
    expect(extractCompanyFromHeadline('Mercado industrial cresce no trimestre')).toBeNull();
  });

  it('blocks private network targets (SSRF)', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('10.1.2.3')).toBe(true);
    expect(isPrivateAddress('192.168.0.10')).toBe(true);
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
  });
});

describe('SalesIntelligenceService', () => {
  it('builds an approach using only the company profile and public data', () => {
    const text = new SalesIntelligenceService().buildApproach({
      profile,
      candidate: { name: 'Indústria Alpha', industry: 'Indústria', city: 'Joinville' },
      signal: { type: 'EXPANSION', title: 'Expansão operacional identificada' },
      matchingServices: ['Usinagem'],
      estimate: { min: 15000, max: 35000 },
    });
    expect(text).toContain('Indústria Alpha');
    expect(text).toContain('R$ 15.000 – R$ 35.000');
    expect(text).toContain('MENSAGEM SUGERIDA');
  });
});
