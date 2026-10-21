// Feeds genéricos de vagas (JSON ou RSS/Atom), listados em JOB_FEEDS. O conteúdo vem de fora e nunca é confiável:
// o texto passa por htmlToText, o link só vale se for http(s) e o que faltar do essencial descarta a vaga.
import { createHash } from 'node:crypto';
import { cleanLine, extractSalary, htmlToText, safeHttpUrl } from '@autopix/shared';
import { JobSourceError, getWithBackoff } from './http.js';

const MAX_ITEMS = 500;

// ---------------------------------------------------------------- caminhos e campos

/** Valor em um caminho "a.b.c" de um objeto. */
const at = (obj, path) => path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);

/** Primeiro valor preenchido (texto, número ou objeto) entre vários caminhos possíveis. */
function pick(obj, paths) {
  for (const path of paths) {
    const value = at(obj, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

const text = (value) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') return text(value['#text'] ?? value.name ?? value.value ?? value.text);
  return '';
};

const PATHS = {
  id: ['id', 'guid', 'externalId', 'external_id', 'identifier.value', 'identifier', 'job_id', 'jobId', 'slug'],
  title: ['title', 'cargo', 'job_title', 'jobTitle', 'titulo', 'name', 'position'],
  company: ['company', 'company_name', 'companyName', 'empresa', 'employer', 'hiringOrganization.name', 'organization', 'company.name', 'company.display_name'],
  city: ['city', 'cidade', 'location.city', 'jobLocation.address.addressLocality', 'address.city', 'addressLocality'],
  state: ['state', 'uf', 'estado', 'location.state', 'jobLocation.address.addressRegion', 'address.state', 'addressRegion'],
  place: ['location', 'local', 'localizacao', 'localização'],
  description: ['description', 'descricao', 'descrição', 'content_html', 'content_text', 'content', 'summary', 'body', 'details'],
  url: ['url', 'link', 'apply_url', 'applyUrl', 'job_url', 'jobUrl', 'sourceUrl', 'source_url', 'external_url', 'canonical_url'],
  posted: ['datePosted', 'date_posted', 'postedAt', 'posted_at', 'published', 'publishedAt', 'published_at', 'date_published', 'pubDate', 'created', 'created_at', 'date', 'updated', 'data'],
  expires: ['validThrough', 'valid_through', 'expires', 'expiresAt', 'expires_at', 'expiration', 'expirationDate', 'deadline', 'closingDate', 'closing_date', 'dateExpires', 'prazo'],
  salaryMin: ['salaryMin', 'salary_min', 'minSalary', 'min_salary', 'salarioMin', 'salario_min', 'baseSalary.value.minValue', 'salary.min'],
  salaryMax: ['salaryMax', 'salary_max', 'maxSalary', 'max_salary', 'salarioMax', 'salario_max', 'baseSalary.value.maxValue', 'salary.max'],
  salary: ['salary', 'salario', 'salário', 'remuneracao', 'remuneração', 'baseSalary.value.value', 'baseSalary.value'],
  salaryPeriod: ['salaryPeriod', 'salary_period', 'baseSalary.value.unitText', 'baseSalary.unitText', 'salary.period', 'periodo'],
  contacts: ['whatsapp', 'phone', 'telefone', 'celular', 'email', 'e-mail', 'contact', 'contato', 'applyEmail', 'apply_email', 'contact_email', 'contactEmail', 'contact_phone', 'contactPhone', 'contact.email', 'contact.phone', 'contact.whatsapp'],
};

const PERIODS = { month: 'MES', mes: 'MES', mensal: 'MES', monthly: 'MES', hour: 'HORA', hora: 'HORA', hourly: 'HORA', horista: 'HORA', day: 'DIA', dia: 'DIA', daily: 'DIA', diaria: 'DIA' };

function periodOf(value) {
  const key = text(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return PERIODS[key] ?? undefined;
}

/** Salário em campos: o valor "salary" pode ser número, texto ("2.500") ou faixa em objeto. */
function salaryFields(item) {
  const salary = pick(item, PATHS.salary);
  let min = pick(item, PATHS.salaryMin);
  let max = pick(item, PATHS.salaryMax);
  // Texto livre ("R$ 4.500,00 por mês"): o leitor de salário entende o valor e o período.
  if (typeof salary === 'string' && min === undefined && max === undefined) {
    const parsed = extractSalary(salary);
    if (parsed) return parsed;
  }
  if (min === undefined && max === undefined && salary !== undefined && typeof salary !== 'object') min = salary;
  if (min === undefined && max === undefined) return null;
  return { min, max, period: periodOf(pick(item, PATHS.salaryPeriod)) };
}

/** Telefone e e-mail que a fonte entrega em campos, como textos para o leitor de contato. */
function contactTexts(item) {
  const out = [];
  for (const path of PATHS.contacts) {
    const value = at(item, path);
    const t = text(value);
    if (t) out.push(t);
  }
  return out;
}

const hash = (value) => createHash('sha1').update(String(value)).digest('hex').slice(0, 12);

/** Vaga crua (RawJob) a partir de um item já em objeto. `feedKey` separa os ids de feeds diferentes. */
export function itemToRawJob(item, feedKey) {
  if (!item || typeof item !== 'object') return null;
  const title = cleanLine(text(pick(item, PATHS.title)), 200);
  const sourceUrl = safeHttpUrl(text(pick(item, PATHS.url)));
  const company = cleanLine(text(pick(item, PATHS.company)), 120);
  let city = cleanLine(text(pick(item, PATHS.city)), 80);
  let state = cleanLine(text(pick(item, PATHS.state)), 2);
  const place = text(pick(item, PATHS.place));
  if (!city && place) {
    // "Joinville - SC", "Joinville, SC", "Joinville/SC"
    const m = /^(.*?)[\s,/-]+([A-Za-z]{2})$/.exec(place.trim());
    if (m) {
      city = cleanLine(m[1], 80);
      state ||= m[2];
    } else city = cleanLine(place, 80);
  }
  const rawId = text(pick(item, PATHS.id)) || sourceUrl || `${title}|${company}|${city}`;
  if (!title || !sourceUrl || !rawId) return null;
  return {
    externalId: `${feedKey}:${String(rawId).trim().slice(0, 150)}`,
    title,
    company: company || undefined,
    city: city || undefined,
    state: state || undefined,
    description: htmlToText(text(pick(item, PATHS.description)), { maxLength: 8000 }),
    sourceUrl,
    postedAt: text(pick(item, PATHS.posted)),
    expiresAt: text(pick(item, PATHS.expires)) || null,
    salary: salaryFields(item),
    contactText: contactTexts(item),
  };
}

// ---------------------------------------------------------------- JSON

function jsonItems(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const key of ['jobs', 'vagas', 'items', 'results', 'data', 'entries', 'listings', 'positions']) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

// ---------------------------------------------------------------- RSS e Atom (sem dependência, sem DTD)

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (w, b) => {
  if (b[0] === '#') {
    const code = b[1] === 'x' || b[1] === 'X' ? parseInt(b.slice(2), 16) : parseInt(b.slice(1), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
  }
  return Object.hasOwn(XML_ENTITIES, b) ? XML_ENTITIES[b] : w;
});

/** Conteúdo do primeiro <tag>...</tag> do bloco (CDATA incluso). O que está dentro é texto ou HTML escapado. */
function tag(block, name) {
  const re = new RegExp(`<${name.replace(':', '\\:')}(?:\\s[^>]*)?>([\\s\\S]*?)</${name.replace(':', '\\:')}\\s*>`, 'i');
  const m = re.exec(block);
  if (!m) return undefined;
  const inner = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(inner);
  return cdata ? cdata[1] : unxml(inner);
}

function atomLink(block) {
  const m = /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/i.exec(block);
  return m ? unxml(m[1]) : undefined;
}

/** Itens <item> (RSS) ou <entry> (Atom) como objetos. Campos extras comuns de feeds de vagas entram pelo nome da tag. */
export function xmlItems(xml) {
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)].map((m) => m[2]);
  return blocks.map((block) => {
    const get = (...names) => names.map((n) => tag(block, n)).find((v) => v !== undefined && v !== '');
    return {
      title: get('title'),
      link: get('link') ?? atomLink(block),
      id: get('guid', 'id'),
      description: get('content:encoded', 'description', 'summary', 'content'),
      pubDate: get('pubDate', 'published', 'updated', 'dc:date'),
      company: get('company', 'empresa', 'employer'),
      city: get('city', 'cidade'),
      state: get('state', 'uf', 'estado'),
      location: get('location', 'local'),
      salary: get('salary', 'salario', 'salário'),
      salaryMin: get('salaryMin', 'salary_min'),
      salaryMax: get('salaryMax', 'salary_max'),
      salaryPeriod: get('salaryPeriod', 'salary_period'),
      expires: get('validThrough', 'expires', 'expiresAt', 'deadline', 'prazo'),
      whatsapp: get('whatsapp'),
      phone: get('phone', 'telefone'),
      email: get('email', 'e-mail'),
    };
  });
}

/**
 * Itens de um feed já baixado. O formato vem do corpo, não do cabeçalho: JSON se começa com { ou [, XML se tem
 * <rss, <feed ou <item.
 */
export function parseFeed(body) {
  const trimmed = String(body ?? '').trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return jsonItems(JSON.parse(trimmed));
    } catch {
      throw new JobSourceError('Feed', 0, 'Feed: JSON inválido');
    }
  }
  if (/<(rss|feed|item|entry)\b/i.test(trimmed)) return xmlItems(trimmed);
  throw new JobSourceError('Feed', 0, 'Feed: formato não reconhecido (esperado JSON ou RSS)');
}

export class FeedAdapter {
  name = 'FEED';

  /** @param {{ feeds: { url: string, name?: string|null }[], fetchImpl?: Function, sleep?: Function }} opts */
  constructor({ feeds = [], fetchImpl = globalThis.fetch, sleep } = {}) {
    this.feeds = feeds;
    this.fetch = fetchImpl;
    this.sleep = sleep;
  }

  /** Vagas cruas de um feed, sem repetir id. Falha do feed vira JobSourceError (sem a URL na mensagem). */
  async fetchFeed(feed) {
    const { text: body } = await getWithBackoff('Feed', feed.url, { fetchImpl: this.fetch, sleep: this.sleep });
    const items = parseFeed(body).slice(0, MAX_ITEMS);
    const key = hash(feed.url);
    const jobs = items.map((item) => itemToRawJob(item, key)).filter(Boolean);
    return { jobs: [...new Map(jobs.map((job) => [job.externalId, job])).values()], received: items.length };
  }
}
