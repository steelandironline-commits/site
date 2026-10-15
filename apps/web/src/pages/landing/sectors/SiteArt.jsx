/* Obra de montagem de galpão em 2.5D: o munck chega pela via, abre as
   sapatas, ergue e estende a lança, iça a terceira tesoura do chão e a
   assenta nos pilares, enquanto o soldador trabalha, a britadeira quebra o
   piso na área isolada e a escavadeira abre a vala ao fundo. SVG puro, sem
   WebGL. Nada atravessa nada: a tesoura viaja acima das vigas (y 6) e só
   desce sobre o eixo dos pilares; o gancho fica sempre abaixo da ponta da
   lança; a caçamba nunca desce abaixo do chão. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box, Disc, Flat, Line, Person, Shadow, Truss, axo, fmt, headY, pts, shade, tr, trussMembers } from './iso.jsx';
import s from './sectors.module.css';

const U = 24;
const OX = 6.4 * U + 14;
const { P, D } = axo(U, OX, 5.0 * U + 14);
const VIEW = { w: Math.round(32.3 * U + 28), h: Math.round(19.9 * U + 28) };
// Phones: munck, truss and frame; the excavator corner stays out.
const VIEW_M = { x: Math.round(OX - 6), w: Math.round(24.6 * U) };

const STEEL = '#5d6f86';
const STEEL_DARK = '#44546a';
const TRUSS = '#8aa1c2';
const SAFETY = '#f28c28';
const YELLOW = '#f2b134';

/* ---------------------------------------------------------- timeline */
const T = 15;
const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const seg = (t, a, b) => clamp((t - a) / (b - a));
const smooth = (k) => k * k * (3 - 2 * k);
const out = (k) => 1 - (1 - k) ** 3;
const lerp = (a, b, k) => a + (b - a) * k;

// The munck parks left of the frame, so its boom leans right towards it.
const PIVOT = [10.9, 2.5, 8.5];
const TRUSS_X0 = 12.6; // standing on blocks beside the frame
const TRUSS_X1 = 16.16; // first column line of the frame
const FRAME_X = [16, 19.5, 23];
const TRUSS_Z = [1.16, 5.66];
const TRUSS_ZC = (TRUSS_Z[0] + TRUSS_Z[1]) / 2;
const TRUSS_H = 1.7;
const REST = 0.14;
const SEAT = 4.7; // top of the eave beams
const CARRY = 6.0; // clears the columns (4.4) and the eaves (4.7)
const HOOK_UP = 2.6; // hook above the bottom chord while rigged

const PHASES = [
  { at: 0, text: 'Munck 12 t a caminho da obra' },
  { at: 2.6, text: 'Sapatas abertas, lança subindo' },
  { at: 5.0, text: 'Içando a tesoura' },
  { at: 9.4, text: 'Tesoura assentada nos pilares' },
  { at: 11.4, text: 'Etapa confirmada · pagamento liberado', done: true },
];
const phaseAt = (t) => PHASES.reduce((i, p, k) => (t >= p.at ? k : i), 0);
const STILL = 12; // the frame shown with reduced motion

/** Boom tip for a hook hanging over (hx, hz) with telescope length L. */
function tipOver(hx, hz, L) {
  const r = Math.hypot(hx - PIVOT[0], hz - PIVOT[2]);
  return [hx, PIVOT[1] + Math.sqrt(Math.max(L * L - r * r, 0)), hz];
}
const A = tipOver(TRUSS_X0, TRUSS_ZC, 9.5);
const STOW = 3.8;

/** The whole rig at time t (seconds into the loop). Pure. */
function rig(t) {
  const fade = Math.min(seg(t, 0, 0.4), 1 - seg(t, 13.8, 14.6));
  const truckDx = -7 * (1 - out(seg(t, 0, 2.6)));
  const legs = smooth(seg(t, 2.6, 3.3));
  let tip;
  if (t < 5.0) {
    // from stowed along the bed to above the truss: slew, luff and extend
    const k = smooth(seg(t, 3.3, 5.0));
    const th = lerp(Math.PI, Math.atan2(A[2] - PIVOT[2], A[0] - PIVOT[0]) + Math.PI * 2, k);
    const rr = lerp(STOW, Math.hypot(A[0] - PIVOT[0], A[2] - PIVOT[2]), k);
    tip = [PIVOT[0] + Math.cos(th) * rr, lerp(PIVOT[1] + 0.25, A[1], k), PIVOT[2] + Math.sin(th) * rr];
  } else {
    const k = smooth(seg(t, 7.2, 9.4));
    tip = tipOver(lerp(TRUSS_X0, TRUSS_X1, k), TRUSS_ZC, lerp(9.5, 10.5, k));
  }
  let ty = REST;
  if (t >= 5.8 && t < 7.2) ty = lerp(REST, CARRY, smooth(seg(t, 5.8, 7.2)));
  else if (t >= 7.2 && t < 9.4) ty = CARRY;
  else if (t >= 9.4) ty = lerp(CARRY, SEAT, smooth(seg(t, 9.4, 10.6)));
  const tx = t < 7.2 ? TRUSS_X0 : lerp(TRUSS_X0, TRUSS_X1, smooth(seg(t, 7.2, 9.4)));
  let hookY;
  if (t < 5.0) hookY = tip[1] - 0.6;
  else if (t < 5.8) hookY = lerp(A[1] - 0.6, REST + HOOK_UP, smooth(seg(t, 5.0, 5.8)));
  else if (t < 10.8) hookY = ty + HOOK_UP;
  else hookY = lerp(SEAT + HOOK_UP, tip[1] - 1.1, smooth(seg(t, 10.8, 11.6)));
  return {
    fade,
    truckDx,
    legs,
    tip: [tip[0] + truckDx, tip[1], tip[2]],
    pivot: [PIVOT[0] + truckDx, PIVOT[1], PIVOT[2]],
    hookY,
    tx,
    ty,
    slings: Math.min(seg(t, 5.55, 5.8), 1 - seg(t, 10.7, 11.0)),
    seated: Math.max(0, 1 - Math.abs(t - 10.9) / 0.45),
    // the signalman guides from the raise until the truss is seated
    arm: t > 3.3 && t < 10.8 ? 1.35 + Math.sin(t * 5) * 0.35 : -1.35,
  };
}

/* ------------------------------------------------------------- scene */
function Ground() {
  return (
    <g>
      <Box P={P} p={[3, -2.7, 2.6]} s={[21, 0.8, 4.8]} c="#6f5130" top={false} />
      <Box P={P} p={[1.2, -1.9, 1.2]} s={[25.6, 1.2, 7.6]} c="#a8834a" top={false} />
      <Box P={P} p={[0, -0.7, 0]} s={[28, 0.7, 10]} c="#e8e1d2" />
      <Flat P={P} p={[0, 0.01, 7.4]} s={[28, 2.2]} c="#2c3140" />
      <Flat P={P} p={[0, 0.015, 7.4]} s={[28, 0.08]} c="#4a5266" />
      <Flat P={P} p={[0, 0.015, 9.52]} s={[28, 0.08]} c="#4a5266" />
      {Array.from({ length: 14 }, (_, i) => (
        <Flat key={i} P={P} p={[0.5 + i * 2, 0.02, 8.46]} s={[0.9, 0.09]} c="#e8d9a8" />
      ))}
      <Flat P={P} p={[15.4, 0.01, 0.5]} s={[8.4, 5.8]} c="#cfc9bd" />
      {/* trench the excavator is opening */}
      <Flat P={P} p={[4.7, 0.015, 1.45]} s={[1.9, 1.0]} c="#7a5c3a" />
      <Flat P={P} p={[4.9, 0.02, 1.6]} s={[1.5, 0.7]} c="#5c442b" />
    </g>
  );
}

function Column({ x, z }) {
  return (
    <g>
      <Flat P={P} p={[x - 0.18, 0.02, z - 0.18]} s={[0.68, 0.68]} c="#9aa3ad" />
      <Shadow P={P} p={[x, 0, z]} s={[0.32, 4.4, 0.32]} opacity={0.12} />
      <Box P={P} p={[x, 0, z]} s={[0.32, 4.4, 0.32]} c={STEEL} />
    </g>
  );
}

function Frame({ z }) {
  return (
    <g>
      {FRAME_X.map((x) => (
        <Column key={x} x={x} z={z} />
      ))}
      <Box P={P} p={[FRAME_X[0], 4.4, z]} s={[7.32, 0.3, 0.32]} c={STEEL_DARK} />
    </g>
  );
}

function InstalledRoof() {
  const top = (z) => SEAT + TRUSS_H * (1 - Math.abs(z - TRUSS_ZC) / (TRUSS_ZC - TRUSS_Z[0]));
  return (
    <g>
      {[19.66, 23.16].map((x) => (
        <Truss key={x} P={P} x={x} y={SEAT} z0={TRUSS_Z[0]} z1={TRUSS_Z[1]} h={TRUSS_H} c="#6f86a3" w={3} />
      ))}
      {[1.9, 2.66, 4.16, 4.9].map((z) => (
        <Line key={z} P={P} a={[19.66, top(z), z]} b={[23.16, top(z), z]} c={STEEL_DARK} w={1.8} />
      ))}
    </g>
  );
}

function Welder() {
  const [sx, sy] = P(22.22, 0.9, 3.12);
  const [hx, hy] = P(22.7, headY(), 3.5);
  return (
    <g>
      {[19.9, 21.7].map((x) =>
        [2.95, 3.29].map((z) => (
          <g key={`${x}${z}`}>
            <Line P={P} a={[x - 0.3, 0, z]} b={[x, 0.72, 3.12]} c="#3e4a5c" w={1.5} />
            <Line P={P} a={[x + 0.3, 0, z]} b={[x, 0.72, 3.12]} c="#3e4a5c" w={1.5} />
          </g>
        )),
      )}
      <Box P={P} p={[19.4, 0.72, 3.0]} s={[2.8, 0.18, 0.24]} c={STEEL} />
      <Box P={P} p={[23.55, 0, 2.2]} s={[0.24, 0.95, 0.24]} c="#3f7d5a" />
      <Box P={P} p={[23.9, 0, 2.2]} s={[0.24, 0.95, 0.24]} c="#9b3b3b" />
      <Box P={P} p={[23, 0, 2.75]} s={[0.5, 0.42, 0.34]} c="#2f6fb0" />
      <path d={`M${pts(P, [[23.1, 0.3, 3.09]])} Q ${pts(P, [[22.95, 0.1, 3.7]])} ${pts(P, [[22.45, 0.7, 3.45]])}`} stroke="#1b1e25" strokeWidth="1.1" fill="none" />
      <Person P={P} x={22.7} z={3.5} shirt="#6b4b3a">
        <Box P={P} p={[22.56, 0.3, 3.6]} s={[0.28, 0.5, 0.02]} c="#8a5a3c" top={false} />
        <rect x={fmt(hx - 6)} y={fmt(hy - 2.5)} width="5" height="6" rx="1.2" fill="#1b1e25" />
        <rect x={fmt(hx - 5.6)} y={fmt(hy - 1)} width="2.2" height="2" rx="0.5" fill="#6bff8a" />
        <Line P={P} a={[22.6, 0.82, 3.52]} b={[22.28, 0.9, 3.2]} c="#6b4b3a" w={3} />
      </Person>
      <circle className={s.weldGlow} cx={fmt(sx)} cy={fmt(sy)} r="18" fill="url(#site-weld)" />
      <g className={s.sparks} stroke="#ffd27a" strokeWidth="1.3" strokeLinecap="round">
        {[
          [-7, -8],
          [-10, 1],
          [-4, 8],
          [3, -10],
          [7, -4],
          [5, 6],
        ].map(([dx, dy], i) => (
          <line key={i} x1={fmt(sx)} y1={fmt(sy)} x2={fmt(sx + dx)} y2={fmt(sy + dy)} />
        ))}
      </g>
    </g>
  );
}

function Cone({ x, z }) {
  const [ax, ay] = P(x, 0.62, z);
  return (
    <g>
      <polygon points={`${pts(P, [[x - 0.2, 0, z + 0.1], [x + 0.2, 0, z - 0.1]])} ${fmt(ax)},${fmt(ay)}`} fill={SAFETY} />
      <Line P={P} a={[x - 0.11, 0.27, z + 0.05]} b={[x + 0.11, 0.27, z - 0.05]} c="#ffffff" w={2} />
    </g>
  );
}

function Tape({ a, b }) {
  return (
    <g>
      <Line P={P} a={[a[0], 0.5, a[1]]} b={[b[0], 0.5, b[1]]} c="#e34b3f" w={1.5} strokeDasharray="5 5" />
      <Line P={P} a={[a[0], 0.5, a[1]]} b={[b[0], 0.5, b[1]]} c="#f5f1e8" w={1.5} strokeDasharray="5 5" strokeDashoffset="5" />
    </g>
  );
}

function Jackhammer() {
  const c = [
    [1, 4.5],
    [5.6, 4.5],
    [5.6, 6.8],
    [1, 6.8],
  ];
  const [bx, by] = P(3.02, 0.04, 6.05);
  return (
    <g>
      <Flat P={P} p={[1.8, 0.015, 5.0]} s={[2.6, 1.4]} c="#a39c8f" />
      <Flat P={P} p={[2.4, 0.02, 5.6]} s={[1.3, 0.8]} c="#7d766b" />
      {[
        [2.6, 5.75],
        [3.4, 6.15],
        [3.7, 5.55],
      ].map(([x, z], i) => (
        <Box key={i} P={P} p={[x, 0, z]} s={[0.2, 0.08, 0.16]} c="#a39c8f" />
      ))}
      <Cone x={c[0][0]} z={c[0][1]} />
      <Cone x={c[1][0]} z={c[1][1]} />
      <Tape a={c[0]} b={c[1]} />
      <Tape a={c[1]} b={c[2]} />
      <Tape a={c[3]} b={c[0]} />
      <Person P={P} x={3.35} z={5.7} shirt={SAFETY} />
      <g className={s.dust}>
        {[0, 1, 2].map((i) => (
          <circle key={i} cx={fmt(bx)} cy={fmt(by)} r={2.5 + i * 1.2} fill="#d9d1c1" style={{ '--dx': `${(i - 1) * 8}px`, animationDelay: `${i * 0.36}s` }} />
        ))}
      </g>
      <g className={s.hammer}>
        <Line P={P} a={[3.02, 0, 6.03]} b={[3.02, 0.14, 6.03]} c="#9aa3ad" w={1.6} />
        <Box P={P} p={[2.95, 0.12, 5.97]} s={[0.14, 0.45, 0.14]} c="#e0b23a" />
        <Box P={P} p={[2.77, 0.57, 6.0]} s={[0.5, 0.06, 0.08]} c="#2a2f37" />
      </g>
      <Line P={P} a={[3.3, 0.8, 5.82]} b={[3.06, 0.6, 6.02]} c={SAFETY} w={2.8} />
      <Cone x={c[3][0]} z={c[3][1]} />
      <Cone x={c[2][0]} z={c[2][1]} />
      <Tape a={c[2]} b={c[3]} />
    </g>
  );
}

function Excavator({ arm }) {
  return (
    <g>
      <Shadow P={P} p={[1, 0, 1.0]} s={[2.9, 1.8, 2.1]} />
      <Box P={P} p={[1, 0, 1.0]} s={[2.9, 0.42, 0.55]} c="#2a2f37" />
      <Box P={P} p={[1, 0, 2.55]} s={[2.9, 0.42, 0.55]} c="#2a2f37" />
      <Box P={P} p={[0.9, 0.5, 1.25]} s={[0.3, 0.66, 1.6]} c="#3a3f48" />
      <Box P={P} p={[1.2, 0.42, 1.2]} s={[2.35, 0.78, 1.7]} c={YELLOW} edge />
      <Box P={P} p={[1.45, 1.2, 2.0]} s={[0.95, 0.95, 0.85]} c={YELLOW} edge />
      <polygon points={pts(P, [[1.55, 1.45, 2.86], [2.3, 1.45, 2.86], [2.3, 1.95, 2.86], [1.55, 1.95, 2.86]])} fill="#1b2433" />
      <line ref={arm.boom} stroke={YELLOW} strokeWidth="7" strokeLinecap="round" />
      <line ref={arm.stick} stroke="#e0a21f" strokeWidth="5" strokeLinecap="round" />
      <polygon ref={arm.bucket} fill="#3a3f48" />
    </g>
  );
}

function Truck({ legsBack, legsFront }) {
  return (
    <g>
      <Shadow P={P} p={[7, 0, 7.6]} s={[6.2, 1.9, 1.8]} opacity={0.28} />
      <g ref={legsBack}>
        {[7.35, 10.35].map((x) => (
          <g key={x}>
            <Flat P={P} p={[x - 0.15, 0.02, 6.8]} s={[0.6, 0.5]} c="#3a3f48" />
            <Box P={P} p={[x, 0, 6.92]} s={[0.3, 0.55, 0.26]} c={SAFETY} />
            <Box P={P} p={[x, 0.5, 6.92]} s={[0.3, 0.2, 3.2]} c={SAFETY} />
          </g>
        ))}
      </g>
      <Box P={P} p={[7, 0.42, 7.65]} s={[6.2, 0.32, 1.7]} c="#2a2f3a" />
      <Box P={P} p={[7, 0.74, 7.65]} s={[4.3, 0.18, 1.7]} c="#3a4252" />
      <Box P={P} p={[11.5, 0.42, 7.6]} s={[1.7, 1.65, 1.8]} c={YELLOW} edge />
      <polygon points={pts(P, [[13.2, 1.25, 7.8], [13.2, 1.25, 9.2], [13.2, 1.85, 9.2], [13.2, 1.85, 7.8]])} fill="#1b2433" />
      <polygon points={pts(P, [[11.7, 1.25, 9.4], [12.85, 1.25, 9.4], [12.85, 1.82, 9.4], [11.7, 1.82, 9.4]])} fill="#1b2433" />
      <polygon points={pts(P, [[13.2, 0.6, 9.0], [13.2, 0.6, 9.3], [13.2, 0.78, 9.3], [13.2, 0.78, 9.0]])} fill="#fff1c2" />
      {[7.8, 9.0, 12.3].map((x) => (
        <g key={x}>
          <Disc P={P} c={[x, 0.42, 9.36]} r={0.42} fill="#1b1e25" />
          <Disc P={P} c={[x, 0.42, 9.37]} r={0.16} fill="#c9ced8" n={10} />
        </g>
      ))}
      <Box P={P} p={[10.45, 0.92, 8.05]} s={[0.9, 0.16, 0.9]} c="#3a3f48" />
      <Box P={P} p={[10.6, 1.06, 8.2]} s={[0.6, 1.5, 0.6]} c={SAFETY} edge />
      <g ref={legsFront}>
        {[7.35, 10.35].map((x) => (
          <g key={x}>
            <Flat P={P} p={[x - 0.15, 0.02, 9.9]} s={[0.6, 0.5]} c="#3a3f48" />
            <Box P={P} p={[x, 0, 9.92]} s={[0.3, 0.55, 0.26]} c={SAFETY} />
          </g>
        ))}
      </g>
    </g>
  );
}

export default function SiteArt({ mobile = false, paused = false, reduced = false }) {
  const R = {
    dyn: useRef(),
    truck: useRef(),
    legsBack: useRef(),
    legsFront: useRef(),
    truss: useRef(),
    cable: useRef(),
    hook: useRef(),
    slingA: useRef(),
    slingB: useRef(),
    boom: useRef(),
    shine: useRef(),
    tele: useRef(),
    ram: useRef(),
    pulley: useRef(),
    seatA: useRef(),
    seatB: useRef(),
    signal: useRef(),
    ex: { boom: useRef(), stick: useRef(), bucket: useRef() },
  };
  const start = reduced ? STILL : 0;
  const [phase, setPhase] = useState(() => phaseAt(start));
  const clock = useRef({ t: start, last: null, phase: phaseAt(start) });

  const apply = (t) => {
    const r = rig(t);
    const set = (ref, attrs) => {
      const el = ref.current;
      if (el) for (const k in attrs) el.setAttribute(k, attrs[k]);
    };
    const line = (ref, a, b, extra) => {
      const [x1, y1] = P(...a);
      const [x2, y2] = P(...b);
      set(ref, { x1: fmt(x1), y1: fmt(y1), x2: fmt(x2), y2: fmt(y2), ...extra });
    };
    set(R.dyn, { opacity: fmt(r.fade) });
    set(R.truck, { transform: tr(D(r.truckDx, 0, 0)) });
    const legs = { transform: tr(D(0, 0.5 * (1 - r.legs), 0)), opacity: fmt(r.legs) };
    set(R.legsBack, legs);
    set(R.legsFront, legs);
    set(R.truss, { transform: tr(D(r.tx - TRUSS_X0, r.ty - REST, 0)) });
    // boom: base section up to 5.2 units, telescope beyond, ram at 2.2
    const { pivot: pv, tip } = r;
    const len = Math.hypot(tip[0] - pv[0], tip[1] - pv[1], tip[2] - pv[2]);
    const along = (d) => pv.map((v, i) => v + (tip[i] - v) * Math.min(d / len, 1));
    const mid = along(5.2);
    line(R.boom, pv, mid);
    line(R.tele, mid, tip);
    const [p0x, p0y] = P(...pv);
    const [m0x, m0y] = P(...mid);
    set(R.shine, { x1: fmt(p0x), y1: fmt(p0y - 2), x2: fmt(m0x), y2: fmt(m0y - 2) });
    line(R.ram, [pv[0] - 0.1, 1.25, pv[2] + 0.1], along(2.2));
    const [tx, ty] = P(...tip);
    set(R.pulley, { cx: fmt(tx), cy: fmt(ty) });
    const hook = [tip[0], r.hookY, tip[2]];
    const [hx, hy] = P(...hook);
    set(R.cable, { x1: fmt(tx), y1: fmt(ty), x2: fmt(hx), y2: fmt(hy) });
    set(R.hook, { transform: `translate(${fmt(hx)} ${fmt(hy)})` });
    const attach = (dz) => P(r.tx, r.ty + TRUSS_H * (1 - Math.abs(dz) / (TRUSS_ZC - TRUSS_Z[0])), TRUSS_ZC + dz);
    const [ax, ay] = attach(-1.3);
    const [bx, by] = attach(1.3);
    set(R.slingA, { x1: fmt(hx), y1: fmt(hy + 6), x2: fmt(ax), y2: fmt(ay), opacity: fmt(r.slings) });
    set(R.slingB, { x1: fmt(hx), y1: fmt(hy + 6), x2: fmt(bx), y2: fmt(by), opacity: fmt(r.slings) });
    set(R.seatA, { opacity: fmt(r.seated) });
    set(R.seatB, { opacity: fmt(r.seated) });
    const [sx, sy] = P(14.15, 0.84, 6.75);
    set(R.signal, { x1: fmt(sx), y1: fmt(sy), x2: fmt(sx + Math.cos(r.arm) * 10), y2: fmt(sy - Math.sin(r.arm) * 10) });
    // excavator: boom and stick move in opposition; the bucket stays above ground
    const a = 0.3 + 0.12 * Math.sin(t * 1.1);
    const g = -1.05 + 0.28 * Math.sin(t * 1.1 + 2.2);
    const e0 = [3.4, 1.15, 1.95];
    const e1 = [e0[0] + 1.8 * Math.cos(a), e0[1] + 1.8 * Math.sin(a), e0[2]];
    const e2 = [e1[0] + 1.4 * Math.cos(g), Math.max(e1[1] + 1.4 * Math.sin(g), 0.5), e1[2]];
    line(R.ex.boom, e0, e1);
    line(R.ex.stick, e1, e2);
    set(R.ex.bucket, {
      points: pts(P, [
        [e2[0] - 0.08, e2[1] + 0.1, e2[2] - 0.3],
        [e2[0] + 0.4, e2[1] - 0.05, e2[2] - 0.3],
        [e2[0] + 0.28, e2[1] - 0.38, e2[2] + 0.3],
        [e2[0] - 0.1, e2[1] - 0.22, e2[2] + 0.3],
      ]),
    });
    const ph = phaseAt(t);
    if (ph !== clock.current.phase) {
      clock.current.phase = ph;
      setPhase(ph);
    }
  };

  useLayoutEffect(() => {
    apply(clock.current.t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (reduced || paused) return undefined;
    let raf = 0;
    const c = clock.current;
    c.last = null;
    const tick = (now) => {
      if (c.last !== null) c.t = (c.t + Math.min((now - c.last) / 1000, 0.1)) % T;
      c.last = now;
      apply(c.t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const lifted = trussMembers(TRUSS_X0, REST, TRUSS_Z[0], TRUSS_Z[1], TRUSS_H);
  const vb = mobile ? `${VIEW_M.x} 0 ${VIEW_M.w} ${VIEW.h}` : `0 0 ${VIEW.w} ${VIEW.h}`;
  const p = PHASES[phase];
  return (
    <>
      <svg className={`${s.siteArt} ${paused || reduced ? s.artPaused : ''}`} viewBox={vb} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <radialGradient id="site-weld" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff3c4" stopOpacity="0.95" />
            <stop offset="0.35" stopColor="#ffcf7a" stopOpacity="0.5" />
            <stop offset="1" stopColor="#ffb35c" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="site-seat" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff1b8" stopOpacity="0.95" />
            <stop offset="1" stopColor="#f3d77a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <Ground />
        <Excavator arm={R.ex} />
        <Frame z={1} />
        <InstalledRoof />
        <Welder />
        <Frame z={5.5} />
        <Person P={P} x={14.0} z={6.7} shirt="#f2d14a" />
        <line ref={R.signal} stroke="#f2d14a" strokeWidth="2.8" strokeLinecap="round" />
        <Jackhammer />
        {/* blocks the third truss stands on before the lift */}
        <Box P={P} p={[12.3, 0, 1.5]} s={[0.6, 0.14, 0.4]} c="#9b7653" />
        <Box P={P} p={[12.3, 0, 5.0]} s={[0.6, 0.14, 0.4]} c="#9b7653" />
        <g ref={R.dyn}>
          <g ref={R.truss}>
            {lifted.webs.map(([a, b], i) => (
              <Line key={`w${i}`} P={P} a={a} b={b} c={TRUSS} w={1.8} />
            ))}
            {lifted.chords.map(([a, b], i) => (
              <Line key={`c${i}`} P={P} a={a} b={b} c={TRUSS} w={3.4} />
            ))}
          </g>
          {TRUSS_Z.map((z, i) => {
            const [gx, gy] = P(TRUSS_X1, SEAT, z);
            return <circle key={z} ref={i ? R.seatB : R.seatA} cx={fmt(gx)} cy={fmt(gy)} r="16" fill="url(#site-seat)" opacity="0" />;
          })}
          <g ref={R.truck}>
            <Truck legsBack={R.legsBack} legsFront={R.legsFront} />
          </g>
          <line ref={R.cable} stroke="#20242c" strokeWidth="1.5" />
          <line ref={R.slingA} stroke="#e0b23a" strokeWidth="1.5" opacity="0" />
          <line ref={R.slingB} stroke="#e0b23a" strokeWidth="1.5" opacity="0" />
          <g ref={R.hook}>
            <rect x="-4" y="-3" width="8" height="7" rx="1.6" fill="#2a3242" />
            <path d="M0 4 v2.6 a2.3 2.3 0 1 0 2.3 -2.3" stroke="#c9ced8" strokeWidth="1.3" fill="none" />
          </g>
          <line ref={R.ram} stroke="#c9ced8" strokeWidth="3.4" strokeLinecap="round" />
          <line ref={R.boom} stroke={SAFETY} strokeWidth="9" strokeLinecap="round" />
          <line ref={R.shine} stroke={shade(SAFETY, 0.4)} strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
          <line ref={R.tele} stroke="#f5a347" strokeWidth="6" strokeLinecap="round" />
          <circle ref={R.pulley} r="4" fill="#2a3242" />
        </g>
      </svg>
      <p className={`${s.siteChip} ${p.done ? s.siteChipDone : ''}`} key={phase} aria-hidden="true">
        <span className={s.siteChipDot} />
        {p.text}
      </p>
    </>
  );
}
