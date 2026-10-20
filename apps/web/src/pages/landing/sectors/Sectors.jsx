/* Home sector sections: ecosystem, TemPix Marítimo and obras / máquinas.
   Visual first: flows, an opportunity card and a 2.5D site; text kept short. */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Building2,
  ClipboardList,
  Clock,
  Construction,
  Container,
  Factory,
  HardHat,
  Handshake,
  MapPin,
  Route,
  Scale,
  Ship,
  ShoppingCart,
  Store,
  Tag,
  Truck,
  Wrench,
} from 'lucide-react';
import { Button, Dialog, LogoMark } from '@autopix/ui';
import { useInView, useIsMobile, usePrefersReducedMotion } from '../../../lib/hooks.js';
import { CONSTRUCTION, ECOSYSTEM, MARITIME, SHARED } from './copy.js';
import PortArt from './PortArt.jsx';
import SiteArt from './SiteArt.jsx';
import s from './sectors.module.css';

const ease = [0.22, 1, 0.36, 1];
const reveal = { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-80px' }, transition: { duration: 0.6, ease } };

const ICONS = { factory: Factory, truck: Truck, route: Route, container: Container, ship: Ship, store: Store, cart: ShoppingCart, wrench: Wrench, hardhat: HardHat, crane: Construction, clipboard: ClipboardList, scale: Scale, handshake: Handshake, building: Building2 };
const Icon = ({ name, size = 18 }) => {
  if (name === 'tempix') return <LogoMark size={size + 4} />;
  const C = ICONS[name] || Store;
  return <C size={size} aria-hidden="true" />;
};

/** Steps one index at a time while visible (paused off-screen / reduced motion). */
function useCycle(count, ms, active) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % count), ms);
    return () => clearInterval(t);
  }, [count, ms, active]);
  return i;
}

/* ------------------------------------------------------------ flow */
export function FlowSteps({ steps, active = -1, compact = false, ariaLabel }) {
  return (
    <ol className={`${s.flow} ${compact ? s.flowCompact : ''}`} aria-label={ariaLabel}>
      {steps.map((st, i) => (
        <li key={st.title} className={`${s.flowStep} ${i === active ? s.flowOn : ''} ${i < active ? s.flowDone : ''}`}>
          <span className={s.flowDot}>{st.icon ? <Icon name={st.icon} size={16} /> : i + 1}</span>
          <span className={s.flowText}>
            <strong>{st.title}</strong>
            {st.sub && <small>{st.sub}</small>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ----------------------------------------------------- opportunity */
const ROW_ICONS = { Comprador: Building2, Navio: Ship, Necessidade: Wrench, Categoria: Tag, Equipamento: Construction, 'Serviço adicional': HardHat };
const FACTS = { Local: MapPin, Prazo: Clock };

/** Premium (gold) card: the need as a headline, place and deadline up front, details below. */
function OpportunityCard({ data, cta }) {
  const [open, setOpen] = useState(false);
  const facts = data.rows.filter(([k]) => FACTS[k]);
  const rows = data.rows.filter(([k]) => !FACTS[k]);
  return (
    <article className={`${s.opp} gold-icons`}>
      <header className={s.oppHead}>
        <span className={s.oppKicker}>{data.kicker}</span>
        <span className={s.oppStatus}>
          <span className={s.oppPulse} aria-hidden="true" />
          {data.status}
        </span>
      </header>
      <div className={s.oppLead}>
        <h3 className={s.oppTitle}>{data.title}</h3>
        <ul className={s.oppFacts}>
          {facts.map(([k, v]) => {
            const I = FACTS[k];
            return (
              <li key={k}>
                <I size={15} aria-hidden="true" />
                <span className="sr-only">{k}: </span>
                {v}
              </li>
            );
          })}
        </ul>
      </div>
      <dl className={s.oppRows}>
        {rows.map(([k, v]) => {
          const I = ROW_ICONS[k] || ClipboardList;
          return (
            <div key={k}>
              <dt>
                <I size={14} aria-hidden="true" />
                {k}
              </dt>
              <dd>{v}</dd>
            </div>
          );
        })}
      </dl>
      <footer className={s.oppFoot}>
        <span className={s.oppBadge}>
          <LogoMark size={18} /> {SHARED.intermediated}
        </span>
        <Button size="sm" className={s.oppCta} iconRight={ArrowRight} onClick={() => setOpen(true)}>
          {SHARED.seeOpportunity}
        </Button>
      </footer>
      <Dialog
        open={open}
        title={data.kicker}
        onClose={() => setOpen(false)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {SHARED.close}
            </Button>
            <Button to={cta.to} iconRight={ArrowRight}>
              {cta.label}
            </Button>
          </>
        }
      >
        <p className={s.dialogText}>{data.detail}</p>
        <p className={s.dialogNote}>{SHARED.example}</p>
      </Dialog>
    </article>
  );
}

/** A few chips at a time, gently rotating. */
function ChipCloud({ items, size = 8, running, label }) {
  const pages = Math.ceil(items.length / size);
  const page = useCycle(pages, 3400, running && pages > 1);
  const shown = items.slice(page * size, page * size + size);
  return (
    <div className={s.chipCloud} aria-label={label}>
      <AnimatePresence mode="popLayout" initial={false}>
        {shown.map((c, i) => (
          <motion.span key={c} className={s.chip} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }} exit={{ opacity: 0, y: -6 }}>
            {c}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------- ecosystem */
export function Ecosystem() {
  const ref = useRef(null);
  const inView = useInView(ref, { rootMargin: '0px' });
  const reduced = usePrefersReducedMotion();
  const active = useCycle(ECOSYSTEM.nodes.length, 1400, inView && !reduced);
  const n = ECOSYSTEM.nodes.length;
  return (
    <section id="setores" className={`${s.section} ${s.sectionAlt}`} aria-labelledby="eco-title" ref={ref}>
      <div className="container">
        <motion.header className={s.head} {...reveal}>
          <p className="eyebrow">{ECOSYSTEM.eyebrow}</p>
          <h2 id="eco-title">{ECOSYSTEM.title}</h2>
          <p>{ECOSYSTEM.body}</p>
        </motion.header>
        <motion.div className={s.eco} {...reveal}>
          <svg className={s.ecoLines} viewBox="-100 -60 200 120" preserveAspectRatio="none" aria-hidden="true">
            {ECOSYSTEM.nodes.map((node, i) => {
              const a = (i / n) * Math.PI * 2 - Math.PI / 2;
              return <line key={node.id} x1="0" y1="0" x2={Math.cos(a) * 82} y2={Math.sin(a) * 46} className={i === active ? s.lineOn : undefined} />;
            })}
          </svg>
          <div className={s.hub}>
            <LogoMark size={34} animated={!reduced} />
            <strong>{ECOSYSTEM.hub}</strong>
            <small>{ECOSYSTEM.hubSub}</small>
          </div>
          <ul className={s.nodes}>
            {ECOSYSTEM.nodes.map((node, i) => {
              const a = (i / n) * Math.PI * 2 - Math.PI / 2;
              return (
                <li key={node.id} className={`${s.node} ${i === active ? s.nodeOn : ''}`} style={{ '--x': `${50 + Math.cos(a) * 41}%`, '--y': `${50 + Math.sin(a) * 38}%` }}>
                  <Icon name={node.icon} size={16} />
                  <span>{node.label}</span>
                </li>
              );
            })}
          </ul>
        </motion.div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- maritime */
export function Maritime() {
  const ref = useRef(null);
  const inView = useInView(ref, { rootMargin: '0px' });
  const reduced = usePrefersReducedMotion();
  const step = useCycle(MARITIME.flow.length, 1700, inView && !reduced);
  const [dir, setDir] = useState('export');
  const chain = MARITIME.chains[dir];
  return (
    <section id="maritimo" className={s.section} aria-labelledby="mar-title" ref={ref}>
      <div className="container">
        <div className={s.split}>
          <motion.div className={s.copy} {...reveal}>
            <p className="eyebrow">{MARITIME.eyebrow}</p>
            <h2 id="mar-title" className={s.title}>
              {MARITIME.title}
            </h2>
            <p className={s.body}>{MARITIME.body}</p>
            <div className={s.ctas}>
              <Button to={MARITIME.cta.to} size="lg" iconRight={ArrowRight}>
                {MARITIME.cta.label}
              </Button>
              <Button to={MARITIME.ctaAlt.to} size="lg" variant="outline">
                {MARITIME.ctaAlt.label}
              </Button>
            </div>
            <ChipCloud items={MARITIME.services} running={inView && !reduced} label="Serviços para operações marítimas" />
            <p className={s.fine}>{MARITIME.positioning}</p>
          </motion.div>
          <motion.div className={s.visual} {...reveal} transition={{ ...reveal.transition, delay: 0.08 }}>
            <div className={s.port}>
              <PortArt step={reduced ? -1 : step} paused={!inView} />
              <FlowSteps steps={MARITIME.flow} active={reduced ? -1 : step} ariaLabel="Como uma demanda do navio vira contrato" />
            </div>
            <OpportunityCard data={MARITIME.opportunity} cta={MARITIME.cta} />
          </motion.div>
        </div>

        <motion.div className={s.chainBox} {...reveal}>
          <div className={s.chainHead}>
            <h3>{MARITIME.chainTitle}</h3>
            <div className={s.seg} role="tablist" aria-label="Sentido da operação">
              {Object.entries(MARITIME.chains).map(([k, c]) => (
                <button key={k} type="button" role="tab" aria-selected={dir === k} className={dir === k ? s.segOn : undefined} onClick={() => setDir(k)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <ol className={s.chain} key={dir}>
            {chain.steps.map((st, i) => (
              <motion.li key={st} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.08 } }}>
                <span className={s.chainIcon}>
                  <Icon name={{ Transportadora: 'truck', Terminal: 'container', Porto: 'building', Navio: 'ship', Destino: 'factory' }[st]} size={18} />
                </span>
                {st}
              </motion.li>
            ))}
          </ol>
          <p className={s.fine}>{MARITIME.chainNote}</p>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------------------------------------------- construction 2.5D */
function SiteStage() {
  const ref = useRef(null);
  const inView = useInView(ref, { rootMargin: '0px' });
  const mobile = useIsMobile();
  const reduced = usePrefersReducedMotion();
  return (
    <div ref={ref} className={s.stage} role="img" aria-label={CONSTRUCTION.sceneAlt}>
      <SiteArt mobile={mobile} paused={!inView} reduced={reduced} />
      <ul className={s.legend} aria-hidden="true">
        {CONSTRUCTION.legend.map((l) => (
          <li key={l.label}>
            <i style={{ background: l.color }} />
            {l.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ConstructionSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { rootMargin: '0px' });
  const reduced = usePrefersReducedMotion();
  const [side, setSide] = useState('buyer');
  const flow = CONSTRUCTION.flows[side];
  const step = useCycle(flow.steps.length, 1600, inView && !reduced);
  return (
    <section id="obras" className={`${s.section} ${s.sectionAlt}`} aria-labelledby="obra-title" ref={ref}>
      <div className="container">
        <motion.header className={s.head} {...reveal}>
          <p className="eyebrow">{CONSTRUCTION.eyebrow}</p>
          <h2 id="obra-title">{CONSTRUCTION.title}</h2>
          <p>{CONSTRUCTION.body}</p>
        </motion.header>
        <motion.div {...reveal}>
          <SiteStage />
        </motion.div>
        <div className={s.ctas}>
          <Button to={CONSTRUCTION.cta.to} size="lg" iconRight={ArrowRight}>
            {CONSTRUCTION.cta.label}
          </Button>
          <Button to={CONSTRUCTION.ctaAlt.to} size="lg" variant="outline">
            {CONSTRUCTION.ctaAlt.label}
          </Button>
          <Button to={CONSTRUCTION.ctaExtra.to} size="lg" variant="ghost">
            {CONSTRUCTION.ctaExtra.label}
          </Button>
        </div>
        <div className={s.split}>
          <motion.div className={s.flowBox} {...reveal}>
            <div className={s.chainHead}>
              <h3>{CONSTRUCTION.tagline}</h3>
              <div className={s.seg} role="tablist" aria-label="Ponto de vista">
                {Object.entries(CONSTRUCTION.flows).map(([k, f]) => (
                  <button key={k} type="button" role="tab" aria-selected={side === k} className={side === k ? s.segOn : undefined} onClick={() => setSide(k)}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <FlowSteps key={side} steps={flow.steps} active={reduced ? -1 : step} compact ariaLabel={`Fluxo de intermediação: ${flow.label}`} />
            <ChipCloud items={CONSTRUCTION.examples} size={4} running={inView && !reduced} label="Exemplos de oportunidades" />
          </motion.div>
          <motion.div {...reveal} transition={{ ...reveal.transition, delay: 0.08 }}>
            <OpportunityCard data={CONSTRUCTION.opportunity} cta={CONSTRUCTION.cta} />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
