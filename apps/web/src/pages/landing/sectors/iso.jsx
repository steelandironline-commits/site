/*
 * Tiny 2.5D (axonometric) kit for the home sections, drawn as SVG.
 *
 * World axes: x to the right-back, z towards the viewer, y up. The camera sits
 * at +x +y +z, so a box shows its top, its +z (front) and +x (right) faces.
 * Shapes are plain SVG, so a whole scene costs no WebGL context at all.
 */

export const AXES = { ex: [0.92, 0.36], ez: [-0.62, 0.38] };

/** Projection for `u` pixels per unit, with the world origin at (ox, oy). */
export function axo(u, ox, oy, { ex, ez } = AXES) {
  const P = (x, y, z) => [ox + (x * ex[0] + z * ez[0]) * u, oy + (x * ex[1] + z * ez[1] - y) * u];
  /** Screen offset of a world-space move (projection is affine). */
  const D = (x, y, z) => [(x * ex[0] + z * ez[0]) * u, (x * ex[1] + z * ez[1] - y) * u];
  return { P, D, u };
}

export const fmt = (n) => (Math.round(n * 10) / 10).toString();
export const pts = (P, list) => list.map(([x, y, z]) => P(x, y, z).map(fmt).join(',')).join(' ');
export const tr = ([dx, dy]) => `translate(${fmt(dx)} ${fmt(dy)})`;

const cache = new Map();
/** k > 0 mixes towards white, k < 0 towards black. */
export function shade(hex, k) {
  const key = `${hex}|${k}`;
  if (cache.has(key)) return cache.get(key);
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
  const out = `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  cache.set(key, out);
  return out;
}

/** Axis-aligned box: top (lit), front +z (base colour) and right +x (shaded). */
export function Box({ P, p, s, c, top = true, edge = false }) {
  const [x, y, z] = p;
  const [w, h, d] = s;
  const stroke = edge ? { stroke: shade(c, -0.35), strokeWidth: 0.6, strokeLinejoin: 'round' } : null;
  return (
    <g {...stroke}>
      <polygon points={pts(P, [[x, y, z + d], [x + w, y, z + d], [x + w, y + h, z + d], [x, y + h, z + d]])} fill={c} />
      <polygon points={pts(P, [[x + w, y, z], [x + w, y, z + d], [x + w, y + h, z + d], [x + w, y + h, z]])} fill={shade(c, -0.22)} />
      {top && <polygon points={pts(P, [[x, y + h, z], [x + w, y + h, z], [x + w, y + h, z + d], [x, y + h, z + d]])} fill={shade(c, 0.16)} />}
    </g>
  );
}

/** Flat rectangle on a horizontal plane (decals: roads, slabs, patches). */
export function Flat({ P, p, s, c, ...rest }) {
  const [x, y, z] = p;
  const [w, d] = s;
  return <polygon points={pts(P, [[x, y, z], [x + w, y, z], [x + w, y, z + d], [x, y, z + d]])} fill={c} {...rest} />;
}

/** Soft ground shadow of a box, cast away from the sun (towards +x +z). */
export function Shadow({ P, p, s, k = [0.45, 0.3], opacity = 0.22 }) {
  const [x, , z] = p;
  const [w, h, d] = s;
  const a = k[0] * h;
  const b = k[1] * h;
  const ring = [
    [x, z],
    [x + w, z],
    [x + w + a, z + b],
    [x + w + a, z + d + b],
    [x + a, z + d + b],
    [x, z + d],
  ];
  return <polygon points={pts(P, ring.map(([gx, gz]) => [gx, 0.005, gz]))} fill="#0b1020" opacity={opacity} />;
}

export function Line({ P, a, b, c, w = 2, ...rest }) {
  const [x1, y1] = P(...a);
  const [x2, y2] = P(...b);
  return <line x1={fmt(x1)} y1={fmt(y1)} x2={fmt(x2)} y2={fmt(y2)} stroke={c} strokeWidth={w} strokeLinecap="round" {...rest} />;
}

/** Circle standing in a plane of constant z (wheels seen from the side). */
export function Disc({ P, c: [cx, cy, cz], r, fill, n = 18, ...rest }) {
  const list = Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [cx + Math.cos(t) * r, cy + Math.sin(t) * r, cz];
  });
  return <polygon points={pts(P, list)} fill={fill} {...rest} />;
}

/** Circle standing in a plane of constant x (wheels of something driving along z). */
export function DiscX({ P, c: [cx, cy, cz], r, fill, n = 14, ...rest }) {
  const list = Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [cx, cy + Math.sin(t) * r, cz + Math.cos(t) * r];
  });
  return <polygon points={pts(P, list)} fill={fill} {...rest} />;
}

/** Pratt truss standing in the plane x = const, from z0 to z1, bottom chord at y. */
export function trussMembers(x, y, z0, z1, h) {
  const mid = (z0 + z1) / 2;
  const top = (z) => y + h * (1 - Math.abs(z - mid) / (mid - z0));
  const n = 6;
  const step = (z1 - z0) / n;
  const chords = [
    [[x, y, z0], [x, y, z1]],
    [[x, y, z0], [x, y + h, mid]],
    [[x, y + h, mid], [x, y, z1]],
  ];
  const webs = [];
  for (let i = 1; i < n; i++) {
    const z = z0 + i * step;
    webs.push([[x, y, z], [x, top(z), z]]);
    const zn = z + (z < mid - 1e-6 ? step : z > mid + 1e-6 ? -step : 0);
    if (zn !== z) webs.push([[x, y, z], [x, top(zn), zn]]);
  }
  return { chords, webs };
}

export function Truss({ P, x, y, z0, z1, h, c = '#6f86a3', w = 3.2 }) {
  const { chords, webs } = trussMembers(x, y, z0, z1, h);
  return (
    <g>
      {webs.map(([a, b], i) => (
        <Line key={`w${i}`} P={P} a={a} b={b} c={c} w={w * 0.55} />
      ))}
      {chords.map(([a, b], i) => (
        <Line key={`c${i}`} P={P} a={a} b={b} c={c} w={w} />
      ))}
    </g>
  );
}

/** Height of a worker's head centre for scale `k` (1 unit ≈ 1.5 m, so k 0.62 ≈ 1.75 m). */
export const headY = (k = 0.62) => 1.62 * k;

/** Voxel-style worker (matches the 3D islands): legs, torso, head and hard hat. */
export function Person({ P, x, z, k = 0.62, shirt = '#f28c28', pants = '#2c3a52', hat = '#f2b134', children }) {
  const [hx, hy] = P(x, headY(k), z);
  const r = (P(0.12, 0, 0)[0] - P(0, 0, 0)[0]) * 1.3;
  return (
    <g>
      <Box P={P} p={[x - 0.12, 0, z - 0.06]} s={[0.1, 0.47 * k * 1.6, 0.12]} c={pants} />
      <Box P={P} p={[x + 0.02, 0, z - 0.06]} s={[0.1, 0.47 * k * 1.6, 0.12]} c={pants} />
      <Box P={P} p={[x - 0.15, 0.72 * k, z - 0.09]} s={[0.3, 0.68 * k, 0.18]} c={shirt} />
      <circle cx={fmt(hx)} cy={fmt(hy)} r={fmt(r)} fill="#c99a76" />
      <path d={`M${fmt(hx - r * 1.15)} ${fmt(hy - r * 0.12)} a${fmt(r * 1.15)} ${fmt(r)} 0 0 1 ${fmt(r * 2.3)} 0 z`} fill={hat} />
      {children}
    </g>
  );
}
