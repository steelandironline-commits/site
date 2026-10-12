import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useMotionValueEvent, useScroll, useSpring, useTransform } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import { Button, DemoBadge } from '../../components/ui/ui.jsx';
import { usePrefersReducedMotion } from '../../lib/hooks.js';
import s from './logicFilm.module.css';

/*
 * "Como funciona" as a short film: eight pages, each a 2.5D isometric scene
 * that builds itself while the page scrolls, with film-style captions and a
 * cut to black between pages. Values are illustrative examples.
 *
 * 2.5D: the board is a plane tilted with rotateX/rotateZ (CSS variables
 * --rx/--rz driven by scroll + pointer). Cubes are built from three faces;
 * sprites counter-rotate by the same variables so they always face the
 * camera while standing on the board.
 */

const ProgressCtx = createContext(null);

/* ------------------------------------------------------- 2.5D primitives */

/** Anchors children at (x%, y%) of the board; grows them out of the floor at `at`. */
function Rise({ x, y, at = 0.1, children }) {
  const p = useContext(ProgressCtx);
  const g = useTransform(p, [at, at + 0.08], [0, 1], { clamp: true });
  const transform = useTransform(g, (v) => {
    const k = 0.001 + v * 0.999;
    return `translateZ(${(v - 1) * 30}px) scale3d(${k}, ${k}, ${k})`;
  });
  return (
    <motion.div className={s.anchor} style={{ left: `${x}%`, top: `${y}%`, transform }}>
      {children}
    </motion.div>
  );
}

/** Box standing on the board. w/d/h in board units (1u = 1% of the board). */
function Cube({ w, d, h, tone = 'base' }) {
  return (
    <div className={`${s.cube} ${s[`t-${tone}`]}`} style={{ '--w': w, '--d': d, '--h': h }}>
      <i className={s.faceTop} />
      <i className={s.faceFront} />
      <i className={s.faceRight} />
    </div>
  );
}

/** Flat card that always faces the camera, floating `z` units above its anchor. */
function Sprite({ z = 0, className = '', children }) {
  return (
    <div className={`${s.sprite} ${className}`} style={{ '--z': z }}>
      {children}
    </div>
  );
}

function Tag({ children, tone }) {
  return <span className={`${s.tag} ${tone ? s[`tag-${tone}`] : ''}`}>{children}</span>;
}

/** SVG lying flat on the board (0–100 coordinates); `draw` animates pathLength. */
function FlatPath({ d, from = 0.2, to = 0.5, tone = 'teal' }) {
  const p = useContext(ProgressCtx);
  const len = useTransform(p, [from, to], [0, 1], { clamp: true });
  return (
    <svg className={s.flat} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} className={s.ghostPath} />
      <motion.path d={d} className={`${s.path} ${s[`path-${tone}`]} `} style={{ pathLength: len }} />
    </svg>
  );
}

/** Anchor that travels along points [[x,y]...] between progress `from` and `to`. */
function Mover({ points, from, to, children }) {
  const p = useContext(ProgressCtx);
  const times = points.map((_, i) => from + ((to - from) * i) / (points.length - 1));
  const left = useTransform(p, times, points.map(([x]) => `${x}%`));
  const top = useTransform(p, times, points.map(([, y]) => `${y}%`));
  return (
    <motion.div className={s.anchor} style={{ left, top }}>
      {children}
    </motion.div>
  );
}

/* --------------------------------------------------------------- scenes */
function SceneEmpresa() {
  return (
    <>
      <Rise x={50} y={52} at={0.06}>
        <Cube w={26} d={20} h={16} tone="navy" />
        <Sprite z={22}>
          <Tag tone="strong">Sua empresa</Tag>
        </Sprite>
      </Rise>
      <Rise x={18} y={22} at={0.18}>
        <Sprite z={4}>
          <Tag>Usinagem</Tag>
        </Sprite>
      </Rise>
      <Rise x={82} y={24} at={0.26}>
        <Sprite z={4}>
          <Tag>Caldeiraria</Tag>
        </Sprite>
      </Rise>
      <Rise x={20} y={84} at={0.34}>
        <Sprite z={4}>
          <Tag>Joinville/SC · 200 km</Tag>
        </Sprite>
      </Rise>
      <Rise x={84} y={82} at={0.42}>
        <Sprite z={4}>
          <Tag>Ticket R$ 18 mil</Tag>
        </Sprite>
      </Rise>
      <div className={s.ringFlat} style={{ left: '50%', top: '52%', '--r': 44 }} aria-hidden="true" />
    </>
  );
}

function SceneAgentes() {
  const sources = [
    [18, 20, 'Sites', 0.12],
    [82, 18, 'Notícias', 0.2],
    [16, 82, 'Cadastros públicos', 0.28],
    [84, 84, 'Busca web', 0.36],
  ];
  const dots = [
    [38, 30], [62, 36], [30, 58], [70, 62], [48, 74], [58, 24], [26, 40], [74, 46],
  ];
  return (
    <>
      <div className={s.radar} aria-hidden="true">
        <i />
      </div>
      <Rise x={50} y={50} at={0.06}>
        <Cube w={10} d={10} h={10} tone="teal" />
        <Sprite z={14}>
          <Tag tone="strong">Agentes</Tag>
        </Sprite>
      </Rise>
      {sources.map(([x, y, label, at]) => (
        <Rise key={label} x={x} y={y} at={at}>
          <Cube w={10} d={8} h={5} />
          <Sprite z={8}>
            <Tag>{label}</Tag>
          </Sprite>
        </Rise>
      ))}
      {dots.map(([x, y], i) => (
        <Rise key={i} x={x} y={y} at={0.4 + i * 0.03}>
          <i className={s.dot} />
        </Rise>
      ))}
    </>
  );
}

function SceneSinais() {
  const flags = [
    [12, 50, 'Expansão', 0.1],
    [74, 24, 'Obra nova', 0.18],
    [26, 76, 'Contratação', 0.26],
    [78, 72, 'Cotação aberta', 0.34],
  ];
  return (
    <>
      {flags.map(([x, y, label, at]) => (
        <Rise key={label} x={x} y={y} at={at}>
          <i className={s.pin} />
          <Sprite z={6}>
            <Tag tone="amber">{label}</Tag>
          </Sprite>
        </Rise>
      ))}
      <FlatPath d="M22 30 L50 50 M74 24 L50 50 M26 76 L50 50 M78 72 L50 50" from={0.3} to={0.5} />
      <Rise x={50} y={50} at={0.46}>
        <Cube w={14} d={14} h={6} tone="navy" />
        <Sprite z={16} className={s.scoreCard}>
          <span className={s.scoreRing}>
            <b>94</b>
          </span>
          <span>
            <strong>Indústria Porto Atlântico</strong>
            <small>Expansão · Joinville/SC</small>
          </span>
        </Sprite>
      </Rise>
    </>
  );
}

function SceneDecide() {
  return (
    <>
      <Rise x={26} y={74} at={0.06}>
        <Sprite z={0} className={s.phone}>
          <span className={s.waHead}>AutoPix · WhatsApp</span>
          <span className={s.bubble}>
            Nova oportunidade
            <br />
            <small>Match 94% · Joinville</small>
          </span>
          <span className={s.quick}>
            <i>ANALISAR</i>
            <i className={s.quickOn}>ABORDAR</i>
            <i>DESCARTAR</i>
          </span>
        </Sprite>
      </Rise>
      <Rise x={78} y={28} at={0.2}>
        <Sprite z={0} className={s.panel}>
          <span className={s.panelHead}>Painel</span>
          <span className={s.panelRow}>
            Indústria Porto Atlântico <Tag tone="teal">Em contato</Tag>
          </span>
          <span className={s.panelRow}>
            Metalúrgica Vale Sul <Tag>Nova</Tag>
          </span>
        </Sprite>
      </Rise>
      <FlatPath d="M28 70 C 42 46, 60 40, 76 30" from={0.32} to={0.5} />
      <Rise x={52} y={46} at={0.44}>
        <Sprite z={10}>
          <Tag tone="strong">
            <Check size={11} /> Sincronizado
          </Tag>
        </Sprite>
      </Rise>
    </>
  );
}

function SceneCargas() {
  const route = [
    [14, 82],
    [34, 70],
    [52, 52],
    [70, 34],
    [86, 18],
  ];
  return (
    <>
      <FlatPath d="M14 82 C 30 74, 40 62, 52 52 S 74 30, 86 18" from={0.08} to={0.4} />
      <Rise x={14} y={82} at={0.06}>
        <i className={s.pin} />
        <Sprite z={6}>
          <Tag>Santos</Tag>
        </Sprite>
      </Rise>
      <Rise x={86} y={18} at={0.1}>
        <i className={`${s.pin} ${s.pinTeal}`} />
        <Sprite z={6}>
          <Tag>Campinas</Tag>
        </Sprite>
      </Rise>
      <Mover points={route} from={0.16} to={0.6}>
        <Cube w={8} d={4} h={4} tone="amber" />
        <Sprite z={9}>
          <Tag tone="strong">Frete R$ 4.800</Tag>
        </Sprite>
      </Mover>
      {[
        [18, 40, 'Soldador', 0.3],
        [46, 12, 'Eletricista', 0.36],
        [70, 82, 'Montador', 0.42],
      ].map(([x, y, label, at]) => (
        <Rise key={label} x={x} y={y} at={at}>
          <i className={s.person} />
          <Sprite z={6}>
            <Tag>{label}</Tag>
          </Sprite>
        </Rise>
      ))}
    </>
  );
}

/** Decorative QR-looking pattern (deterministic; not a payable code). */
const QR = Array.from({ length: 81 }, (_, i) => {
  const x = i % 9;
  const y = Math.floor(i / 9);
  const corner = (a, b) => a < 3 && b < 3 && !(a === 1 && b === 1);
  if (corner(x, y) || corner(8 - x, y) || corner(x, 8 - y)) return true;
  if ((x < 4 && y < 4) || (x > 4 && y < 4) || (x < 4 && y > 4)) return false;
  return ((Math.imul(i + 7, 2654435761) >>> 0) % 7) < 3;
});

function ScenePix() {
  return (
    <>
      <Rise x={36} y={56} at={0.06}>
        <Sprite z={0} className={s.qrCard}>
          <span className={s.qr} aria-hidden="true">
            {QR.map((on, i) => (
              <i key={i} className={on ? s.on : undefined} />
            ))}
          </span>
          <strong>R$ 1.400,00</strong>
          <small>Pix copia e cola</small>
        </Sprite>
      </Rise>
      <Rise x={70} y={34} at={0.26}>
        <Cube w={9} d={9} h={34} tone="navy" />
        <Sprite z={40}>
          <Tag tone="strong">Você · R$ 1.379</Tag>
        </Sprite>
      </Rise>
      <Rise x={84} y={52} at={0.34}>
        <Cube w={9} d={9} h={2} tone="teal" />
        <Sprite z={8}>
          <Tag>AutoPix · R$ 21 (1,5%)</Tag>
        </Sprite>
      </Rise>
    </>
  );
}

function SceneBanco() {
  return (
    <>
      <Rise x={24} y={30} at={0.06}>
        <Cube w={22} d={18} h={20} tone="base" />
        <Sprite z={26}>
          <Tag tone="strong">Parceiro financeiro</Tag>
        </Sprite>
      </Rise>
      <Rise x={76} y={72} at={0.14}>
        <Cube w={14} d={12} h={10} tone="navy" />
        <Sprite z={16}>
          <Tag>AutoPix</Tag>
        </Sprite>
      </Rise>
      <FlatPath d="M30 38 C 44 60, 58 58, 72 66" from={0.24} to={0.42} />
      <Rise x={52} y={56} at={0.44}>
        <Sprite z={12}>
          <Tag tone="ok">
            <Check size={11} /> Pix recebido · confirmado
          </Tag>
        </Sprite>
      </Rise>
      <Rise x={80} y={24} at={0.56}>
        <Sprite z={4}>
          <Tag>Liberação pede sua senha</Tag>
        </Sprite>
      </Rise>
    </>
  );
}

function ScenePainel() {
  const bars = [8, 14, 11, 20, 16, 26, 22, 32];
  return (
    <>
      {bars.map((h, i) => (
        <Rise key={i} x={20 + i * 8.5} y={70 - i * 3} at={0.06 + i * 0.04}>
          <Cube w={5} d={5} h={h} tone={i === bars.length - 1 ? 'teal' : 'navy'} />
        </Rise>
      ))}
      <Rise x={24} y={26} at={0.42}>
        <Sprite z={8} className={s.feed}>
          <span>
            <i className={s.liveDot} /> Atividade
          </span>
          <small>Busca concluída · 32 empresas</small>
          <small>Sinal: expansão · 94</small>
          <small>Pix recebido · R$ 1.400</small>
        </Sprite>
      </Rise>
    </>
  );
}

/* ------------------------------------------------------------ chapters */
const CHAPTERS = [
  {
    key: 'empresa',
    kicker: 'Sua empresa',
    title: 'Tudo começa pelo que você vende.',
    lines: ['Você conta o que oferece, quem quer atender e até onde vai.', 'Serviços, região, ticket médio e setores preferidos.', 'Esse perfil vira o mapa da busca.'],
    Scene: SceneEmpresa,
  },
  {
    key: 'agentes',
    kicker: 'Agentes',
    title: 'Os agentes saem procurando.',
    lines: ['Sites de empresas, notícias regionais e cadastros públicos.', 'Só informação pública de empresas. Nada de bases vazadas.', 'A busca roda o dia todo, enquanto você trabalha.'],
    Scene: SceneAgentes,
  },
  {
    key: 'sinais',
    kicker: 'Sinais',
    title: 'Um sinal vira oportunidade.',
    lines: ['Expansão, obra nova, contratação, cotação aberta.', 'Cada sinal ganha uma nota de 0 a 100, com o motivo.', 'Só o que combina com você chega ao painel.'],
    Scene: SceneSinais,
  },
  {
    key: 'decide',
    kicker: 'Decisão',
    title: 'Você decide em um toque.',
    lines: ['A oportunidade chega no painel e no WhatsApp.', 'ANALISAR, ABORDAR ou DESCARTAR, de onde estiver.', 'O que você decide no WhatsApp aparece no painel na hora.'],
    Scene: SceneDecide,
  },
  {
    key: 'cargas',
    kicker: 'Cargas e equipes',
    title: 'Também encontra frete e gente.',
    lines: ['Cargas compatíveis com a sua rota, inclusive de retorno.', 'Profissionais da região para a sua demanda.', 'Com o seu consentimento, a viagem é acompanhada por etapas.'],
    Scene: SceneCargas,
  },
  {
    key: 'pix',
    kicker: 'Cobrança',
    title: 'Negócio fechado, Pix gerado.',
    lines: ['O valor vem do negócio, calculado pelo sistema.', 'Comissão clara: 1,5%. R$ 1.400 viram R$ 1.379 para você.', 'O cliente paga pelo QR Code ou pelo copia e cola.'],
    Scene: ScenePix,
  },
  {
    key: 'banco',
    kicker: 'Confirmação',
    title: 'Quem confirma é o banco.',
    lines: ['O dinheiro fica na instituição financeira parceira.', 'O pagamento só aparece como pago quando o parceiro confirma.', 'Liberar ou reembolsar pede sua senha no app.'],
    Scene: SceneBanco,
  },
  {
    key: 'painel',
    kicker: 'Painel',
    title: 'Tudo registrado, em tempo real.',
    lines: ['Cada busca, sinal, decisão e pagamento fica no histórico.', 'Site, app e WhatsApp mostram a mesma informação.', 'Sua empresa trabalha. O AutoPix procura.'],
    Scene: ScenePainel,
    final: true,
  },
];

const LINE_AT = [0.14, 0.3, 0.46];

function Caption({ at, children }) {
  const p = useContext(ProgressCtx);
  const opacity = useTransform(p, [at, at + 0.06], [0, 1], { clamp: true });
  const y = useTransform(p, [at, at + 0.06], [10, 0], { clamp: true });
  return <motion.p style={{ opacity, y }}>{children}</motion.p>;
}

function Chapter({ index, ch, tilt, reduced, chapterRef }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  const still = useMotionValue(0.7);
  const p = reduced ? still : smooth;

  // Camera: slow orbit + dolly while the page scrolls, plus pointer/device tilt.
  const rzBase = useTransform(p, [0, 1], index % 2 ? [46, 30] : [30, 46]);
  const rxBase = useTransform(p, [0, 1], [60, 54]);
  const rz = useTransform([rzBase, tilt.y], ([a, b]) => `${a + b}deg`);
  const rx = useTransform([rxBase, tilt.x], ([a, b]) => `${a + b}deg`);
  const sc = useTransform(p, [0, 0.5, 1], ['0.9', '1', '1.05']);

  // Film cut: fade in from black, fade out to black (not on the last page).
  const cut = useTransform(p, ch.final ? [0, 0.06] : [0, 0.06, 0.92, 1], ch.final ? [1, 0] : [1, 0, 0, 1]);
  const titleOpacity = useTransform(p, [0.02, 0.09], [0, 1]);
  const titleY = useTransform(p, [0.02, 0.09], [16, 0]);

  const setRefs = (el) => {
    ref.current = el;
    chapterRef(el);
  };

  return (
    <section ref={setRefs} className={`${s.chapter} ${reduced ? s.still : ''}`} aria-labelledby={`film-${ch.key}`}>
      <ProgressCtx.Provider value={p}>
        <div className={s.sticky}>
          <div className={s.grain} aria-hidden="true" />
          <motion.header className={s.head} style={{ opacity: titleOpacity, y: titleY }}>
            <p className={s.label}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <i>/</i> {String(CHAPTERS.length).padStart(2, '0')} · {ch.kicker}
            </p>
            <h3 id={`film-${ch.key}`} className={s.title}>
              {ch.title}
            </h3>
          </motion.header>

          <div className={s.stage}>
            <motion.div className={s.board} style={{ '--rx': rx, '--rz': rz, '--s': sc }}>
              <div className={s.floor} aria-hidden="true" />
              <ch.Scene />
            </motion.div>
          </div>

          <div className={s.captions}>
            {ch.lines.map((line, i) => (
              <Caption key={line} at={LINE_AT[i]}>
                {line}
              </Caption>
            ))}
            {ch.final && (
              <Caption at={0.52}>
                <span className={s.ctas}>
                  <Button to="/onboarding" size="lg" iconRight={ArrowRight}>
                    ATIVAR AUTOPIX
                  </Button>
                  <Button href="#preco" size="lg" variant="outline">
                    VER PREÇO
                  </Button>
                </span>
              </Caption>
            )}
          </div>

          <motion.div className={s.cut} style={{ opacity: cut }} aria-hidden="true" />
        </div>
      </ProgressCtx.Provider>
    </section>
  );
}

/* ---------------------------------------------------------------- film */
export default function LogicFilm() {
  const reduced = usePrefersReducedMotion();
  const filmRef = useRef(null);
  const chapters = useRef([]);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: filmRef, offset: ['start start', 'end end'] });
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const i = Math.min(CHAPTERS.length - 1, Math.max(0, Math.floor(v * CHAPTERS.length)));
    setActive((cur) => (cur === i ? cur : i));
  });

  // Pointer (desktop) and device tilt (Android) nudge the camera.
  const tx = useMotionValue(0);
  const ty = useMotionValue(0);
  const tilt = { x: useSpring(tx, { stiffness: 90, damping: 18 }), y: useSpring(ty, { stiffness: 90, damping: 18 }) };

  useEffect(() => {
    if (reduced || !('DeviceOrientationEvent' in window)) return undefined;
    if (typeof window.DeviceOrientationEvent.requestPermission === 'function') return undefined; // iOS asks permission: skip
    const onTilt = (e) => {
      if (e.gamma == null || e.beta == null) return;
      ty.set(Math.max(-10, Math.min(10, e.gamma / 3)));
      tx.set(Math.max(-6, Math.min(6, (e.beta - 45) / 6)));
    };
    window.addEventListener('deviceorientation', onTilt);
    return () => window.removeEventListener('deviceorientation', onTilt);
  }, [reduced, tx, ty]);

  const onPointerMove = (e) => {
    if (reduced || e.pointerType !== 'mouse') return;
    ty.set((e.clientX / window.innerWidth - 0.5) * 14);
    tx.set((e.clientY / window.innerHeight - 0.5) * -8);
  };

  const goTo = (i) => {
    const el = chapters.current[i];
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const span = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + span * (reduced ? 0 : 0.55), behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <div ref={filmRef} id="como-funciona" className={s.film} onPointerMove={onPointerMove} aria-label="Como funciona — curta em oito páginas">
      <div className={s.railWrap}>
        <nav className={s.rail} aria-label="Páginas do curta">
          {CHAPTERS.map((ch, i) => (
            <button
              key={ch.key}
              type="button"
              className={`${s.railDot} ${i === active ? s.railOn : ''}`}
              aria-label={`Página ${i + 1}: ${ch.kicker}`}
              aria-current={i === active ? 'step' : undefined}
              onClick={() => goTo(i)}
            >
              <span className={s.railTip}>
                {String(i + 1).padStart(2, '0')} · {ch.kicker}
              </span>
            </button>
          ))}
        </nav>
        <DemoBadge label="EXEMPLO ILUSTRATIVO" className={s.badge} />
      </div>
      {CHAPTERS.map((ch, i) => (
        <Chapter key={ch.key} index={i} ch={ch} tilt={tilt} reduced={reduced} chapterRef={(el) => (chapters.current[i] = el)} />
      ))}
    </div>
  );
}

