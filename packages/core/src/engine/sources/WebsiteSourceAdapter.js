import { SourceAdapter } from './SourceAdapter.js';
import { safeFetchText, stripHtml } from './safeFetch.js';

// Only role-based business mailboxes are kept; personal addresses are ignored.
const ROLE_MAILBOXES = /^(contato|comercial|vendas|compras|suprimentos|atendimento|sac|faleconosco|fale-conosco|orcamento|orcamentos|negocios|info|financeiro|licitacoes|licitacao)$/i;

/** Researches a candidate by reading its public website. */
export class WebsiteSourceAdapter extends SourceAdapter {
  name = 'website';
  type = 'WEBSITE';

  constructor({ fetchImpl } = {}) {
    super();
    this.fetchImpl = fetchImpl;
  }

  get canResearch() {
    return true;
  }

  async research(candidate) {
    if (!candidate.website || candidate.isDemo) return null;
    const { text: html, url } = await safeFetchText(candidate.website, { fetchImpl: this.fetchImpl });
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
    const description =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ||
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i)?.[1] ||
      '';
    const text = stripHtml(html).slice(0, 8000);
    const host = new URL(url).hostname.replace(/^www\./, '');

    const emails = Array.from(new Set((html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((e) => e.toLowerCase())))
      .filter((e) => e.endsWith(host) || e.split('@')[1]?.endsWith(host.split('.').slice(-3).join('.')))
      .filter((e) => ROLE_MAILBOXES.test(e.split('@')[0]))
      .slice(0, 3);
    const phones = Array.from(new Set((html.match(/href=["']tel:([+\d\s()-]{8,20})["']/gi) || []).map((m) => m.replace(/^href=["']tel:|["']$/gi, '').trim()))).slice(0, 2);
    const cnpj = text.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/)?.[0]?.replace(/\D/g, '') || null;

    const contacts = [];
    if (emails.length || phones.length) {
      contacts.push({
        name: null,
        role: 'Contato comercial (site oficial)',
        businessEmail: emails[0] || null,
        companyPhone: phones[0] || null,
        publicSource: url,
        verified: false,
      });
    }

    return {
      title,
      description,
      text,
      cnpj,
      contacts,
      sources: [{ type: 'WEBSITE', title: title || host, url, snippet: description || text.slice(0, 240) }],
      facts: ['Website analisado'],
    };
  }
}
