// Do que a fonte entrega ("vaga crua") ao que o banco guarda. As regras (área, salário, contato, score) são as
// funções puras de @autopix/shared; aqui só se junta tudo, com limites de tamanho e sem confiar na fonte.
import {
  classifyJobArea,
  cleanLine,
  extractContacts,
  extractSalary,
  htmlToText,
  isOwnDomainEmail,
  safeHttpUrl,
  salaryFromFields,
  salaryLabel,
  scoreJob,
} from '@autopix/shared';

export const JOB_SOURCES = Object.freeze(['ADZUNA', 'FEED', 'DEMO']);

const BR_STATE = /^[A-Za-z]{2}$/;

/** Data válida ou null. Aceita Date, ISO, data de RSS e "21/10/2026" (dia/mês/ano, como no Brasil). */
const toDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const br = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T]+(\d{1,2}):(\d{2}))?/.exec(value);
    if (br) {
      const [, d, m, y, hh = '0', mm = '0'] = br;
      const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm)));
      return date.getUTCMonth() === Number(m) - 1 ? date : null;
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * @typedef {object} RawJob
 * @property {string} externalId id estável da vaga na fonte
 * @property {string} title
 * @property {string} [company]
 * @property {string} [city]
 * @property {string} [state] sigla (SC)
 * @property {string} [description] texto ou HTML
 * @property {string} sourceUrl
 * @property {Date|string} postedAt
 * @property {Date|string|null} [expiresAt] só se a fonte informa
 * @property {{ min?: number, max?: number, period?: string, predicted?: boolean }|null} [salary] campo da fonte
 * @property {string[]} [contactText] telefone, e-mail ou texto de contato que a fonte entrega em campos
 */

/**
 * Linha de JobListing a partir de uma vaga crua, ou `null` se ela não serve (sem título, sem link http(s)
 * ou sem data de publicação: nunca se inventa data nem link). `now` só serve para limitar datas no futuro.
 * @param {RawJob} raw
 * @param {{ source: string, now?: Date }} ctx
 */
export function buildJobRecord(raw, { source, now = new Date() }) {
  if (!JOB_SOURCES.includes(source)) throw new TypeError(`fonte de vaga desconhecida: ${String(source)}`);
  const externalId = String(raw?.externalId ?? '').trim().slice(0, 200);
  const title = cleanLine(raw?.title, 200);
  const sourceUrl = safeHttpUrl(raw?.sourceUrl);
  const postedAtRaw = toDate(raw?.postedAt);
  if (!externalId || !title || !sourceUrl || !postedAtRaw) return null;
  // Relógio adiantado da fonte: a vaga não foi publicada no futuro.
  const postedAt = postedAtRaw.getTime() > now.getTime() ? now : postedAtRaw;

  const company = cleanLine(raw.company, 120) || null;
  const city = cleanLine(raw.city, 80) || null;
  const stateText = cleanLine(raw.state, 2).toUpperCase();
  const state = BR_STATE.test(stateText) ? stateText : null;
  const description = htmlToText(raw.description, { maxLength: 8000 });
  const expiresAt = toDate(raw.expiresAt);

  const area = classifyJobArea(title, description);
  const salary = (raw.salary && salaryFromFields(raw.salary)) || extractSalary(`${title}\n${description}`);
  const contact = extractContacts([...(Array.isArray(raw.contactText) ? raw.contactText.map((t) => String(t ?? '')) : []), description]);
  const contactEmail = contact.email && contact.email.length <= 254 ? contact.email : null;
  const score = scoreJob({
    title,
    company,
    description,
    salaryMin: salary?.min ?? null,
    salaryMax: salary?.max ?? null,
    contactWhatsapp: contact.whatsapp,
    contactEmail,
    contactEmailOwnDomain: contactEmail ? isOwnDomainEmail(contactEmail) : false,
  });

  return {
    source,
    externalId,
    title,
    company,
    city,
    state,
    area,
    salaryMin: salary?.min ?? null,
    salaryMax: salary?.max ?? null,
    salaryPeriod: salary?.period ?? null,
    salaryText: salary ? salaryLabel(salary).replace(/^Salário:\s*/, '') : null,
    description,
    contactWhatsapp: contact.whatsapp,
    contactEmail,
    sourceUrl,
    postedAt,
    expiresAt,
    scoreLevel: score.level,
    scoreValue: score.value,
    scoreReasons: score.reasons,
  };
}
