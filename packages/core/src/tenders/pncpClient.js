import { logger } from '../logger.js';

const BASE = 'https://pncp.gov.br/api/consulta/v1';

/** PNCP dates come in Brasília local time without an offset. */
export function brDate(s) {
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${String(s).replace(/(\.\d{3})\d+$/, '$1')}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const ymd = (d) => new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');

/** "11173405000148-1-000043/2026" → https://pncp.gov.br/app/editais/11173405000148/2026/43 */
export function pncpUrl(item) {
  const cnpj = item?.orgaoEntidade?.cnpj;
  if (cnpj && item.anoCompra && item.sequencialCompra) return `https://pncp.gov.br/app/editais/${cnpj}/${item.anoCompra}/${item.sequencialCompra}`;
  return item?.linkSistemaOrigem || 'https://pncp.gov.br/app/editais';
}

/** One PNCP "contratação" → PublicTender columns. */
export function toTender(item) {
  const u = item.unidadeOrgao || {};
  const o = item.orgaoEntidade || {};
  const value = item.valorTotalEstimado ?? item.valorTotalHomologado;
  return {
    source: 'pncp',
    externalId: String(item.numeroControlePNCP),
    agencyName: String(o.razaoSocial || u.nomeUnidade || 'Órgão público').slice(0, 300),
    agencyCnpj: o.cnpj || null,
    sphere: o.esferaId || null,
    unitName: u.nomeUnidade ? String(u.nomeUnidade).slice(0, 300) : null,
    city: u.municipioNome || null,
    cityIbge: u.codigoIbge || null,
    state: u.ufSigla || null,
    object: String(item.objetoCompra || 'Objeto não informado').slice(0, 4000),
    modality: item.modalidadeNome || null,
    modalityId: item.modalidadeId ?? null,
    disputeMode: item.modoDisputaNome || null,
    situationId: item.situacaoCompraId ?? null,
    situationName: item.situacaoCompraNome || null,
    estimatedCents: value == null || Number.isNaN(Number(value)) ? null : BigInt(Math.round(Number(value) * 100)),
    proposalOpensAt: brDate(item.dataAberturaProposta),
    proposalClosesAt: brDate(item.dataEncerramentoProposta),
    publishedAt: brDate(item.dataPublicacaoPncp || item.dataInclusao),
    sourceUpdatedAt: brDate(item.dataAtualizacaoGlobal || item.dataAtualizacao),
    url: pncpUrl(item),
  };
}

/** Public PNCP consultation API (no key). Retries on rate limit / server errors. */
export class PncpClient {
  constructor({ fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => new Date() } = {}) {
    this.fetch = fetchImpl;
    this.sleep = sleep;
    this.now = now;
  }

  /** Notices whose proposal window is open, nationwide, one page (max 50 per page). */
  async openPage(page, { pageSize = 50, horizonDays = 730 } = {}) {
    const until = new Date(this.now().getTime() + horizonDays * 24 * 60 * 60 * 1000);
    const url = `${BASE}/contratacoes/proposta?dataFinal=${ymd(until)}&pagina=${page}&tamanhoPagina=${pageSize}`;
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await this.fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
      } catch (err) {
        res = { ok: false, status: 0, error: err.name };
      }
      if (res.status === 204) return { items: [], totalPages: 0, total: 0 };
      if (res.ok) {
        const data = await res.json();
        return { items: data.data || [], totalPages: data.totalPaginas || 0, total: data.totalRegistros || 0 };
      }
      const retryable = res.status === 0 || res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= 4) {
        logger.warn('pncp request failed', { page, status: res.status, error: res.error });
        throw Object.assign(new Error(`PNCP ${res.status || res.error}`), { status: res.status });
      }
      // Rate limited: honour Retry-After, else back off for longer (15 s, 30 s, 60 s, 120 s).
      const after = Number(res.headers?.get?.('retry-after'));
      await this.sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 300) * 1000 : (res.status === 429 ? 15_000 : 2000) * 2 ** attempt);
    }
  }
}
