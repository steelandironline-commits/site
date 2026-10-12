import { formatRange, SIGNAL_TYPE_LABELS } from '@autopix/shared';

const HOOKS = {
  EXPANSION: 'Vi que vocês estão em fase de expansão operacional',
  CONSTRUCTION: 'Acompanhei que há uma obra/ampliação em andamento na sua unidade',
  PURCHASE: 'Soube que vocês estão homologando fornecedores',
  HIRING: 'Notei que a equipe de vocês está crescendo',
  NEW_PROJECT: 'Vi que vocês iniciaram um novo projeto',
  DEMAND: 'Entendi que vocês estão buscando um parceiro para esta demanda',
};

/** Generates commercial approach recommendations (deterministic templates). */
export class SalesIntelligenceService {
  buildApproach({ profile, candidate, signal, matchingServices = [], estimate, variant = 0 }) {
    const offer = matchingServices.length
      ? matchingServices.slice(0, 3).join(', ').toLowerCase()
      : [...(profile.services || []), ...(profile.products || [])].slice(0, 2).join(' e ').toLowerCase() || 'nossas soluções';
    const hook = HOOKS[signal?.type] || 'Estamos acompanhando o momento da empresa';
    const channel = Number(variant) % 2 === 0 ? 'WhatsApp comercial ou e-mail' : 'ligação para o comercial/compras';
    const place = candidate.city ? ` em ${candidate.city}` : '';

    return [
      `CONTEXTO\n${candidate.name}${candidate.industry ? ` (${candidate.industry})` : ''}${place}. Sinal: ${signal?.title || SIGNAL_TYPE_LABELS[signal?.type] || 'oportunidade identificada'}.`,
      `POR QUE AGORA\nEmpresas nesse momento costumam contratar ${offer} nas próximas semanas. Potencial estimado: ${formatRange(estimate?.min, estimate?.max)}.`,
      `MENSAGEM SUGERIDA\nOlá! Aqui é da ${profile.name}. ${hook}. Atendemos ${profile.idealCustomer ? profile.idealCustomer.toLowerCase() : 'empresas da região'} com ${offer}. Podemos enviar uma proposta rápida ou agendar 15 minutos para entender a demanda?`,
      `CANAL RECOMENDADO\n${channel}, endereçado ao setor de compras/suprimentos. Use apenas os contatos comerciais públicos listados.`,
      `PRÓXIMO PASSO\nRegistre o contato e mude o status para "Em contato". Faça follow-up em 3 dias úteis.`,
    ].join('\n\n');
  }
}
