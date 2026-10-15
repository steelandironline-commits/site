/* TemPix Marítimo em 2.5D, passo a passo com o fluxo ao lado:
   0 o navio atraca · 1 pede um reparo · 2 o TemPix recebe · 3 as empresas
   compatíveis do cais acendem · 4 chegam as cotações · 5 a usinagem
   escolhida leva a peça de van até a prancha e ela sobe a bordo.
   O navio fica à esquerda, ao longo do cais; as empresas, à direita da via,
   então nada fica escondido atrás de nada. SVG puro; cada passo só troca
   classes (transições em CSS). */
import { Box, DiscX, Flat, Line, axo, fmt, pts } from './iso.jsx';
import s from './sectors.module.css';

const U = 20;
const { P, D } = axo(U, 5.6 * U + 12, 3.0 * U + 12);
const VIEW = { w: Math.round(22.2 * U + 24), h: Math.round(13.9 * U + 24) };

const BOX = ['#c8553d', '#2ad1b8', '#f2b134', '#4f9dff', '#8fb2ff', '#e5574f'];
const cx = (...c) => c.filter(Boolean).join(' ');

/** Companies on the quay, on a diagonal so none hides another; drawn back to front. `pick` wins the job. */
const COMPANIES = [
  { id: 'transporte', label: 'Transporte', p: [15.0, 0, 0.6], s: [2.6, 1.2, 2.2], c: '#f3efe7', roof: '#e5a53b' },
  { id: 'pecas', label: 'Peças', p: [13.0, 0, 3.4], s: [2.4, 1.1, 1.8], c: '#eef1f6', roof: '#8fb2ff' },
  { id: 'usinagem', label: 'Usinagem', p: [9.4, 0, 5.6], s: [3.0, 1.4, 2.0], c: '#f1ece3', roof: '#4f9dff', pick: true },
];
const roofTop = (co) => [co.p[0] + co.s[0] / 2, co.s[1] + 0.95, co.p[2] + co.s[2] / 2];
// TemPix hovers over the quay; the need pops over the containers.
const TILE = [13.4, 7.5, 3.0];
const NEED = [5.1, 3.2, 6.0];

function curve(a, b, lift) {
  const [x1, y1] = P(...a);
  const [x2, y2] = P(...b);
  return `M${fmt(x1)} ${fmt(y1)} Q ${fmt((x1 + x2) / 2)} ${fmt(Math.min(y1, y2) - lift)} ${fmt(x2)} ${fmt(y2)}`;
}

function Ship() {
  const boxes = [];
  for (const [i, z] of [2.75, 4.2, 5.65].entries())
    for (const [j, x] of [4.05, 5.2].entries()) {
      const n = 1 + ((i + j) % 2);
      for (let k = 0; k < n; k++) boxes.push({ p: [x, 0.9 + k * 0.72, z], c: BOX[(i * 2 + j + k) % BOX.length] });
    }
  return (
    <g>
      <Box P={P} p={[3.9, -0.25, 1.0]} s={[2.4, 0.3, 6.0]} c="#b8432f" top={false} />
      <Box P={P} p={[3.9, 0.05, 1.0]} s={[2.4, 0.85, 6.0]} c="#24426e" />
      {/* bow towards the viewer: left face, then the right (sunnier) face */}
      <polygon points={pts(P, [[3.9, -0.25, 7], [5.1, -0.25, 8.4], [5.1, 0.9, 8.4], [3.9, 0.9, 7]])} fill="#2c4f82" />
      <polygon points={pts(P, [[3.9, -0.25, 7], [5.1, -0.25, 8.4], [5.1, 0.05, 8.4], [3.9, 0.05, 7]])} fill="#c8553d" />
      <polygon points={pts(P, [[6.3, -0.25, 7], [5.1, -0.25, 8.4], [5.1, 0.9, 8.4], [6.3, 0.9, 7]])} fill="#1a3358" />
      <polygon points={pts(P, [[6.3, -0.25, 7], [5.1, -0.25, 8.4], [5.1, 0.05, 8.4], [6.3, 0.05, 7]])} fill="#9b3828" />
      <polygon points={pts(P, [[3.9, 0.9, 7], [6.3, 0.9, 7], [5.1, 0.9, 8.4]])} fill="#3b4c66" />
      <Flat P={P} p={[4.0, 0.905, 1.1]} s={[2.2, 5.8]} c="#3b4c66" />
      {/* bridge + funnel at the stern */}
      <Box P={P} p={[4.0, 0.9, 1.1]} s={[2.2, 2.0, 1.4]} c="#f2f0ea" />
      <polygon points={pts(P, [[4.1, 2.4, 2.5], [6.1, 2.4, 2.5], [6.1, 2.65, 2.5], [4.1, 2.65, 2.5]])} fill="#1b2433" />
      <polygon points={pts(P, [[6.2, 2.4, 1.2], [6.2, 2.4, 2.4], [6.2, 2.65, 2.4], [6.2, 2.65, 1.2]])} fill="#1b2433" />
      <Box P={P} p={[4.8, 2.9, 1.4]} s={[0.5, 0.7, 0.5]} c="#c8553d" />
      {boxes.map((b, i) => (
        <Box key={i} P={P} p={b.p} s={[0.95, 0.7, 1.3]} c={b.c} />
      ))}
    </g>
  );
}

function Company({ co, on, picked }) {
  const [x, , z] = co.p;
  const [w, h, d] = co.s;
  const n = Math.max(2, Math.round(w / 1.1));
  const [lx, ly] = P(...roofTop(co));
  return (
    <g className={cx(s.co, on && s.coOn, picked && s.coPick)}>
      <Box P={P} p={co.p} s={co.s} c={co.c} />
      {Array.from({ length: n }, (_, i) => {
        const x0 = x + (w / n) * i;
        const x1 = x0 + w / n;
        return (
          <g key={i}>
            <polygon points={pts(P, [[x0, h, z], [x0, h, z + d], [x1, h + 0.45, z + d], [x1, h + 0.45, z]])} fill={co.roof} />
            <polygon points={pts(P, [[x1, h, z], [x1, h, z + d], [x1, h + 0.45, z + d], [x1, h + 0.45, z]])} fill="#3a4252" opacity="0.55" />
            <polygon points={pts(P, [[x0, h, z + d], [x1, h, z + d], [x1, h + 0.45, z + d]])} fill={co.c} />
          </g>
        );
      })}
      <polygon points={pts(P, [[x + w * 0.35, 0, z + d], [x + w * 0.65, 0, z + d], [x + w * 0.65, h * 0.6, z + d], [x + w * 0.35, h * 0.6, z + d]])} fill="#4a5262" />
      <g className={s.coTag} transform={`translate(${fmt(lx)} ${fmt(ly)})`}>
        <rect x="-31" y="-11" width="62" height="18" rx="9" />
        <text x="0" y="2" textAnchor="middle">
          {co.label}
        </text>
      </g>
    </g>
  );
}

function Quote({ co, i, on, best }) {
  const [x, y] = P(...roofTop(co));
  return (
    <g transform={`translate(${fmt(x)} ${fmt(y - 24)})`}>
      <g className={cx(s.quote, on && s.quoteOn, best && s.quoteBest)} style={{ transitionDelay: on ? `${i * 0.18}s` : '0s' }}>
        <rect x="-24" y="-12" width="48" height="20" rx="6" />
        <rect className={s.quoteBar} x="-17" y="-6" width={best ? 18 : 24 - i * 3} height="3" rx="1.5" />
        <rect className={s.quoteBar} x="-17" y="0" width="12" height="3" rx="1.5" opacity="0.5" />
        <circle className={s.quoteTick} cx="13" cy="-2" r="6" />
        <path className={s.quoteTickMark} d="M10 -2 l2.2 2.2 l4 -4.4" />
      </g>
    </g>
  );
}

/** Delivery van, nose towards -z (it drives along the quay road). */
function Van() {
  return (
    <g>
      <Box P={P} p={[0, 0.18, 0]} s={[0.8, 0.22, 1.7]} c="#2a2f3a" />
      <Box P={P} p={[0, 0.4, 0]} s={[0.8, 0.6, 0.55]} c="#4f9dff" />
      <Box P={P} p={[0, 0.4, 0.6]} s={[0.8, 0.85, 1.1]} c="#ffffff" />
      <polygon points={pts(P, [[0.8, 0.72, 0.08], [0.8, 0.72, 0.45], [0.8, 0.95, 0.45], [0.8, 0.95, 0.08]])} fill="#1b2433" />
      <polygon points={pts(P, [[0.8, 0.62, 0.7], [0.8, 0.62, 1.6], [0.8, 0.7, 1.6], [0.8, 0.7, 0.7]])} fill="#2ad1b8" />
      <DiscX P={P} c={[0.81, 0.2, 0.35]} r={0.2} fill="#1b1e25" />
      <DiscX P={P} c={[0.81, 0.2, 1.35]} r={0.2} fill="#1b1e25" />
    </g>
  );
}

export default function PortArt({ step = 5, paused = false }) {
  const st = step < 0 ? 5 : step;
  // van: from the workshop down the quay road to just past the gangway (z 5.2)
  const [v0x, v0y] = D(7.4, 0, 7.3);
  const [v1x, v1y] = D(7.4, 0, 5.45);
  // crate: up the gangway, from the quay to the deck
  const [c0x, c0y] = P(7.15, 0.2, 4.9);
  const [c1x, c1y] = P(6.0, 1.15, 4.9);
  const [nx, ny] = P(...NEED);
  const [tx, ty] = P(...TILE);
  return (
    <svg className={cx(s.portArt, paused && s.artPaused)} viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} aria-hidden="true">
      <defs>
        <radialGradient id="port-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#2ad1b8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#2ad1b8" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* platform: base, sea (recessed, left) and quay (right) */}
      <Box P={P} p={[1.0, -1.6, 1.0]} s={[16, 1.0, 7]} c="#3f556e" top={false} />
      <Box P={P} p={[0, -0.6, 0]} s={[6.8, 0.35, 9]} c="#6f8aa6" top={false} />
      <Flat P={P} p={[0, -0.25, 0]} s={[6.8, 9]} c="#2f6fb8" />
      <g className={s.waves} stroke="#8cc4ff" strokeWidth="1.2" fill="none" opacity="0.55">
        {[0.7, 1.9, 3.1].map((x, i) => (
          <path key={x} d={`M${pts(P, [[x, -0.24, 0.3]])} L${pts(P, [[x, -0.24, 8.7]])}`} strokeDasharray="6 10" style={{ animationDelay: `${-i * 0.9}s` }} />
        ))}
      </g>
      {/* tug waiting by the bow */}
      <g className={s.tugBob}>
        <Box P={P} p={[1.4, -0.25, 6.3]} s={[1.0, 0.4, 1.4]} c="#f2f0ea" />
        <Box P={P} p={[1.6, 0.15, 6.55]} s={[0.6, 0.4, 0.6]} c="#e5574f" />
      </g>
      {/* the ship: arrives at step 0, then bobs */}
      <g className={cx(s.shipArrive, st === 0 && s.shipArriving)}>
        <g className={s.shipBob}>
          <Ship />
        </g>
      </g>
      <Box P={P} p={[6.8, -0.6, 0]} s={[11.2, 0.6, 9]} c="#e6e1d6" />
      <Flat P={P} p={[6.8, 0.01, 0]} s={[0.16, 9]} c="#8d8a85" />
      <Flat P={P} p={[7.15, 0.01, 0]} s={[1.3, 9]} c="#2c3140" />
      {Array.from({ length: 5 }, (_, i) => (
        <Flat key={i} P={P} p={[7.77, 0.02, 0.4 + i * 1.8]} s={[0.07, 0.9]} c="#e8d9a8" />
      ))}
      {[1.5, 3.8, 6.2, 8.2].map((z) => (
        <Box key={z} P={P} p={[6.86, 0, z]} s={[0.16, 0.22, 0.18]} c="#2a2f37" />
      ))}
      {/* gangway from the deck down to the quay */}
      <polygon points={pts(P, [[6.3, 1.06, 4.6], [6.3, 1.06, 5.2], [7.25, 0.02, 5.2], [7.25, 0.02, 4.6]])} fill="#c9ced8" />
      <Line P={P} a={[6.3, 1.4, 4.6]} b={[7.25, 0.36, 4.6]} c="#8d96a5" w={1.2} />
      <Line P={P} a={[6.3, 1.4, 5.2]} b={[7.25, 0.36, 5.2]} c="#8d96a5" w={1.2} />

      {/* van with the part: drives to the gangway at step 5 */}
      <g className={cx(s.van, st === 5 && s.vanGo)} style={{ '--vx0': `${fmt(v0x)}px`, '--vy0': `${fmt(v0y)}px`, '--vx1': `${fmt(v1x)}px`, '--vy1': `${fmt(v1y)}px` }}>
        <Van />
      </g>
      <g className={cx(s.crate, st === 5 && s.crateGo)} style={{ '--cx0': `${fmt(c0x)}px`, '--cy0': `${fmt(c0y)}px`, '--cx1': `${fmt(c1x)}px`, '--cy1': `${fmt(c1y)}px` }}>
        <rect x="-6" y="-7" width="12" height="11" rx="2" fill="#e0b23a" stroke="#8a6418" strokeWidth="1" />
      </g>

      {COMPANIES.map((co) => (
        <Company key={co.id} co={co} on={st >= 3} picked={st === 5 && co.pick} />
      ))}
      <Box P={P} p={[15.8, 0, 3.3]} s={[1.6, 0.7, 0.8]} c="#e5a53b" />

      {/* links: ship → TemPix → companies */}
      <path className={cx(s.link, st >= 2 && s.linkOn)} d={curve(NEED, TILE, 22)} />
      {COMPANIES.map((co, i) => (
        <path key={co.id} className={cx(s.link, st >= 3 && s.linkOn, st === 5 && !co.pick && s.linkDim)} style={{ transitionDelay: st >= 3 ? `${i * 0.15}s` : '0s' }} d={curve(TILE, roofTop(co), 6)} />
      ))}
      {COMPANIES.map((co, i) => (
        <Quote key={co.id} co={co} i={i} on={st === 4 || (st === 5 && co.pick)} best={st === 5 && co.pick} />
      ))}

      {/* TemPix: hovering tile */}
      <g transform={`translate(${fmt(tx)} ${fmt(ty)})`}>
        <g className={cx(s.tile, st >= 2 && s.tileOn)}>
          <circle r="30" fill="url(#port-glow)" className={s.tileGlow} />
          <g className={s.tileFloat}>
            <path d="M0 -15 L15 0 L0 15 L-15 0 Z" fill="#1c2a45" transform="translate(0 4)" />
            <path d="M0 -15 L15 0 L0 15 L-15 0 Z" fill="#2ad1b8" />
            <path d="M-6 0 l4 4 l8 -8" stroke="#04201b" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </g>
      </g>

      {/* the ship's need, then the delivery check */}
      <g transform={`translate(${fmt(nx)} ${fmt(ny)})`}>
        <g className={cx(s.need, st >= 1 && st <= 4 && s.needOn)}>
          <circle className={s.needPing} r="10" />
          <rect x="-62" y="-30" width="124" height="22" rx="11" />
          <text x="0" y="-15" textAnchor="middle">
            Reparo · eixo Ø500 · 8 h
          </text>
        </g>
        <g className={cx(s.need, s.needDone, st === 5 && s.needOn)}>
          <rect x="-58" y="-30" width="116" height="22" rx="11" />
          <circle cx="-44" cy="-19" r="6.5" className={s.doneDot} />
          <path d="M-47 -19 l2.2 2.2 l4 -4.4" stroke="#04130f" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <text x="6" y="-15" textAnchor="middle">
            Entregue a bordo
          </text>
        </g>
      </g>
    </svg>
  );
}
