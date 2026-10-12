const SIGNAL_TERMS = ['expansão', 'nova unidade', 'licitação', 'obra', 'investimento', 'contratação'];

/** Build search queries from the company's commercial profile. */
export function buildSearchQueries(profile, { news = false } = {}) {
  const industries = profile.preferredIndustries?.length ? profile.preferredIndustries : ['empresa'];
  const places = profile.serviceLocations?.length ? profile.serviceLocations : [profile.city, profile.state].filter(Boolean);
  const place = places[0] || 'Brasil';
  const offer = [...(profile.services || []), ...(profile.products || [])][0] || '';
  const queries = [];
  for (const ind of industries.slice(0, 3)) {
    for (const term of SIGNAL_TERMS.slice(0, news ? 3 : 2)) {
      queries.push(`${ind} ${term} ${place}`.trim());
    }
  }
  if (offer && !news) queries.unshift(`${profile.idealCustomer || industries[0]} ${offer} ${place}`.slice(0, 120));
  for (const kw of (profile.keywords || []).slice(0, 2)) queries.push(`${kw} ${place}`);
  return Array.from(new Set(queries));
}
