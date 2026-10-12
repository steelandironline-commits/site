import { Handshake, HardHat, Truck, Wrench } from 'lucide-react';

/** Business moments that get their own colour in the live feed. */
export const KIND_STYLE = {
  contract: { color: '#3fdc8c', label: 'Contrato', Icon: Handshake },
  route: { color: '#4f9dff', label: 'Rota', Icon: Truck },
  service: { color: '#b69bff', label: 'Serviço', Icon: Wrench },
  works: { color: '#ffb35c', label: 'Obra', Icon: HardHat },
};

/** contract | route | service | works | null — explicit `kind` first, then the wording. */
export function eventKind(e) {
  if (!e) return null;
  if (e.kind && KIND_STYLE[e.kind]) return e.kind;
  const t = `${e.title || ''} ${e.description || ''}`;
  if (/\bcontrato\b/i.test(t)) return 'contract';
  if (/\brota\b|\bfrete\b|\bentrega\b/i.test(t)) return 'route';
  if (/\bservi[çc]o\b/i.test(t)) return 'service';
  if (/\bobra\b|constru/i.test(t)) return 'works';
  return null;
}
