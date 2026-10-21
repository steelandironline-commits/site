// Quem vê qual vaga. Função pura, usada pela API e testada sem banco.
import { isJobArea, isTransversalJobArea } from './areas.js';
import { foldText } from './text.js';

/**
 * Profissões que transitam entre áreas (família logística): quem tem uma delas no perfil também vê as
 * vagas do mesmo cargo, mesmo quando a vaga foi classificada em outra área (ex.: "Motorista" de uma
 * construtora). `terms` são palavras inteiras, sem acento.
 */
export const TRANSVERSAL_CARGOS = Object.freeze(
  [
    { slug: 'motorista', name: 'Motorista', terms: ['motorista', 'motoristas', 'caminhoneiro', 'caminhoneira', 'carreteiro'] },
    { slug: 'auxiliar_logistica', name: 'Auxiliar de logística', terms: ['auxiliar de logistica', 'assistente de logistica', 'operador logistico', 'ajudante de logistica'] },
    { slug: 'almoxarife', name: 'Almoxarife', terms: ['almoxarife', 'almoxarifes', 'auxiliar de almoxarifado', 'assistente de almoxarifado'] },
    { slug: 'operador_empilhadeira', name: 'Operador de empilhadeira', terms: ['operador de empilhadeira', 'operadora de empilhadeira', 'operador de empilhadeiras', 'empilhadeirista'] },
    { slug: 'conferente', name: 'Conferente', terms: ['conferente', 'conferentes'] },
    { slug: 'estoquista', name: 'Estoquista', terms: ['estoquista', 'estoquistas', 'auxiliar de estoque'] },
  ].map((cargo) => Object.freeze({ ...cargo, terms: Object.freeze(cargo.terms) })),
);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const CARGO_PATTERNS = TRANSVERSAL_CARGOS.map((cargo) => ({
  slug: cargo.slug,
  pattern: new RegExp(`(?<![a-z0-9])(?:${cargo.terms.map((t) => escapeRe(t).replace(/ /g, '\\s+')).join('|')})(?![a-z0-9])`),
}));

/** Slug do cargo transversal que o texto cita (o primeiro, na ordem da lista), ou null. */
export function transversalCargo(text) {
  const folded = foldText(text);
  if (!folded) return null;
  return CARGO_PATTERNS.find(({ pattern }) => pattern.test(folded))?.slug ?? null;
}

/** Termos de busca (sem acento) de um cargo transversal, para o filtro de banco que antecede `canSeeJob`. */
export function transversalCargoTerms(slug) {
  return TRANSVERSAL_CARGOS.find((cargo) => cargo.slug === slug)?.terms ?? [];
}

/**
 * A pessoa vê a vaga se:
 *  (a) a área da vaga é a área de atuação (`workArea`) do perfil; ou
 *  (b) a vaga é de uma família transversal (logística), para qualquer pessoa, até sem área escolhida; ou
 *  (c) a pessoa escolheu uma área, o cargo que ela procura é transversal e a vaga é do mesmo cargo.
 * Sem `workArea`, só vale (b): a pessoa vê as vagas transversais e é avisada para escolher a área.
 *
 * @param {{ area?: string, title?: string }} job
 * @param {{ workArea?: string|null, jobTitle?: string|null }} [person]
 */
export function canSeeJob(job, person = {}) {
  if (!job || !isJobArea(job.area)) return false;
  if (isTransversalJobArea(job.area)) return true;
  const workArea = isJobArea(person?.workArea) ? person.workArea : null;
  if (!workArea) return false;
  if (job.area === workArea) return true;
  const mine = transversalCargo(person?.jobTitle);
  return mine !== null && transversalCargo(job.title) === mine;
}
