import { SourceAdapter } from './SourceAdapter.js';
import { DEMO_CITIES, DEMO_PREFIXES, DEMO_SIGNALS, slugify } from './demoData.js';
import { fold } from '@autopix/shared';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * DemoSourceAdapter — only active when DEMO_MODE=true. Generates clearly
 * fictional companies tailored to the subscriber profile. Every candidate is
 * flagged isDemo so the UI can label it DEMO.
 */
export class DemoSourceAdapter extends SourceAdapter {
  name = 'demo';
  type = 'DEMO';
  isDemo = true;

  constructor({ enabled = false, seed } = {}) {
    super();
    this.enabled = enabled;
    this.seed = seed;
  }

  isEnabled() {
    return this.enabled;
  }

  get canDiscover() {
    return true;
  }

  get canResearch() {
    return true;
  }

  async discover(profile, { limit = 6, seed } = {}) {
    if (!this.enabled) return [];
    const rand = mulberry32(seed ?? this.seed ?? hash(`${profile.id}:${Date.now()}`));
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const excluded = (profile.excludedIndustries || []).map(fold);

    let industries = (profile.preferredIndustries || []).filter((i) => DEMO_PREFIXES[i]);
    if (!industries.length) industries = Object.keys(DEMO_PREFIXES);
    industries = industries.filter((i) => !excluded.includes(fold(i)));
    if (!industries.length) industries = ['Indústria'];

    const places = [];
    if (profile.city && profile.state) places.push([profile.city, profile.state]);
    for (const loc of profile.serviceLocations || []) {
      const [city, uf] = String(loc).split(/\s*[-/,]\s*/);
      if (city) places.push([city, (uf || profile.state || 'SP').toUpperCase().slice(0, 2)]);
    }
    const offers = [...(profile.services || []), ...(profile.products || []), ...(profile.keywords || [])];

    const count = Math.max(3, Math.min(limit, 3 + Math.floor(rand() * 4)));
    const out = [];
    const used = new Set();
    for (let i = 0; i < count * 3 && out.length < count; i += 1) {
      // ~30% outside the preferred industries keeps the scores realistic.
      const industry = rand() < 0.3 ? pick(Object.keys(DEMO_PREFIXES).filter((k) => !excluded.includes(fold(k)))) : pick(industries);
      const name = pick(DEMO_PREFIXES[industry]);
      if (used.has(name)) continue;
      used.add(name);
      const [city, state] = rand() < 0.55 && places.length ? pick(places) : pick(DEMO_CITIES);
      const signal = pick(DEMO_SIGNALS);
      const mentioned = offers.length ? offers.filter(() => rand() < 0.4).slice(0, 3) : [];
      const offerText = mentioned.length ? ` Demanda relacionada a ${mentioned.join(', ').toLowerCase()}.` : '';
      const slug = slugify(name);
      out.push({
        name,
        website: `https://${slug}.example`,
        industry,
        city,
        state,
        isDemo: true,
        text: `${name} (${industry}, ${city}/${state}). ${signal.text}${offerText}`,
        demoSignal: signal.type,
        source: {
          type: 'DEMO',
          title: `[DEMO] Fonte fictícia — ${name}`,
          url: `https://${slug}.example/noticias`,
          snippet: signal.text,
        },
      });
    }
    return out;
  }

  async research(candidate) {
    if (!this.enabled || !candidate.isDemo) return null;
    const slug = slugify(candidate.name);
    return {
      title: `${candidate.name} — site institucional (DEMO)`,
      description: `${candidate.industry} em ${candidate.city}/${candidate.state}. Empresa fictícia de demonstração.`,
      text: candidate.text,
      contacts: [
        {
          name: null,
          role: 'Contato comercial (DEMO)',
          businessEmail: `comercial@${slug}.example`,
          companyPhone: null,
          publicSource: `https://${slug}.example/contato`,
          verified: false,
        },
      ],
      sources: [
        {
          type: 'DEMO',
          title: `[DEMO] Site institucional — ${candidate.name}`,
          url: `https://${slug}.example`,
          snippet: 'Conteúdo fictício gerado pelo modo demonstração.',
        },
      ],
      facts: ['Website analisado (DEMO)', 'Perfil comercial identificado (DEMO)'],
    };
  }
}
