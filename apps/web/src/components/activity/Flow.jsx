import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { formatNumber } from '@autopix/shared';
import s from './activity.module.css';

/** Map an activity event type to the stage index it reaches. */
const LANDING_STAGE = { SEARCH: 0, RESEARCH: 1, SIGNAL: 2, AGENT: 3, OPPORTUNITY: 4, SYSTEM: 0, PAYMENT: 0 };
const BUSINESS_STAGE = { SEARCH: 1, RESEARCH: 1, SIGNAL: 2, AGENT: 2, OPPORTUNITY: 3, SYSTEM: 0, PAYMENT: 0 };

function usePulses(latest, stageMap) {
  const [pulses, setPulses] = useState([]);
  const [lit, setLit] = useState(-1);
  const timers = useRef([]);
  useEffect(() => {
    if (!latest) return undefined;
    const to = stageMap[latest.type] ?? 0;
    const id = `${latest.id}-${Date.now()}`;
    setPulses((p) => [...p.slice(-4), { id, to }]);
    timers.current.push(
      setTimeout(() => setLit(to), 900),
      setTimeout(() => setPulses((p) => p.filter((x) => x.id !== id)), 1300),
      setTimeout(() => setLit((l) => (l === to ? -1 : l)), 2200),
    );
    return undefined;
  }, [latest, stageMap]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return { pulses, lit };
}

/**
 * FONTE → PESQUISA → SINAL → NOTA → OPORTUNIDADE.
 * When an event happens, a pulse travels through the stages it touched.
 */
export function PipelineFlow({ latest, stages = ['FONTE', 'PESQUISA', 'SINAL', 'NOTA', 'OPORTUNIDADE'], className }) {
  const { pulses, lit } = usePulses(latest, LANDING_STAGE);
  const reduce = useReducedMotion();
  const pct = (i) => (i / (stages.length - 1)) * 100;
  return (
    <div className={`${s.pipeline} ${className || ''}`} role="img" aria-label={`Fluxo: ${stages.join(', ')}`}>
      <div className={s.track}>
        <span className={s.trackLine} />
        <AnimatePresence>
          {!reduce &&
            pulses.map((p) => (
              <motion.span
                key={p.id}
                className={s.pulse}
                initial={{ left: '0%', opacity: 0 }}
                animate={{ left: `${pct(p.to)}%`, opacity: [0, 1, 1, 0.6] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: [0.45, 0, 0.2, 1] }}
              />
            ))}
        </AnimatePresence>
        {stages.map((st, i) => (
          <div key={st} className={`${s.stage} ${lit >= i ? s.stageLit : ''} ${lit === i ? s.stageHit : ''}`} style={{ left: `${pct(i)}%` }}>
            <span className={s.stageNode} />
            <span className={s.stageLabel}>{st}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * MARKET → SEARCH → SIGNALS → OPPORTUNITIES → SALES (dashboard, 2.5D).
 * Counters come from the API; pulses are driven by real activity events.
 */
export function BusinessFlow({ flow, latest, active }) {
  const { pulses, lit } = usePulses(latest, BUSINESS_STAGE);
  const reduce = useReducedMotion();
  const nodes = [
    { key: 'MARKET', label: 'Mercado', value: flow?.market, hint: 'empresas analisadas · 24h' },
    { key: 'SEARCH', label: 'Busca', value: flow?.search, hint: 'ciclos · 24h' },
    { key: 'SIGNALS', label: 'Sinais', value: flow?.signals, hint: 'detectados · 24h' },
    { key: 'OPPORTUNITIES', label: 'Oportunidades', value: flow?.opportunities, hint: 'criadas · 24h' },
    { key: 'SALES', label: 'Vendas', value: flow?.sales, hint: 'propostas + ganhas' },
  ];
  return (
    <section className={s.business} aria-label="Fluxo de execução autônoma">
      <div className={s.businessPlane}>
        <div className={s.businessTrack} aria-hidden="true">
          <span className={s.businessLine} />
          <AnimatePresence>
            {!reduce &&
              pulses.map((p) => (
                <motion.span
                  key={p.id}
                  className={s.businessPulse}
                  initial={{ left: '10%', opacity: 0 }}
                  animate={{ left: `${10 + p.to * 20}%`, opacity: [0, 1, 1, 0.5] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.9, ease: [0.45, 0, 0.2, 1] }}
                />
              ))}
          </AnimatePresence>
        </div>
        <ol className={s.businessNodes}>
          {nodes.map((n, i) => (
            <li key={n.key} className={`${s.bNode} ${lit === i ? s.bNodeHit : ''} ${active ? s.bNodeActive : ''}`} style={{ '--i': i }}>
              <span className={s.bKey}>{n.key}</span>
              <span className={`${s.bValue} num`}>{n.value == null ? '—' : formatNumber(n.value)}</span>
              <span className={s.bHint}>{n.hint}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
