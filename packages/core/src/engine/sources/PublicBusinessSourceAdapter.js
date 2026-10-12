import { SourceAdapter } from './SourceAdapter.js';

/**
 * Public company registry lookup (Receita Federal data via BrasilAPI).
 * Only registry data published for legal entities is used: legal name,
 * main activity (CNAE), city/state, registration status and business phone.
 */
export class PublicBusinessSourceAdapter extends SourceAdapter {
  name = 'public-business';
  type = 'PUBLIC_REGISTRY';

  constructor({ enabled = false, fetchImpl = globalThis.fetch } = {}) {
    super();
    this.enabled = enabled;
    this.fetch = fetchImpl;
  }

  isEnabled() {
    return this.enabled;
  }

  get canResearch() {
    return true;
  }

  async research(candidate) {
    if (!this.enabled || !candidate.cnpj || candidate.isDemo) return null;
    const url = `https://brasilapi.com.br/api/cnpj/v1/${candidate.cnpj}`;
    const res = await this.fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const d = await res.json();
    const phone = d.ddd_telefone_1 ? String(d.ddd_telefone_1).trim() : null;
    return {
      industry: d.cnae_fiscal_descricao || null,
      city: d.municipio || null,
      state: d.uf || null,
      description: d.razao_social ? `${d.razao_social} — ${d.descricao_situacao_cadastral || ''}`.trim() : null,
      contacts: phone
        ? [{ name: null, role: 'Telefone cadastral (Receita Federal)', companyPhone: phone, businessEmail: null, publicSource: url, verified: true }]
        : [],
      sources: [{ type: 'PUBLIC_REGISTRY', title: `Cadastro CNPJ ${candidate.cnpj}`, url, snippet: d.cnae_fiscal_descricao || '' }],
      facts: ['Cadastro público consultado'],
      active: d.descricao_situacao_cadastral ? /ativa/i.test(d.descricao_situacao_cadastral) : undefined,
    };
  }
}
