/* Obra de montagem de galpão em 2.5D (SVG): munck içando a tesoura, soldador
   com EPI, britadeira em área isolada e uma escavadeira para locação. Leve:
   sem WebGL, só CSS; a versão 3D completa fica na abertura da home. Nada se
   sobrepõe: a tesoura sobe no máximo 6 px e fica sempre abaixo da lança. */
import s from './sectors.module.css';

const STEEL = '#6f86a3';
const STEEL_DARK = '#44546a';
const SAFETY = '#f28c28';
const YELLOW = '#f2b134';

/** Pratt truss from x0 to x1 with the bottom chord at y and a ridge `h` above. */
function Truss({ x0, x1, y, h, c = STEEL, w = 5 }) {
  const mid = (x0 + x1) / 2;
  const top = (x) => y - h * (1 - Math.abs(x - mid) / (mid - x0));
  const n = 6;
  const step = (x1 - x0) / n;
  const members = [];
  for (let i = 1; i < n; i++) {
    const x = x0 + i * step;
    members.push([x, y, x, top(x)]);
    const xn = x + (x < mid ? step : x > mid ? -step : 0);
    if (xn !== x) members.push([x, y, xn, top(xn)]);
  }
  return (
    <g stroke={c} strokeLinecap="round" fill="none">
      <path d={`M${x0} ${y} L${mid} ${y - h} L${x1} ${y} Z`} strokeWidth={w} strokeLinejoin="round" />
      {members.map(([a, b, cc, d], i) => (
        <line key={i} x1={a} y1={b} x2={cc} y2={d} strokeWidth={w * 0.55} />
      ))}
    </g>
  );
}

function Column({ x, top = 136 }) {
  return (
    <g>
      <rect x={x} y={top} width="10" height={262 - top} fill="#5d6f86" />
      <rect x={x - 6} y="257" width="22" height="5" rx="1" fill="#9aa3ad" />
    </g>
  );
}

/** Worker seen from the side, hard hat on. */
function Worker({ x, vest, children }) {
  return (
    <g>
      <rect x={x - 6} y="240" width="5" height="22" rx="1.5" fill="#2c3a52" />
      <rect x={x + 1} y="240" width="5" height="22" rx="1.5" fill="#2c3a52" />
      <rect x={x - 8} y="213" width="16" height="29" rx="4" fill={vest} />
      <circle cx={x} cy="205" r="7" fill="#c99a76" />
      <path d={`M${x - 8} 203 a8 7.5 0 0 1 16 0 z`} fill={YELLOW} />
      <rect x={x - 9.5} y="202" width="19" height="2.4" rx="1.2" fill={YELLOW} />
      {children}
    </g>
  );
}

export default function SiteArt({ mobile = false, paused = false }) {
  return (
    <svg className={`${s.siteArt} ${paused ? s.artPaused : ''}`} viewBox={mobile ? '118 0 506 320' : '0 0 760 320'} preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <defs>
        <radialGradient id="site-weld" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff3c4" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#ffcf7a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffb35c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="site-ground" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2a3550" />
          <stop offset="1" stopColor="#151d2e" />
        </linearGradient>
      </defs>

      {/* ground + slab */}
      <rect x="0" y="262" width="760" height="58" fill="url(#site-ground)" />
      <rect x="0" y="260" width="760" height="3" fill="#3b4a6b" />
      <rect x="112" y="255" width="300" height="7" rx="1" fill="#8d96a5" opacity="0.5" />

      {/* steel beams waiting on the ground */}
      <g>
        <rect x="24" y="252" width="86" height="9" rx="1" fill={STEEL} />
        <rect x="30" y="243" width="86" height="9" rx="1" fill={STEEL_DARK} />
        <rect x="26" y="234" width="86" height="9" rx="1" fill={STEEL} />
      </g>

      {/* back frame: already has its truss */}
      <g opacity="0.42" transform="translate(26 -16)">
        <Column x={126} />
        <Column x={384} />
        <Truss x0={126} x1={394} y={132} h={50} c="#5d6f86" />
      </g>

      {/* front frame waiting for the truss */}
      <Column x={126} />
      <Column x={384} />

      {/* welder: beam on trestles, mask, leather apron, controlled sparks */}
      <g>
        {[160, 214].map((x) => (
          <polyline key={x} points={`${x - 8},262 ${x},238 ${x + 8},262`} stroke="#3e4a5c" strokeWidth="3" fill="none" strokeLinejoin="round" />
        ))}
        <rect x="148" y="230" width="86" height="9" rx="1" fill="#5d6f86" />
        <rect x="262" y="246" width="18" height="16" rx="2" fill="#2f6fb0" />
        <path d="M271 246 C 266 236, 254 240, 242 233" stroke="#1b1e25" strokeWidth="1.6" fill="none" />
        <circle className={s.weldGlow} cx="236" cy="234" r="16" fill="url(#site-weld)" />
        <g className={s.sparks} stroke="#ffd27a" strokeWidth="1.6" strokeLinecap="round">
          <line x1="236" y1="234" x2="228" y2="226" />
          <line x1="236" y1="234" x2="226" y2="238" />
          <line x1="236" y1="234" x2="231" y2="244" />
          <line x1="236" y1="234" x2="240" y2="224" />
        </g>
        <Worker x={252} vest="#6b4b3a">
          <rect x="245" y="225" width="13" height="16" rx="2" fill="#8a5a3c" />
          <rect x="243.5" y="199" width="8" height="12" rx="2" fill="#1b1e25" />
          <rect x="244" y="203" width="3" height="3" rx="1" fill="#6bff8a" />
          <line x1="248" y1="219" x2="239" y2="232" stroke="#6b4b3a" strokeWidth="5" strokeLinecap="round" />
        </Worker>
      </g>

      {/* jackhammer inside a cordoned area */}
      <g>
        <rect x="300" y="256" width="62" height="6" rx="1" fill="#7d766b" />
        {[306, 316, 352].map((x, i) => (
          <rect key={x} x={x} y={253 - (i % 2) * 2} width="6" height="4" rx="1" fill="#a39c8f" transform={`rotate(${i * 25} ${x + 3} 255)`} />
        ))}
        <line x1="294" y1="244" x2="376" y2="244" stroke="#e34b3f" strokeWidth="2" strokeDasharray="7 7" />
        <line x1="294" y1="244" x2="376" y2="244" stroke="#f5f1e8" strokeWidth="2" strokeDasharray="7 7" strokeDashoffset="7" />
        {[294, 376].map((x) => (
          <g key={x}>
            <polygon points={`${x - 7},262 ${x},236 ${x + 7},262`} fill={SAFETY} />
            <rect x={x - 4.5} y="249" width="9" height="3" fill="#ffffff" />
          </g>
        ))}
        <g className={s.dust}>
          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              cx="325"
              cy="258"
              r={3 + i}
              fill="#d9d1c1"
              style={{
                '--dx': `${(i - 1) * 7}px`,
                animationDelay: `${i * 0.35}s`,
              }}
            />
          ))}
        </g>
        <Worker x={340} vest={SAFETY}>
          <rect x="345" y="202" width="3.5" height="6" rx="1" fill="#e34b3f" />
          <rect x="331.5" y="202" width="3.5" height="6" rx="1" fill="#e34b3f" />
          <line x1="334" y1="219" x2="326" y2="229" stroke={SAFETY} strokeWidth="5" strokeLinecap="round" />
        </Worker>
        <g className={s.hammer}>
          <rect x="315" y="226" width="20" height="4" rx="1.5" fill="#2a2f37" />
          <rect x="322" y="229" width="7" height="25" rx="2" fill="#e0b23a" />
          <rect x="324" y="253" width="3" height="7" fill="#9aa3ad" />
        </g>
      </g>

      {/* munck: truck, stabilisers, telescopic boom */}
      <g>
        {[436, 552].map((x) => (
          <g key={x}>
            <rect x={x} y="224" width="7" height="34" fill={SAFETY} />
            <rect x={x - 6} y="258" width="19" height="4" rx="1" fill="#3a3f48" />
          </g>
        ))}
        <rect x="440" y="232" width="172" height="12" rx="2" fill="#2a2f3a" />
        <rect x="440" y="224" width="118" height="8" fill="#3a4252" />
        <rect x="562" y="190" width="50" height="44" rx="7" fill={YELLOW} />
        <rect x="578" y="197" width="28" height="17" rx="3" fill="#1b2433" />
        <rect x="606" y="221" width="6" height="5" rx="1" fill="#fff1c2" />
        {[466, 496, 588].map((x) => (
          <g key={x}>
            <circle cx={x} cy="248" r="13" fill="#1b1e25" />
            <circle cx={x} cy="248" r="5" fill="#c9ced8" />
          </g>
        ))}
        <rect x="468" y="156" width="18" height="70" rx="3" fill={SAFETY} />
        <line x1="478" y1="214" x2="424" y2="128" stroke="#c9ced8" strokeWidth="5" strokeLinecap="round" />
        <line x1="477" y1="164" x2="368" y2="90" stroke={SAFETY} strokeWidth="14" strokeLinecap="round" />
        <line x1="368" y1="90" x2="260" y2="16" stroke="#f5a347" strokeWidth="9" strokeLinecap="round" />
        <circle cx="260" cy="16" r="6.5" fill="#2a3242" />
        <line x1="260" y1="16" x2="260" y2="52" stroke="#20242c" strokeWidth="2" />
      </g>

      {/* the truss being lifted: hook, slings and the truss itself */}
      <g className={s.trussLift}>
        <rect x="254" y="48" width="12" height="9" rx="2" fill="#2a3242" />
        <line x1="260" y1="56" x2="190" y2="108" stroke="#e0b23a" strokeWidth="2" />
        <line x1="260" y1="56" x2="330" y2="108" stroke="#e0b23a" strokeWidth="2" />
        <Truss x0={126} x1={394} y={130} h={50} c="#8fa6c6" />
      </g>

      {/* excavator for rent, digging slowly (no room for it on phones) */}
      {!mobile && (
        <g>
          <rect x="652" y="246" width="88" height="16" rx="8" fill="#2a2f37" />
          {[664, 684, 704, 724].map((x) => (
            <circle key={x} cx={x} cy="254" r="4" fill="#4a505c" />
          ))}
          <rect x="660" y="218" width="66" height="28" rx="3" fill={YELLOW} />
          <rect x="700" y="190" width="26" height="30" rx="3" fill={YELLOW} />
          <rect x="706" y="195" width="16" height="12" rx="2" fill="#1b2433" />
          <rect x="726" y="224" width="12" height="20" rx="2" fill="#3a3f48" />
          <g className={s.dig}>
            <line x1="668" y1="222" x2="642" y2="172" stroke={YELLOW} strokeWidth="9" strokeLinecap="round" />
            <line x1="642" y1="172" x2="631" y2="230" stroke="#e0a21f" strokeWidth="7" strokeLinecap="round" />
            <path d="M622 229 h17 l-3 14 h-11 z" fill="#3a3f48" />
          </g>
        </g>
      )}
    </svg>
  );
}
