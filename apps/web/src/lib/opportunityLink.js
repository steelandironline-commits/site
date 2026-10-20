// Oportunidades são da área de empresas: só as entradas dela (e a do build legado) importam este arquivo.

/** Página da oportunidade a que um evento da atividade se refere, ou nada. */
export const opportunityLink = (event) => (event.opportunityId ? `/app/opportunities/${event.opportunityId}` : null);
