import { useRef } from 'react';
import { motion, useMotionValueEvent, useScroll, useSpring, useTransform } from 'framer-motion';
import { ArrowRight, HardHat, ShieldCheck, Truck, Wrench } from 'lucide-react';
import { Button, DemoBadge } from '../../components/ui/ui.jsx';
import { usePrefersReducedMotion } from '../../lib/hooks.js';
import s from './cinematic.module.css';

/*
 * Cinematic prologue: a scroll-driven, letterboxed sequence in three acts —
 * TRANSPORTE, PESSOAS, SERVIÇOS — that converge into one platform. Everything
 * here is illustrative (no real data) and labelled as such.
 */

const ACTS = [
  { key: 'transporte', n: 'I', label: 'Transporte', icon: Truck },
  { key: 'pessoas', n: 'II', label: 'Pessoas', icon: HardHat },
  { key: 'servicos', n: 'III', label: 'Serviços', icon: Wrench },
];

// Scroll windows (fractions of the sequence) for each scene.
// Act I is already on screen at the top of the page (no empty title card).
// The opening phrase is already fully visible at the top of the page.
const W = {
  intro: [-0.02, 0, 0.08, 0.13],
  transporte: [0.11, 0.16, 0.3, 0.36],
  pessoas: [0.34, 0.4, 0.54, 0.6],
  servicos: [0.58, 0.64, 0.76, 0.82],
  finale: [0.8, 0.88, 1, 1.01],
};
// Where each scene is fully visible — the scroll button jumps between these.
const STOPS = [0.23, 0.47, 0.7, 0.94];

const ROUTE = 'M70 300 C 170 290, 210 210, 300 200 S 450 150, 520 110 S 640 60, 700 56';

const PEOPLE = [
  { x: 120, y: 90, role: 'Eletricista' },
  { x: 270, y: 60, role: 'Soldador' },
  { x: 430, y: 100, role: 'Motorista' },
  { x: 590, y: 70, role: 'Montador' },
  { x: 170, y: 230, role: 'Pedreiro' },
  { x: 350, y: 260, role: 'Técnico' },
  { x: 520, y: 240, role: 'Ajudante' },
  { x: 660, y: 210, role: 'Operador' },
];
const LINKS = [
  [0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 6], [6, 7], [1, 5], [2, 6], [3, 7],
];

const ORDERS = [
  { t: 'Manutenção de caldeira', c: 'Joinville / SC', v: 'R$ 1.400', st: 'PIX RECEBIDO' },
  { t: 'Instalação elétrica industrial', c: 'Campinas / SP', v: 'R$ 3.200', st: 'EM EXECUÇÃO' },
  { t: 'Usinagem de peças', c: 'Santos / SP', v: 'R$ 2.750', st: 'COBRANÇA CRIADA' },
];

function useWindow(progress, w) {
  const opacity = useTransform(progress, w, [0, 1, 1, 0]);
  const y = useTransform(progress, w, [40, 0, 0, -40]);
  const scale = useTransform(progress, w, [1.06, 1, 1, 0.97]);
  return { opacity, y, scale };
}

function Letterbox({ progress }) {
  // Bars open slightly as the film starts and close on the finale.
  const h = useTransform(progress, [0, 0.84, 1], ['var(--cine-bar)', 'var(--cine-bar)', '0px']);
  return (
    <>
      <motion.div className={`${s.bar} ${s.barTop}`} style={{ height: h }} aria-hidden="true" />
      <motion.div className={`${s.bar} ${s.barBottom}`} style={{ height: h }} aria-hidden="true" />
    </>
  );
}

function ActRail({ progress }) {
  return (
    <ol className={s.rail} aria-hidden="true">
      {ACTS.map((a) => (
        <RailItem key={a.key} act={a} progress={progress} w={W[a.key]} />
      ))}
    </ol>
  );
}

function RailItem({ act, progress, w }) {
  const on = useTransform(progress, [w[0], w[1], w[2], w[3]], [0.35, 1, 1, 0.35]);
  const fill = useTransform(progress, [w[1], w[2]], ['0%', '100%']);
  return (
    <motion.li style={{ opacity: on }}>
      <span className={s.railTrack}>
        <motion.i style={{ width: fill }} />
      </span>
    </motion.li>
  );
}

/* ------------------------------------------------------------- scenes */
function Intro({ progress }) {
  const st = useWindow(progress, W.intro);
  return (
    <motion.div className={s.scene} style={st}>
      <h1 className={s.introTitle}>
        Tudo que move <br />
        <em>o seu negócio.</em>
      </h1>
      <p className={s.introSub}>Transporte · Pessoas · Serviços</p>
    </motion.div>
  );
}

function Transporte({ progress }) {
  const st = useWindow(progress, W.transporte);
  const draw = useTransform(progress, [0.13, 0.3], [0, 1]);
  const pathRef = useRef(null);
  const truckRef = useRef(null);
  const kmRef = useRef(null);
  useMotionValueEvent(draw, 'change', (v) => {
    const path = pathRef.current;
    if (!path || !truckRef.current) return;
    const len = path.getTotalLength();
    const p = path.getPointAtLength(Math.max(0, Math.min(1, v)) * len);
    truckRef.current.setAttribute('transform', `translate(${p.x} ${p.y})`);
    if (kmRef.current) kmRef.current.textContent = `${Math.round(v * 92)} km`;
  });
  return (
    <motion.div className={s.scene} style={st}>
      <div className={s.stage}>
        <svg viewBox="0 0 760 340" className={s.map} role="img" aria-label="Rota ilustrativa de Santos a Campinas">
          <defs>
            <linearGradient id="cine-route" x1="0" x2="1">
              <stop offset="0" stopColor="var(--primary)" stopOpacity="0.2" />
              <stop offset="1" stopColor="var(--primary)" />
            </linearGradient>
          </defs>
          {Array.from({ length: 9 }).map((_, i) => (
            <path key={i} d={`M0 ${40 + i * 34} Q 380 ${10 + i * 34} 760 ${50 + i * 34}`} className={s.contour} />
          ))}
          <path d={ROUTE} className={s.routeGhost} />
          <motion.path ref={pathRef} d={ROUTE} className={s.route} stroke="url(#cine-route)" style={{ pathLength: draw }} />
          <g transform="translate(70 300)">
            <circle r="7" className={s.pin} />
            <text x="14" y="5" className={s.pinLabel}>SANTOS</text>
          </g>
          <g transform="translate(700 56)">
            <circle r="7" className={s.pinEnd} />
            <circle r="16" className={s.pinPulse} />
            <text x="-14" y="-16" textAnchor="end" className={s.pinLabel}>CAMPINAS</text>
          </g>
          <g ref={truckRef} transform="translate(70 300)">
            <circle r="15" className={s.truckHalo} />
            <circle r="6" className={s.truck} />
          </g>
        </svg>
        <dl className={s.telemetry}>
          <div>
            <dt>Frete</dt>
            <dd>R$ 4.800</dd>
          </div>
          <div>
            <dt>Percorrido</dt>
            <dd ref={kmRef}>0 km</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd className={s.ok}>EM TRÂNSITO</dd>
          </div>
        </dl>
      </div>
    </motion.div>
  );
}

function Pessoas({ progress }) {
  const st = useWindow(progress, W.pessoas);
  const link = useTransform(progress, [0.38, 0.48], [0, 1]);
  return (
    <motion.div className={s.scene} style={st}>
      <div className={s.stage}>
        <svg viewBox="0 0 760 320" className={s.map} role="img" aria-label="Rede ilustrativa de profissionais">
          {LINKS.map(([a, b]) => (
            <motion.line
              key={`${a}-${b}`}
              x1={PEOPLE[a].x}
              y1={PEOPLE[a].y}
              x2={PEOPLE[b].x}
              y2={PEOPLE[b].y}
              className={s.link}
              style={{ pathLength: link }}
            />
          ))}
          {PEOPLE.map((p, i) => (
            <g key={p.role} transform={`translate(${p.x} ${p.y})`}>
              <circle r="22" className={s.personHalo} style={{ animationDelay: `${i * 0.35}s` }} />
              <circle r="9" className={i === 2 ? s.personHot : s.person} />
              <text y="40" textAnchor="middle" className={s.personLabel}>
                {p.role.toUpperCase()}
              </text>
            </g>
          ))}
        </svg>
        <dl className={s.telemetry}>
          <div>
            <dt>Disponíveis</dt>
            <dd>142</dd>
          </div>
          <div>
            <dt>Raio</dt>
            <dd>30 km</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd className={s.ok}>MATCH</dd>
          </div>
        </dl>
      </div>
    </motion.div>
  );
}

function Servicos({ progress }) {
  const st = useWindow(progress, W.servicos);
  return (
    <motion.div className={s.scene} style={st}>
      <div className={`${s.stage} ${s.orders}`}>
        {ORDERS.map((o, i) => (
          <OrderCard key={o.t} o={o} i={i} progress={progress} />
        ))}
      </div>
    </motion.div>
  );
}

function OrderCard({ o, i, progress }) {
  const start = 0.62 + i * 0.035;
  const opacity = useTransform(progress, [start, start + 0.04], [0, 1]);
  const x = useTransform(progress, [start, start + 0.05], [i % 2 ? 60 : -60, 0]);
  return (
    <motion.article className={s.order} style={{ opacity, x }}>
      <div>
        <h3>{o.t}</h3>
        <p>{o.c}</p>
      </div>
      <div className={s.orderRight}>
        <strong>{o.v}</strong>
        <span className={o.st === 'PIX RECEBIDO' ? s.badgeOk : s.badge}>{o.st}</span>
      </div>
    </motion.article>
  );
}

function Finale({ progress }) {
  const st = useWindow(progress, W.finale);
  const spread = useTransform(progress, [0.8, 0.9], [1, 0]);
  const tx = useTransform(spread, (v) => v * 140);
  const negTx = useTransform(tx, (v) => -v);
  const pointerEvents = useTransform(st.opacity, (v) => (v > 0.6 ? 'auto' : 'none'));
  return (
    <motion.div className={`${s.scene} ${s.finale}`} style={{ opacity: st.opacity, y: st.y, pointerEvents }}>
      <div className={s.converge} aria-hidden="true">
        <motion.span style={{ x: negTx }}>
          <Truck size={22} />
        </motion.span>
        <motion.span>
          <HardHat size={22} />
        </motion.span>
        <motion.span style={{ x: tx }}>
          <Wrench size={22} />
        </motion.span>
      </div>
      <h2 className={s.finaleTitle}>
        Transporte. Pessoas. Serviços.
        <br />
        <em>Uma plataforma.</em>
      </h2>
      <p className={s.finaleSub}>
        O AutoPix encontra a oportunidade, conecta quem executa e acompanha o pagamento — com o dinheiro sempre no parceiro financeiro.
      </p>
      <div className={s.finaleCtas}>
        <Button to="/onboarding" size="lg" iconRight={ArrowRight}>
          ATIVAR AUTOPIX
        </Button>
        <Button href="#hero" size="lg" variant="outline">
          CONTINUAR
        </Button>
      </div>
      <p className={s.finaleSafe}>
        <ShieldCheck size={14} aria-hidden="true" /> Pagamentos processados por instituições financeiras parceiras.
      </p>
    </motion.div>
  );
}

/* ----------------------------------------------- reduced-motion version */
function StaticPrologue() {
  return (
    <section className={s.static} aria-labelledby="cine-title">
      <div className="container">
        <p className={s.presents}>AUTOPIX APRESENTA</p>
        <h1 id="cine-title" className={s.introTitle}>
          Transporte. Pessoas. Serviços. <em>Uma plataforma.</em>
        </h1>
        <ul className={s.staticActs}>
          {ACTS.map(({ key, label, icon: Icon }) => (
            <li key={key}>
              <Icon size={20} aria-hidden="true" />
              <strong>{label}</strong>
            </li>
          ))}
        </ul>
        <div className={s.finaleCtas}>
          <Button to="/onboarding" size="lg" iconRight={ArrowRight}>
            ATIVAR AUTOPIX
          </Button>
          <Button href="#hero" size="lg" variant="outline">
            CONTINUAR
          </Button>
        </div>
      </div>
    </section>
  );
}

export default function Cinematic() {
  const reduced = usePrefersReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  const cueOpacity = useTransform(progress, [0.82, 0.88], [1, 0]);
  const cueEvents = useTransform(cueOpacity, (v) => (v > 0.4 ? 'auto' : 'none'));

  /** Scroll smoothly to the next act (or past the prologue on the last one). */
  const next = () => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const span = el.offsetHeight - window.innerHeight;
    const now = scrollYProgress.get();
    const stop = STOPS.find((x) => x > now + 0.02);
    const y = stop == null ? top + el.offsetHeight : top + stop * span;
    window.scrollTo({ top: y, behavior: 'smooth' });
  };

  if (reduced) return <StaticPrologue />;

  return (
    <section ref={ref} className={s.cine} aria-label="Prólogo: transporte, pessoas e serviços">
      <div className={s.sticky}>
        <div className={s.backdrop} aria-hidden="true" />
        <div className={s.grain} aria-hidden="true" />
        <div className={s.vignette} aria-hidden="true" />
        <Letterbox progress={progress} />

        <div className={s.hud}>
          <DemoBadge label="CENA ILUSTRATIVA" />
          <a href="#hero" className={s.skip}>
            Pular introdução
          </a>
        </div>
        <ActRail progress={progress} />

        <Intro progress={progress} />
        <Transporte progress={progress} />
        <Pessoas progress={progress} />
        <Servicos progress={progress} />
        <Finale progress={progress} />

        <motion.button type="button" className={s.scrollCue} style={{ opacity: cueOpacity, pointerEvents: cueEvents }} onClick={next} aria-label="Descer para a próxima cena">
          <span className={s.mouse} aria-hidden="true">
            <i className={s.wheel} />
          </span>
        </motion.button>
      </div>
    </section>
  );
}
