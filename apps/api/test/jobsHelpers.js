import { buildJobRecord } from '@autopix/core';

/** "Agora" fixo dos testes de vagas. */
export const NOW = new Date('2026-10-21T15:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

let seq = 0;

/**
 * Linha de JobListing pronta para `jobs.upsertMany`, montada pelo mesmo caminho da sincronização (buildJobRecord).
 * `daysAgo` e `deadlineDays` são relativos a NOW; o resto sobrescreve a vaga crua.
 */
export function jobRow({ source = 'FEED', daysAgo = 1, deadlineDays = null, ...over } = {}) {
  seq += 1;
  return buildJobRecord(
    {
      externalId: `teste-${seq}`,
      title: 'Auxiliar de Serviços Gerais',
      company: 'Empresa Teste',
      city: 'Joinville',
      state: 'SC',
      description: 'Rotina de trabalho com horário comercial.',
      sourceUrl: `https://vagas.exemplo.example/${seq}`,
      postedAt: new Date(NOW.getTime() - daysAgo * DAY),
      expiresAt: deadlineDays === null ? null : new Date(NOW.getTime() + deadlineDays * DAY),
      ...over,
    },
    { source, now: NOW },
  );
}
