// O que a pessoa informa em "Meu perfil" para receber vagas: área de atuação, cargo procurado e o contato
// preferido. Fica dentro do perfil operacional já existente (JSON), na chave `jobSearch`: sem migração.
import { z } from 'zod';
import { JOB_AREA_SLUGS, isJobArea } from './areas.js';

export const CONTACT_PREFERENCES = Object.freeze(['WHATSAPP', 'EMAIL']);
export const JOB_TITLE_MAX = 80;

const blankToNull = (value) => (typeof value === 'string' && value.trim() === '' ? null : value);

/** Campos aceitos no PUT /api/profile (todos opcionais; `null` ou texto vazio apaga o campo). */
export const jobSearchFields = Object.freeze({
  workArea: z.preprocess(blankToNull, z.enum(JOB_AREA_SLUGS, { errorMap: () => ({ message: 'Escolha uma área da lista' }) }).nullable()),
  jobTitle: z.preprocess(blankToNull, z.string().trim().max(JOB_TITLE_MAX, `Use até ${JOB_TITLE_MAX} caracteres`).nullable()),
  contactPreference: z.preprocess(blankToNull, z.enum(CONTACT_PREFERENCES, { errorMap: () => ({ message: 'Escolha WhatsApp ou e-mail' }) }).nullable()),
});

export const jobSearchSchema = z.object(jobSearchFields).partial();

/**
 * Lê `jobSearch` de um perfil operacional guardado (qualquer coisa que esteja lá), devolvendo sempre os três
 * campos, com `null` no que for ausente ou inválido.
 * @returns {{ workArea: string|null, jobTitle: string|null, contactPreference: 'WHATSAPP'|'EMAIL'|null }}
 */
export function readJobSearch(operationalProfile) {
  const raw = operationalProfile && typeof operationalProfile === 'object' ? operationalProfile.jobSearch : null;
  const source = raw && typeof raw === 'object' ? raw : {};
  const title = typeof source.jobTitle === 'string' ? source.jobTitle.trim().slice(0, JOB_TITLE_MAX) : '';
  return {
    workArea: isJobArea(source.workArea) ? source.workArea : null,
    jobTitle: title || null,
    contactPreference: CONTACT_PREFERENCES.includes(source.contactPreference) ? source.contactPreference : null,
  };
}
