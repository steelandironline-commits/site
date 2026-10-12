import { fold, SIGNAL_TYPE_LABELS } from '@autopix/shared';

// Folded (lowercase, accent-free) phrase rules per signal type.
export const SIGNAL_RULES = {
  EXPANSION: {
    weight: 0.85,
    terms: ['expansao', 'amplia', 'nova unidade', 'nova fabrica', 'nova filial', 'inaugur', 'aumento de capacidade', 'crescimento'],
    title: 'Expansão operacional identificada',
  },
  CONSTRUCTION: {
    weight: 0.8,
    terms: ['obra', 'construcao', 'constroi', 'reforma', 'galpao', 'terraplanagem', 'licenca de instalacao'],
    title: 'Obra ou reforma em andamento',
  },
  PURCHASE: {
    weight: 0.9,
    terms: ['licitac', 'cotacao', 'compra de', 'aquisicao', 'pregao', 'edital', 'homologacao de', 'fornecedores'],
    title: 'Processo de compra detectado',
  },
  HIRING: {
    weight: 0.55,
    terms: ['contratando', 'contrata ', 'vagas', 'processo seletivo', 'contratacao'],
    title: 'Contratações em andamento',
  },
  NEW_PROJECT: {
    weight: 0.75,
    terms: ['novo projeto', 'lancamento', 'implantacao', 'investimento', 'investe', 'modernizacao', 'automacao'],
    title: 'Novo projeto identificado',
  },
  DEMAND: {
    weight: 0.8,
    terms: ['precisa de', 'busca fornecedor', 'procura fornecedor', 'manutencao', 'terceirizacao', 'demanda'],
    title: 'Possível demanda detectada',
  },
};

function sentenceAround(text, index) {
  const start = Math.max(0, text.lastIndexOf('.', index) + 1);
  const endDot = text.indexOf('.', index);
  const end = endDot === -1 ? Math.min(text.length, index + 200) : endDot + 1;
  return text.slice(start, end).trim().slice(0, 280);
}

/** Detects commercial signals from candidate + research text (deterministic). */
export class SignalDetectionService {
  detect({ candidate, research }) {
    const raw = `${candidate.text || ''}\n${research?.text || ''}\n${research?.description || ''}`;
    const text = fold(raw);
    const signals = [];
    for (const [type, rule] of Object.entries(SIGNAL_RULES)) {
      const hits = [];
      for (const term of rule.terms) {
        const idx = text.indexOf(term);
        if (idx !== -1) hits.push({ term, idx });
      }
      if (!hits.length) continue;
      const strength = Math.min(1, rule.weight + (hits.length - 1) * 0.05);
      signals.push({
        type,
        label: SIGNAL_TYPE_LABELS[type],
        title: rule.title,
        description: sentenceAround(raw, hits[0].idx),
        strength: Number(strength.toFixed(2)),
        matchedTerms: hits.map((h) => h.term),
        sourceUrl: candidate.source?.url || null,
      });
    }
    return signals.sort((a, b) => b.strength - a.strength);
  }
}
