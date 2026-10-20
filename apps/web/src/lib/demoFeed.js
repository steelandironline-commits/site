// Landing-page showcase feed (product preview). Runs ONLY in the browser on the
// marketing page and is never persisted or mixed with account data.
import { useEffect, useRef, useState } from 'react';

/** Marca de "fonte = módulo de pagamentos". O nome vem da cópia da área (quem chama passa `paySource`). */
const PAY_SOURCE = 'payment-module';

const SCRIPT = [
  { type: 'SEARCH', title: 'Analisando 24 empresas', source: 'Agente Radar' },
  { type: 'RESEARCH', title: 'Site encontrado', description: 'Indústria Porto Atlântico', source: 'Agente de Pesquisa' },
  { type: 'RESEARCH', title: 'Perfil comercial identificado', description: 'Metalurgia · Joinville/SC', source: 'Agente de Pesquisa' },
  { type: 'SEARCH', title: 'Nova fonte analisada', description: 'Diário regional de negócios', source: 'Agente Radar' },
  { type: 'PAYMENT', kind: 'contract', title: 'Contrato fechado', description: 'Construções · R$ 9.800,00', source: PAY_SOURCE, severity: 'SUCCESS' },
  { type: 'SIGNAL', title: 'Possível demanda detectada', description: 'Cotação aberta para manutenção industrial', source: 'Agente de Sinais', severity: 'SUCCESS' },
  { type: 'SYSTEM', kind: 'route', title: 'Rota concluída', description: 'Santos → Campinas · 212 km', source: 'Cargas', severity: 'SUCCESS' },
  { type: 'SIGNAL', title: 'Expansão operacional identificada', description: 'Nova unidade fabril anunciada', source: 'Agente de Sinais', severity: 'SUCCESS' },
  { type: 'AGENT', title: 'Compatibilidade calculada: 91%', source: 'Agente de Pontuação' },
  { type: 'OPPORTUNITY', title: 'Oportunidade criada', description: 'Negócio estimado: R$ 18.000', source: 'Inteligência Comercial', severity: 'SUCCESS' },
  { type: 'SYSTEM', kind: 'service', title: 'Serviço concluído', description: 'Eletricista · Joinville/SC', source: 'Equipes', severity: 'SUCCESS' },
  { type: 'OPPORTUNITY', title: 'Cliente classificado como alta prioridade', source: 'Agente de Pontuação', severity: 'SUCCESS' },
  { type: 'RESEARCH', title: 'Contato comercial público identificado', description: 'comercial@ · site oficial', source: 'Agente de Pesquisa' },
  { type: 'OPPORTUNITY', title: 'Abordagem comercial sugerida', source: 'Inteligência Comercial' },
  { type: 'SYSTEM', kind: 'works', title: 'Obra entregue', description: 'Reforma de galpão · etapa final confirmada', source: 'Obras', severity: 'SUCCESS' },
  { type: 'SEARCH', title: 'Analisando 17 empresas', source: 'Agente Radar' },
  { type: 'PAYMENT', kind: 'contract', title: 'Contrato assinado', description: 'Frete recorrente · R$ 4.800,00', source: PAY_SOURCE, severity: 'SUCCESS' },
  { type: 'SIGNAL', title: 'Obra de ampliação detectada', description: 'Licença de instalação publicada', source: 'Agente de Sinais', severity: 'SUCCESS' },
  { type: 'AGENT', title: 'Compatibilidade calculada: 86%', source: 'Agente de Pontuação' },
  { type: 'OPPORTUNITY', title: 'Oportunidade criada', description: 'Negócio estimado: R$ 32.000', source: 'Inteligência Comercial', severity: 'SUCCESS' },
];

let n = 0;
function makeEvent(i, paySource) {
  n += 1;
  const item = SCRIPT[i % SCRIPT.length];
  const source = item.source === PAY_SOURCE ? paySource : item.source;
  return { id: `demo-${n}`, severity: 'INFO', isDemo: true, createdAt: new Date().toISOString(), ...item, source };
}

const FEED_INTERVAL = [5200, 8000];

/** Calm pace: one new event every ~5–8 s, so each one can be read. */
export function useDemoFeed({ enabled = true, interval = FEED_INTERVAL, initial = 5, paySource } = {}) {
  const [minMs, maxMs] = interval;
  const [events, setEvents] = useState(() => Array.from({ length: initial }, (_, i) => makeEvent(initial - 1 - i, paySource)));
  const idx = useRef(initial);
  useEffect(() => {
    if (!enabled) return undefined;
    let t;
    const tick = () => {
      const e = makeEvent(idx.current, paySource);
      idx.current += 1;
      setEvents((prev) => [e, ...prev].slice(0, 14));
      t = setTimeout(tick, minMs + Math.random() * (maxMs - minMs));
    };
    t = setTimeout(tick, 2500);
    return () => clearTimeout(t);
    // Depend on the numbers, not the array: a new array each render restarted the timer.
  }, [enabled, minMs, maxMs, paySource]);
  return { events };
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
