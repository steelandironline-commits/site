// Adzuna (API pública de vagas, país "br"). Chaves gratuitas em developer.adzuna.com: ADZUNA_APP_ID e ADZUNA_APP_KEY.
// Sem as duas, o adaptador não existe (JobService não o monta). A chave vai na URL por exigência da API: por isso
// nenhuma mensagem de erro, log nem resposta carrega a URL.
import { cleanLine, htmlToText, safeHttpUrl, salaryFromFields } from '@autopix/shared';
import { JobSourceError, getWithBackoff } from './http.js';

const BASE = 'https://api.adzuna.com/v1/api/jobs';

/**
 * Buscas da varredura: um cargo típico por área. A API gratuita tem limite de pedidos por dia, então cada
 * rodada do worker faz poucas buscas e segue de onde parou (JobService guarda o cursor).
 */
export const ADZUNA_QUERIES = Object.freeze([
  'soldador', 'caldeireiro', 'eletricista', 'mecânico', 'pedreiro', 'motorista', 'auxiliar de logística', 'almoxarife',
  'operador de empilhadeira', 'técnico de enfermagem', 'cozinheiro', 'vendedor', 'auxiliar administrativo', 'analista de suporte',
  'auxiliar de limpeza', 'vigilante', 'trabalhador rural', 'professor', 'auxiliar de serviços gerais', 'camareira',
]);

const STATES = Object.freeze({
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES',
  goias: 'GO', maranhao: 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA', paraiba: 'PB',
  parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
  rondonia: 'RO', roraima: 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
});

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** { area: ['Brasil', 'Santa Catarina', 'Joinville'], display_name: 'Joinville, Santa Catarina' } -> { city, state } */
export function parseAdzunaLocation(location) {
  const parts = Array.isArray(location?.area) ? location.area.map((p) => String(p)).filter(Boolean) : [];
  const stateName = parts[1] ?? String(location?.display_name ?? '').split(',').at(-1);
  const state = STATES[fold(stateName)] ?? null;
  const city = parts.length >= 3 ? parts.at(-1) : String(location?.display_name ?? '').split(',').length > 1 ? String(location.display_name).split(',')[0].trim() : null;
  return { city: city ? cleanLine(city.replace(/\s*\(.*\)\s*$/, ''), 80) || null : null, state };
}

/**
 * Salários da Adzuna chegam, em regra, como valor ANUAL. Um valor a partir deste limite é tratado como anual e
 * dividido por 12; abaixo dele (impossível para um ano de trabalho), como mensal. Valor "previsto" pela própria
 * Adzuna (salary_is_predicted = 1) não é informado pelo anunciante e é descartado.
 */
export const ADZUNA_ANNUAL_FROM = 12_000;

export function adzunaSalary(result) {
  const predicted = String(result?.salary_is_predicted ?? '0') === '1';
  const min = Number(result?.salary_min);
  const max = Number(result?.salary_max);
  const annual = Math.max(Number.isFinite(min) ? min : 0, Number.isFinite(max) ? max : 0) >= ADZUNA_ANNUAL_FROM;
  const per = (n) => (Number.isFinite(n) && n > 0 ? (annual ? Math.round(n / 12) : n) : null);
  return salaryFromFields({ min: per(min), max: per(max), period: 'MES', predicted });
}

/** Um resultado da API -> vaga crua (RawJob), ou null se faltar o essencial. */
export function toRawJob(result) {
  if (!result || result.id === undefined || result.id === null) return null;
  const { city, state } = parseAdzunaLocation(result.location);
  const sourceUrl = safeHttpUrl(result.redirect_url);
  const title = cleanLine(result.title, 200);
  if (!title || !sourceUrl) return null;
  return {
    externalId: String(result.id),
    title,
    company: cleanLine(result.company?.display_name, 120) || undefined,
    city: city || undefined,
    state: state || undefined,
    description: htmlToText(result.description, { maxLength: 8000 }),
    sourceUrl,
    postedAt: result.created,
    expiresAt: null, // a Adzuna não informa prazo: "prazo não informado pela fonte"
    salary: adzunaSalary(result),
    contactText: [],
  };
}

export class AdzunaAdapter {
  name = 'ADZUNA';

  constructor({ appId, appKey, country = 'br', resultsPerPage = 50, maxDaysOld = 30, queries = ADZUNA_QUERIES, fetchImpl = globalThis.fetch, sleep } = {}) {
    if (!appId || !appKey) throw new TypeError('Adzuna: ADZUNA_APP_ID e ADZUNA_APP_KEY são obrigatórios');
    this.appId = appId;
    this.appKey = appKey;
    this.country = country;
    this.resultsPerPage = resultsPerPage;
    this.maxDaysOld = maxDaysOld;
    this.queries = queries;
    this.fetch = fetchImpl;
    this.sleep = sleep;
  }

  url(query, page) {
    const params = new URLSearchParams({
      app_id: this.appId,
      app_key: this.appKey,
      results_per_page: String(this.resultsPerPage),
      what: query,
      max_days_old: String(this.maxDaysOld),
      sort_by: 'date',
    });
    return `${BASE}/${this.country}/search/${page}?${params}`;
  }

  /** Uma página de uma busca. Devolve as vagas cruas (sem repetir id) e quantos resultados vieram. */
  async fetchPage(query, page = 1) {
    const { text } = await getWithBackoff('Adzuna', this.url(query, page), { fetchImpl: this.fetch, sleep: this.sleep });
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new JobSourceError('Adzuna', 0, 'Adzuna: resposta que não é JSON');
    }
    const results = Array.isArray(data?.results) ? data.results : [];
    const jobs = [...new Map(results.map(toRawJob).filter(Boolean).map((job) => [job.externalId, job])).values()];
    return { jobs, received: results.length };
  }
}
