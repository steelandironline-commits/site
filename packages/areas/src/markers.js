// SOMENTE TESTES E BUILD. Este arquivo cita as duas áreas e nunca vai para o navegador
// (o plugin `areaBoundary` derruba o build se ele entrar num bundle).
//
// Marcadores do isolamento de bundle (ARQUITETURA 5, "Teste que prova"). Cada texto é escrito
// literalmente, nunca como palavra solta: "CPF" pode aparecer no CNPJ (o colaborador entra com CPF, Q1)
// e "temcnpj" pode aparecer no CPF (está no próprio host). A lista é uma só: o teste de bundle
// (apps/web/test) e a suíte de isolamento (apps/api/test/isolation) leem esta mesma.

export const BUNDLE_MARKERS = Object.freeze({
  // O CPF não pode ter nada de empresa, de licitação, de equipe, de pagamento nem de cobrança.
  cpf: Object.freeze(['Tem CNPJ', 'CNPJ', 'Licitações', 'Colaborador', '/app/licitacoes', '/api/team', '/api/company', '/api/pay', '/checkout']),
  // O CNPJ não pode ter nada da área de pessoas.
  cnpj: Object.freeze(['Tem CPF', 'pessoa física', 'Meu perfil', '/api/profile']),
  // Nenhuma das duas serve o admin da plataforma (terceira área).
  both: Object.freeze(['/api/admin', 'Admin financeiro']),
});

/** Marcadores proibidos no que a área serve ao navegador: os da área mais os que valem para as duas. */
export function markersFor(area) {
  const key = String(area).toLowerCase();
  if (key !== 'cnpj' && key !== 'cpf') throw new TypeError(`área sem marcadores: ${String(area)}`);
  return [...BUNDLE_MARKERS[key], ...BUNDLE_MARKERS.both];
}
