const MIN = 60_000;
const MAX_DELAY_MS = 6 * 60 * MIN;

/**
 * Quanto esperar até a próxima sincronização de vagas. Sem erro: o intervalo normal. Com erro: recua em
 * dobro a cada falha seguida (429 da fonte começa em 15 min; outros erros em 5 min), até 6 horas.
 * @param {{ error?: string, status?: number }|null} result resultado de `JobService.sync`
 * @param {{ syncMinutes: number, failures?: number }} opts `failures`: falhas seguidas ANTES desta
 */
export function nextJobSyncDelayMs(result, { syncMinutes, failures = 0 }) {
  const normal = syncMinutes * MIN;
  if (!result?.error) return normal;
  const start = result.status === 429 ? 15 * MIN : 5 * MIN;
  return Math.min(Math.max(start * 2 ** Math.min(failures, 10), normal), MAX_DELAY_MS);
}
