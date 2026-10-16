import { describe, it, expect } from 'vitest';
import { PncpClient, toTender, brDate } from '../src/tenders/pncpClient.js';

const SAMPLE = {
  valorTotalEstimado: 71000.0,
  orgaoEntidade: { cnpj: '11173405000148', razaoSocial: 'CONSORCIO INTERMUNICIPAL SERRA CATARINENSE', esferaId: 'N' },
  objetoCompra: 'Aquisição de equipamentos didáticos de energia fotovoltaica',
  dataAberturaProposta: '2026-10-06T12:00:01',
  dataEncerramentoProposta: '2026-10-09T18:00:01',
  dataPublicacaoPncp: '2026-10-15T00:00:23',
  unidadeOrgao: { ufSigla: 'SC', municipioNome: 'Lages', codigoIbge: '4209300', nomeUnidade: 'CISAMA' },
  anoCompra: 2026,
  sequencialCompra: 43,
  numeroControlePNCP: '11173405000148-1-000043/2026',
  modalidadeId: 8,
  modalidadeNome: 'Dispensa',
  situacaoCompraId: 1,
  situacaoCompraNome: 'Divulgada no PNCP',
};

describe('PNCP', () => {
  it('maps a contratação to a licitação with Brasília times, value in cents and the public link', () => {
    const t = toTender(SAMPLE);
    expect(t).toMatchObject({ externalId: '11173405000148-1-000043/2026', city: 'Lages', state: 'SC', modality: 'Dispensa', situationId: 1, estimatedCents: 7100000n });
    expect(t.proposalClosesAt.toISOString()).toBe('2026-10-09T21:00:01.000Z');
    expect(t.url).toBe('https://pncp.gov.br/app/editais/11173405000148/2026/43');
    expect(brDate(null)).toBeNull();
  });

  it('asks the open-proposals endpoint and retries rate limits', async () => {
    const urls = [];
    let n = 0;
    const client = new PncpClient({
      now: () => new Date('2026-10-16T12:00:00Z'),
      sleep: async () => {},
      fetchImpl: async (url) => {
        urls.push(url);
        if (n++ === 0) return { ok: false, status: 429 };
        return { ok: true, status: 200, json: async () => ({ data: [SAMPLE], totalPaginas: 3, totalRegistros: 120 }) };
      },
    });
    const page = await client.openPage(2);
    expect(page).toMatchObject({ totalPages: 3, total: 120 });
    expect(urls).toHaveLength(2);
    expect(urls[1]).toMatch(/\/contratacoes\/proposta\?dataFinal=2028\d{4}&pagina=2&tamanhoPagina=50$/);
  });

  it('gives up after repeated server errors', async () => {
    const client = new PncpClient({ sleep: async () => {}, fetchImpl: async () => ({ ok: false, status: 503 }) });
    await expect(client.openPage(1)).rejects.toMatchObject({ status: 503 });
  });
});
