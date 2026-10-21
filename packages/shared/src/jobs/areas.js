// Áreas de atuação das vagas. Lista fixa: o perfil da pessoa guarda o `slug`, a vaga é classificada
// em um deles (classify.js) e a regra de visibilidade (visibility.js) compara os dois.

/**
 * `transversal`: a família de profissões que transita entre áreas. A vaga de uma área transversal
 * aparece para qualquer pessoa, seja qual for a área escolhida no perfil.
 */
export const JOB_AREAS = Object.freeze(
  [
    { slug: 'metalurgia', name: 'Metalurgia e solda' },
    { slug: 'eletrica', name: 'Elétrica' },
    { slug: 'mecanica', name: 'Mecânica' },
    { slug: 'construcao', name: 'Construção civil' },
    { slug: 'logistica', name: 'Logística e transporte', transversal: true },
    { slug: 'saude', name: 'Saúde' },
    { slug: 'alimentacao', name: 'Alimentação' },
    { slug: 'comercio', name: 'Comércio e vendas' },
    { slug: 'administrativo', name: 'Administrativo' },
    { slug: 'tecnologia', name: 'Tecnologia' },
    { slug: 'limpeza', name: 'Limpeza e conservação' },
    { slug: 'seguranca', name: 'Segurança' },
    { slug: 'agropecuaria', name: 'Agropecuária' },
    { slug: 'educacao', name: 'Educação' },
    { slug: 'servicos_gerais', name: 'Serviços gerais' },
    { slug: 'hospitalidade', name: 'Hospitalidade e turismo' },
  ].map((area) => Object.freeze({ transversal: false, ...area })),
);

export const JOB_AREA_SLUGS = Object.freeze(JOB_AREAS.map((area) => area.slug));

/** Área das vagas sem área clara. */
export const DEFAULT_JOB_AREA = 'servicos_gerais';

/** Áreas cujas vagas aparecem para todas as pessoas. */
export const TRANSVERSAL_JOB_AREAS = Object.freeze(JOB_AREAS.filter((area) => area.transversal).map((area) => area.slug));

const BY_SLUG = new Map(JOB_AREAS.map((area) => [area.slug, area]));

export const isJobArea = (slug) => typeof slug === 'string' && BY_SLUG.has(slug);

export const isTransversalJobArea = (slug) => BY_SLUG.get(slug)?.transversal === true;

/** Nome para exibir, ou `null` para um slug que não está na lista. */
export const jobAreaName = (slug) => BY_SLUG.get(slug)?.name ?? null;
