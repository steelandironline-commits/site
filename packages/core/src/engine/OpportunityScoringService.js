import { fold } from '@autopix/shared';

const VALUE_MULTIPLIER = {
  EXPANSION: 2.5,
  CONSTRUCTION: 2,
  NEW_PROJECT: 2,
  PURCHASE: 1.6,
  HIRING: 1.2,
  DEMAND: 1.1,
};

const round500 = (v) => Math.max(500, Math.round(v / 500) * 500);

function includesFolded(haystack, needle) {
  const n = fold(needle).trim();
  return n.length >= 3 && haystack.includes(n);
}

/**
 * OpportunityScoringService — transparent, explainable 0–100 score.
 *   industry fit      0–25
 *   service fit       0–25
 *   location fit      0–15
 *   signal strength   0–25
 *   value fit         0–10
 */
export class OpportunityScoringService {
  score({ profile, candidate, research, signals }) {
    const text = fold(`${candidate.text || ''} ${research?.text || ''} ${research?.description || ''}`);
    const industry = research?.industry || candidate.industry || null;
    const reasons = [];

    // Hard exclusions
    if (industry && (profile.excludedIndustries || []).some((x) => fold(industry).includes(fold(x)))) {
      return { score: 0, disqualified: 'excluded_industry', reasons: ['Setor excluído pelo cliente'] };
    }
    if (research?.inactiveRegistry) {
      return { score: 0, disqualified: 'inactive_registry', reasons: ['CNPJ com situação cadastral inativa'] };
    }

    // Industry
    let industryFit = 12;
    const preferred = profile.preferredIndustries || [];
    if (preferred.length && industry) {
      if (preferred.some((p) => fold(industry).includes(fold(p)) || fold(p).includes(fold(industry)))) {
        industryFit = 25;
        reasons.push(`Setor preferencial: ${industry}`);
      } else industryFit = 7;
    } else if (!preferred.length) industryFit = 15;

    // Services / products / keywords
    const offers = Array.from(new Set([...(profile.services || []), ...(profile.products || [])]));
    const matchingServices = offers.filter((o) => includesFolded(text, o));
    const keywordHits = (profile.keywords || []).filter((k) => includesFolded(text, k));
    const serviceMatches = matchingServices.length + keywordHits.length;
    const serviceFit = serviceMatches >= 2 ? 25 : serviceMatches === 1 ? 17 : signals.some((s) => s.type === 'DEMAND' || s.type === 'PURCHASE') ? 10 : 5;
    if (matchingServices.length) reasons.push(`Demanda compatível com: ${matchingServices.join(', ')}`);
    if (keywordHits.length) reasons.push(`Palavras-chave encontradas: ${keywordHits.join(', ')}`);

    // Location
    const city = research?.city || candidate.city;
    const state = research?.state || candidate.state;
    const locations = (profile.serviceLocations || []).map(fold);
    let locationFit = 6;
    if (city && (locations.some((l) => l.includes(fold(city))) || (profile.city && fold(profile.city) === fold(city)))) {
      locationFit = 15;
      reasons.push(`Dentro da região de atendimento (${city}/${state || ''})`);
    } else if (state && (fold(profile.state || '') === fold(state) || locations.some((l) => l.endsWith(fold(state))))) {
      locationFit = 10;
      reasons.push(`Mesmo estado (${state})`);
    } else if (city || state) {
      locationFit = (profile.serviceRadiusKm || 0) >= 1000 ? 9 : 3;
    }

    // Signals
    const top = signals[0];
    const signalFit = top ? Math.min(25, Math.round(top.strength * 20 + Math.min(5, (signals.length - 1) * 2.5))) : 0;
    if (top) reasons.push(`${top.title}`);

    // Value
    const ticket = profile.averageTicket || profile.minimumDeal || 10000;
    const mult = (top ? VALUE_MULTIPLIER[top.type] : 1) * (1 + 0.15 * Math.min(3, serviceMatches));
    const estimate = { min: round500(ticket * mult * 0.7), max: round500(ticket * mult * 1.8) };
    let valueFit = 10;
    if (profile.minimumDeal && estimate.max < profile.minimumDeal) {
      valueFit = 0;
      reasons.push('Valor estimado abaixo do mínimo desejado');
    } else if (profile.minimumDeal && estimate.min < profile.minimumDeal) valueFit = 6;

    const score = Math.max(0, Math.min(100, industryFit + serviceFit + locationFit + signalFit + valueFit));

    // Confidence reflects how much evidence we have, not how good the fit is.
    let confidence = 0.35;
    if (research?.websiteAnalyzed) confidence += 0.2;
    confidence += Math.min(0.2, (research?.sources?.length || 0) * 0.05);
    if (research?.contacts?.length) confidence += 0.1;
    if (signals.length > 1) confidence += 0.1;
    confidence = Number(Math.min(0.95, confidence).toFixed(2));

    const priority = score >= 85 ? 'HIGH' : score >= 70 ? 'MEDIUM' : 'LOW';
    return {
      score,
      confidence,
      priority,
      matchingServices: matchingServices.length ? matchingServices : keywordHits,
      reasons,
      estimate,
      breakdown: { industryFit, serviceFit, locationFit, signalFit, valueFit },
    };
  }
}
