// Área de acesso de uma conta e áreas que um host aceita (ARQUITETURA, seções 6.2 e 6.3).
//
// "Área do host" (`hostArea`) é `req.area`: CNPJ, CPF, ADMIN ou nula (infraestrutura sem host de
// área, como /api/health). "Área do usuário" vem do dono da conta, nunca do host nem do documento.
import { AREAS, areaOf } from '@autopix/areas/areas';

/**
 * Área de um usuário: ADMIN quando é administrador da plataforma (a conta de admin é criada como
 * PERSON, então a regra do accountType a mandaria para o CPF); senão a área da empresa dona
 * (COMPANY -> CNPJ, PERSON -> CPF).
 *
 * Lança erro se faltar a empresa ou o accountType: devolver `null` viraria um "sem área" em
 * alguma comparação (falha aberta).
 */
export function areaOfUser(user) {
  if (!user) throw new TypeError('areaOfUser: usuário ausente');
  if (user.isPlatformAdmin) return 'ADMIN';
  return areaOf(user.company?.accountType);
}

/**
 * Áreas de sessão que o host `hostArea` aceita.
 *
 * - Modo legado (`config.areas.enabled` falso): todas, para não mudar nada.
 * - Modo de áreas: CNPJ aceita [CNPJ], e também ADMIN quando não há ADMIN_HOST (Q6: o admin vive
 *   no host CNPJ); CPF aceita [CPF]; ADMIN aceita [ADMIN]. Host sem área (ou desconhecido):
 *   nada (falha fechada).
 */
export function acceptedAreas(hostArea, config) {
  if (!config?.areas?.enabled) return [...AREAS];
  if (hostArea === 'CNPJ') return config.areas.hosts.ADMIN ? ['CNPJ'] : ['CNPJ', 'ADMIN'];
  if (hostArea === 'CPF') return ['CPF'];
  if (hostArea === 'ADMIN') return ['ADMIN'];
  return [];
}

/**
 * Tipo de conta que o cadastro de um host cria (Q8): CNPJ -> COMPANY, CPF -> PERSON. Host sem
 * cadastro (ADMIN, sem área) devolve null.
 */
export function accountTypeForHost(hostArea) {
  if (hostArea === 'CNPJ') return 'COMPANY';
  if (hostArea === 'CPF') return 'PERSON';
  return null;
}

/** O host aceita sessões/tokens desta área? No modo legado, sempre. */
export function hostAccepts(hostArea, area, config) {
  return acceptedAreas(hostArea, config).includes(area);
}
