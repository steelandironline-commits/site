import { OPERATION_START, emptyOperationalProfile, modulesFor, onlyDigits } from '@autopix/shared';
import { OPS_COPY } from './operations/copy.js';

/*
 * Peças do cadastro que as duas áreas usam do mesmo jeito: a ordem das seções, a montagem da lista
 * de etapas (as da área, mais o perfil operacional e a revisão) e a conversão do formulário em
 * corpo de PUT. As etapas de cada área e o texto delas ficam na pasta da própria área.
 */

/** Seções do cadastro, na ordem (o_que_faz → fornece → compra → equipamentos → estrutura → onde → clientes → revisão). */
export const GROUP_ORDER = ['sobre', 'faz', 'fornece', 'compra', 'equipamentos', 'estrutura', 'onde', 'clientes', 'revisao'];
export const MODULE_ORDER = { mercado: 35 };
export const OP_FIELDS = ['operationalProfile'];

const rank = (group, within) => GROUP_ORDER.indexOf(group) * 1000 + within;

/**
 * Lista de etapas de um cadastro: as `base` da área, a pergunta de tipo de operação (só se a área
 * pede: `withOperationStart`), os módulos do perfil operacional que se aplicam (modulesFor) e a revisão.
 * `groupOf` diz a seção de cada etapa da área; `sortGroup` (opcional, na etapa) a manda para o fim de outra seção.
 */
export function buildSteps({ accountType, base, groupOf, withOperationStart, profile = emptyOperationalProfile() }) {
  const own = base.map((st, i) => ({
    ...st,
    group: groupOf[st.key],
    sort: st.key === 'start' ? -1 : rank(st.sortGroup || groupOf[st.key], st.sortGroup ? 900 : i * 10),
  }));
  const operation = withOperationStart
    ? [{ key: 'operacao', group: 'faz', title: OPERATION_START.title, subtitle: OPERATION_START.subtitle, module: OPERATION_START, fields: OP_FIELDS, sort: rank('faz', 0) }]
    : [];
  const modules = modulesFor(profile, accountType).map((m, i) => ({
    key: `op:${m.id}`,
    group: m.group,
    title: m.title,
    subtitle: m.subtitle,
    module: m,
    fields: OP_FIELDS,
    sort: rank(m.group, MODULE_ORDER[m.id] ?? 500 + i),
  }));
  const review = { key: 'review', group: 'revisao', title: OPS_COPY.reviewTitle, subtitle: OPS_COPY.reviewSubtitle, fields: OP_FIELDS, sort: rank('revisao', 900) };
  return [...own, ...operation, ...modules, review].sort((a, b) => a.sort - b.sort);
}

/** Formulário vazio do cadastro: os campos do perfil, que cada etapa preenche. */
export const emptyForm = () => ({
  name: '',
  cnpj: '',
  website: '',
  instagram: '',
  phone: '',
  city: '',
  state: '',
  postalCode: '',
  serviceLocations: [],
  serviceRadiusKm: 100,
  description: '',
  products: [],
  services: [],
  idealCustomer: '',
  averageTicket: '',
  minimumDeal: '',
  preferredIndustries: [],
  excludedIndustries: [],
  keywords: [],
});

/** O que cada etapa manda ao servidor (PUT /api/onboarding/step), a partir de `fields`. */
export function toPayload(form, fields) {
  const out = {};
  for (const f of fields) {
    let v = form[f];
    if (['averageTicket', 'minimumDeal', 'serviceRadiusKm'].includes(f)) v = v === '' || v === null ? null : Number(onlyDigits(String(v)) || 0);
    else if (typeof v === 'string') v = v.trim() === '' ? null : v.trim();
    if (f === 'name' && !v) continue;
    out[f] = v;
  }
  return out;
}
