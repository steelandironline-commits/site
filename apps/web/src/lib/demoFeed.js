// Landing-page showcase feed. Runs ONLY in the browser on the marketing page,
// is never persisted and is always rendered with a visible DEMO label.
import { useEffect, useRef, useState } from 'react';

const SCRIPT = [
  { type: 'SEARCH', title: 'Analisando 24 empresas', source: 'Radar Agent' },
  { type: 'RESEARCH', title: 'Website encontrado', description: 'Indústria Porto Atlântico', source: 'Research Agent' },
  { type: 'RESEARCH', title: 'Perfil comercial identificado', description: 'Metalurgia · Joinville/SC', source: 'Research Agent' },
  { type: 'SEARCH', title: 'Nova fonte analisada', description: 'Diário regional de negócios', source: 'Radar Agent' },
  { type: 'SIGNAL', title: 'Possível demanda detectada', description: 'Cotação aberta para manutenção industrial', source: 'Signal Agent', severity: 'SUCCESS' },
  { type: 'SIGNAL', title: 'Expansão operacional identificada', description: 'Nova unidade fabril anunciada', source: 'Signal Agent', severity: 'SUCCESS' },
  { type: 'AGENT', title: 'Compatibilidade calculada: 91%', source: 'Scoring Agent' },
  { type: 'OPPORTUNITY', title: 'Oportunidade criada', description: 'Estimated deal: R$18.000', source: 'Sales Intelligence', severity: 'SUCCESS' },
  { type: 'OPPORTUNITY', title: 'Lead classificado como alta prioridade', source: 'Scoring Agent', severity: 'SUCCESS' },
  { type: 'RESEARCH', title: 'Contato comercial público identificado', description: 'comercial@ · site oficial', source: 'Research Agent' },
  { type: 'OPPORTUNITY', title: 'Abordagem comercial sugerida', source: 'Sales Intelligence' },
  { type: 'SEARCH', title: 'Analisando 17 empresas', source: 'Radar Agent' },
  { type: 'SIGNAL', title: 'Obra de ampliação detectada', description: 'Licença de instalação publicada', source: 'Signal Agent', severity: 'SUCCESS' },
  { type: 'AGENT', title: 'Compatibilidade calculada: 86%', source: 'Scoring Agent' },
  { type: 'OPPORTUNITY', title: 'Oportunidade criada', description: 'Estimated deal: R$32.000', source: 'Sales Intelligence', severity: 'SUCCESS' },
];

let n = 0;
function makeEvent(i) {
  n += 1;
  const item = SCRIPT[i % SCRIPT.length];
  return { id: `demo-${n}`, severity: 'INFO', isDemo: true, createdAt: new Date().toISOString(), ...item };
}

export function useDemoFeed({ enabled = true, interval = [1600, 2800], initial = 5 } = {}) {
  const [events, setEvents] = useState(() => Array.from({ length: initial }, (_, i) => makeEvent(initial - 1 - i)));
  const [latest, setLatest] = useState(null);
  const idx = useRef(initial);
  useEffect(() => {
    if (!enabled) return undefined;
    let t;
    const tick = () => {
      const e = makeEvent(idx.current);
      idx.current += 1;
      setEvents((prev) => [e, ...prev].slice(0, 14));
      setLatest(e);
      t = setTimeout(tick, interval[0] + Math.random() * (interval[1] - interval[0]));
    };
    t = setTimeout(tick, 1200);
    return () => clearTimeout(t);
  }, [enabled, interval]);
  return { events, latest };
}

/** Fictional radar nodes for the landing hero (labelled DEMO). */
export const DEMO_RADAR_NODES = [
  { id: 'a', value: 'R$8.000', name: 'Comercial Serra Clara', match: 78, signal: 'Cotação para manutenção preventiva', range: 'R$6.000 – R$11.000' },
  { id: 'b', value: 'R$14.500', name: 'Logística Horizonte Sul', match: 84, signal: 'Novo centro de distribuição', range: 'R$10.000 – R$19.000' },
  { id: 'c', value: 'R$32.000', name: 'Indústria Alpha', match: 92, signal: 'Ampliação operacional detectada', range: 'R$15.000 – R$35.000' },
  { id: 'd', value: 'R$65.000', name: 'Indústria Porto Atlântico', match: 94, signal: 'Nova expansão operacional', range: 'R$20.000 – R$60.000' },
  { id: 'e', value: 'R$5.800', name: 'Clínicas Vida Plena', match: 71, signal: 'Reforma de unidade', range: 'R$4.000 – R$7.500' },
  { id: 'f', value: 'R$22.000', name: 'Agro Cerrado Vivo', match: 88, signal: 'Implantação de nova linha', range: 'R$18.000 – R$26.000' },
  { id: 'g', value: 'R$11.200', name: 'Hotel Mar Sereno', match: 74, signal: 'Contratações para reabertura', range: 'R$8.000 – R$13.000' },
];
