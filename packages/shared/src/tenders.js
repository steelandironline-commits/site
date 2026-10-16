/**
 * Licitações (public procurement): the situation shown to companies, from the
 * official status and the proposal window. Pure, shared by API and web.
 */
const DAY = 24 * 60 * 60 * 1000;

/** PNCP situacaoCompraId: 1 divulgada, 2 revogada, 3 anulada, 4 suspensa. */
const OFFICIAL = { 2: ['REVOKED', 'Revogada', 'neutral'], 3: ['ANNULLED', 'Anulada', 'neutral'], 4: ['SUSPENDED', 'Suspensa', 'amber'] };

/**
 * @returns {{ code: string, label: string, tone: string, detail: string|null, open: boolean }}
 */
export function tenderStatus(t, now = new Date()) {
  const official = OFFICIAL[Number(t?.situationId)];
  if (official) return { code: official[0], label: official[1], tone: official[2], detail: 'Situação oficial no PNCP.', open: false };
  const nowMs = new Date(now).getTime();
  const opens = t?.proposalOpensAt ? new Date(t.proposalOpensAt).getTime() : null;
  const closes = t?.proposalClosesAt ? new Date(t.proposalClosesAt).getTime() : null;

  if (closes != null && closes <= nowMs) return { code: 'CLOSED', label: 'Propostas encerradas', tone: 'neutral', detail: `Encerrou ${dateLabel(closes)}.`, open: false };
  if (t?.leftOpenListAt) return { code: 'UNLISTED', label: 'Fora da lista de abertas', tone: 'amber', detail: 'Saiu da lista oficial de propostas abertas antes do prazo. Confira no PNCP.', open: false };
  if (opens != null && opens > nowMs) return { code: 'SOON', label: 'Abre em breve', tone: 'info', detail: `Propostas a partir de ${dateLabel(opens)}.`, open: false };
  if (closes != null) {
    const left = closes - nowMs;
    if (left <= 3 * DAY) return { code: 'CLOSING', label: 'Prazo acabando', tone: 'amber', detail: `Encerra ${relativeLeft(left)} (${dateLabel(closes)}).`, open: true };
    return { code: 'OPEN', label: 'Recebendo propostas', tone: 'primary', detail: `Até ${dateLabel(closes)}.`, open: true };
  }
  return { code: 'OPEN', label: 'Recebendo propostas', tone: 'primary', detail: 'Sem data de encerramento informada.', open: true };
}

export const TENDER_STATUS_FILTERS = [
  ['open', 'Abertas'],
  ['closing', 'Prazo acabando'],
  ['soon', 'Abrem em breve'],
  ['all', 'Todas'],
];

function relativeLeft(ms) {
  const h = Math.round(ms / (60 * 60 * 1000));
  if (h < 1) return 'em menos de 1 hora';
  if (h < 24) return `em ${h} h`;
  const d = Math.round(ms / DAY);
  return d === 1 ? 'amanhã' : `em ${d} dias`;
}

function dateLabel(ms) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(ms));
}
