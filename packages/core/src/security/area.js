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

/**
 * O que o acesso diz a quem erra o documento ou a senha, por área (ARQUITETURA 12: mensagem de erro
 * de uma área não cita a outra). `required` é a resposta quando falta o documento e `failure` a de
 * documento ou senha incorretos (a mesma para conta que não existe e conta de outra área).
 *
 * - Modo legado: as frases de sempre, que citam CPF e CNPJ.
 * - CPF e admin (que entra com CPF): só o CPF.
 * - CNPJ: "documento", porque esse host aceita o CNPJ da empresa e o CPF do colaborador (Q1).
 */
export function loginMessages(hostArea, config) {
  if (!config?.areas?.enabled) return { required: 'Informe CPF ou CNPJ', failure: 'CPF/CNPJ ou senha incorretos.' };
  if (hostArea === 'CPF' || hostArea === 'ADMIN') return { required: 'Informe o CPF', failure: 'CPF ou senha incorretos.' };
  return { required: 'Informe o documento', failure: 'Documento ou senha incorretos.' };
}

/** O host aceita sessões/tokens desta área? No modo legado, sempre. */
export function hostAccepts(hostArea, area, config) {
  return acceptedAreas(hostArea, config).includes(area);
}
