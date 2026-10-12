/* Low-poly kit for the descent: islands, roads, buildings, trucks, people, labels.
   Everything is built from a handful of shared geometries and cached materials. */
import { createContext, forwardRef, useContext, useImperativeHandle, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/* ------------------------------------------------------------------ math */
export const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
export const seg = (t, a, b) => clamp01((t - a) / (b - a));
export const eo = (t) => 1 - (1 - t) ** 3;
export const eio = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const back = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
export const lerp = (a, b, t) => a + (b - a) * t;
/** 0 → 1 → 0 bump inside [a, d], flat at 1 between b and c. */
export const bump = (t, a, b, c, d) => (t < b ? seg(t, a, b) : 1 - seg(t, c, d));

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------- contexts */
/** World state written by the camera rig every frame: level, pixels-per-unit, flags. */
export const WorldCtx = createContext(null);
/** Per-island state: local clock, visibility, build-up. */
export const ChapterCtx = createContext(null);
export const useWorld = () => useContext(WorldCtx);
export const useChapter = () => useContext(ChapterCtx);

/* ------------------------------------------------------------ geometries */
const flat = (g) => {
  g.rotateX(-Math.PI / 2);
  return g;
};
export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  prism: new THREE.CylinderGeometry(0.5, 0.5, 1, 3),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  sph: new THREE.SphereGeometry(0.5, 18, 12),
  hemi: new THREE.SphereGeometry(0.5, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  ring: flat(new THREE.RingGeometry(0.9, 1, 56)),
  disc: flat(new THREE.CircleGeometry(1, 48)),
  plane: new THREE.PlaneGeometry(1, 1),
};

/* ------------------------------------------------------------- materials */
const matCache = new Map();
export function mat(color, o = {}) {
  const key = `${color}|${o.e || ''}|${o.ei ?? ''}|${o.rough ?? ''}|${o.metal ?? ''}|${o.side ?? ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.rough ?? 0.82,
      metalness: o.metal ?? 0,
      flatShading: true,
      side: o.side ?? THREE.FrontSide,
    });
    if (o.e) {
      m.emissive = new THREE.Color(o.e);
      m.emissiveIntensity = o.ei ?? 1;
    }
    matCache.set(key, m);
  }
  return m;
}

/* -------------------------------------------------------------- textures */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}
function toTexture(c, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
const texCache = {};
const once = (key, fn) => texCache[key] || (texCache[key] = fn());

export const glowTex = () =>
  once('glow', () => {
    const [c, g] = makeCanvas(128, 128);
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,.55)');
    gr.addColorStop(0.6, 'rgba(255,255,255,.12)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return toTexture(c);
  });

const windowTex = () =>
  once('win', () => {
    const [c, g] = makeCanvas(256, 256);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const gr = g.createLinearGradient(0, y * 64 + 12, 0, y * 64 + 52);
        gr.addColorStop(0, '#7f95b8');
        gr.addColorStop(1, '#b9c8de');
        g.fillStyle = gr;
        g.fillRect(x * 64 + 11, y * 64 + 12, 42, 38);
        g.fillStyle = 'rgba(0,0,0,.08)';
        g.fillRect(x * 64 + 6, y * 64 + 54, 52, 4);
      }
    return toTexture(c, { repeat: true });
  });

const litTex = () =>
  once('lit', () => {
    const [c, g] = makeCanvas(256, 256);
    g.fillStyle = '#000';
    g.fillRect(0, 0, 256, 256);
    const r = rng(7);
    g.fillStyle = '#fff';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (r() < 0.45) g.fillRect(x * 64 + 11, y * 64 + 12, 42, 38);
    return toTexture(c, { repeat: true, srgb: false });
  });

export const roadTex = () =>
  once('road', () => {
    const [c, g] = makeCanvas(256, 64);
    g.fillStyle = '#3a3f4c';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.fillRect(0, 3, 256, 3);
    g.fillRect(0, 58, 256, 3);
    g.fillStyle = '#f4e7c4';
    g.fillRect(0, 30, 128, 4);
    return toTexture(c, { repeat: true });
  });

export const ribTex = () =>
  once('rib', () => {
    const [c, g] = makeCanvas(64, 64);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(0,0,0,.16)';
    for (let x = 2; x < 64; x += 8) g.fillRect(x, 0, 2, 64);
    g.fillStyle = 'rgba(0,0,0,.2)';
    g.fillRect(0, 0, 64, 3);
    g.fillRect(0, 61, 64, 3);
    return toTexture(c, { repeat: true });
  });

export const sweepTex = () =>
  once('sweep', () => {
    const [c, g] = makeCanvas(512, 512);
    const gr = g.createConicGradient(0, 256, 256);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.72, 'rgba(255,255,255,0)');
    gr.addColorStop(0.985, 'rgba(255,255,255,.55)');
    gr.addColorStop(1, 'rgba(255,255,255,.95)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(256, 256, 254, 0, Math.PI * 2);
    g.fill();
    const fade = g.createRadialGradient(256, 256, 0, 256, 256, 256);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(0.9, 'rgba(0,0,0,.6)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = fade;
    g.fillRect(0, 0, 512, 512);
    return toTexture(c);
  });

/** Screen textures (phone, laptop) are drawn by the caller on a fresh canvas. */
export function screenTexture(w, h, draw) {
  const [c, g] = makeCanvas(w, h);
  draw(g, w, h);
  return toTexture(c);
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* ------------------------------------------------------------ primitives */
/** Box anchored at its bottom face (unless `center`). */
export function B({ p = [0, 0, 0], s = [1, 1, 1], c = '#ffffff', e, ei, m, r, center, shadow = true, ...rest }) {
  return (
    <mesh
      geometry={GEO.box}
      material={m || mat(c, { e, ei })}
      position={[p[0], center ? p[1] : p[1] + s[1] / 2, p[2]]}
      rotation={r}
      scale={s}
      castShadow={shadow}
      receiveShadow
      {...rest}
    />
  );
}

/** Cylinder anchored at its bottom; s = [diameter, height, diameter]. */
export function Cy({ p = [0, 0, 0], s = [1, 1, 1], c = '#ffffff', e, ei, m, r, g = GEO.cyl, center, ...rest }) {
  return (
    <mesh
      geometry={g}
      material={m || mat(c, { e, ei })}
      position={[p[0], center ? p[1] : p[1] + s[1] / 2, p[2]]}
      rotation={r}
      scale={s}
      castShadow
      receiveShadow
      {...rest}
    />
  );
}

export function Ball({ p = [0, 0, 0], s = 1, c = '#ffffff', e, ei, m, g = GEO.sph, ...rest }) {
  return <mesh geometry={g} material={m || mat(c, { e, ei })} position={p} scale={s} castShadow receiveShadow {...rest} />;
}

/** Soft dark disc under moving things (cheap contact shadow, also on mobile). */
const blobMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false });
export function Blob({ w = 1, d = 1, y = 0.012 }) {
  return <mesh geometry={GEO.disc} material={blobMat} position={[0, y, 0]} scale={[w / 2, 1, d / 2]} renderOrder={1} />;
}

/* ------------------------------------------------------------- build-up */
/** Grows its children out of the ground the first time the camera reaches the island. */
export function Rise({ delay = 0, dur = 0.7, all = false, children, ...props }) {
  const ch = useChapter();
  const ref = useRef();
  useFrame(() => {
    const c = ch.current;
    const g = ref.current;
    if (!g || !c.visible) return;
    const k = c.reduced ? 1 : back(seg(c.since, delay, delay + dur));
    const v = Math.max(k, 0.0001);
    if (all) g.scale.setScalar(v);
    else g.scale.set(1, v, 1);
    g.visible = k > 0.002;
  });
  return (
    <group ref={ref} {...props}>
      {children}
    </group>
  );
}

/* --------------------------------------------------------------- island */
export function Island({ w = 14, d = 14, top = '#e9e5dc', lip = '#d6d0c3', strata = ['#c8c0b0', '#9c927f', '#6c6353'], seed = 1, children }) {
  const rocks = useMemo(() => {
    const r = rng(seed);
    const list = [];
    const n = strata.length;
    const inset = 0.6 + (n - 1) * 0.9;
    const bw = w - inset * 2;
    const bd = d - inset * 2;
    for (let i = 0; i < 9; i++) {
      const sw = 1 + r() * 2.4;
      const sh = 0.8 + r() * 2.6;
      list.push({
        p: [(r() - 0.5) * (bw - sw), 0, (r() - 0.5) * (bd - sw)],
        s: [sw, sh, sw * (0.7 + r() * 0.6)],
        ry: r() * Math.PI,
        c: strata[n - 1 - Math.floor(r() * 2)],
      });
    }
    return list;
  }, [seed, w, d, strata]);
  let y = -0.62;
  const layers = strata.map((c, i) => {
    const t = 1.1 + i * 0.35;
    const inset = 0.6 + i * 0.9;
    y -= t;
    return <B key={c + i} p={[0, y, 0]} s={[w - inset * 2, t, d - inset * 2]} c={c} shadow={false} />;
  });
  return (
    <group>
      <B p={[0, -0.5, 0]} s={[w, 0.5, d]} c={top} shadow={false} />
      <B p={[0, -0.62, 0]} s={[w - 0.12, 0.12, d - 0.12]} c={lip} shadow={false} />
      {layers}
      {rocks.map((k, i) => (
        <B key={i} p={[k.p[0], y - k.s[1] + 0.05, k.p[2]]} s={k.s} r={[0, k.ry, 0]} c={k.c} shadow={false} />
      ))}
      {children}
    </group>
  );
}

/* ---------------------------------------------------------------- roads */
export function ribbonGeometry(curve, width, segments = 160, { uvPeriod = 2, y = 0 } = {}) {
  const pos = [];
  const uv = [];
  const idx = [];
  const len = curve.getLength();
  const p = new THREE.Vector3();
  const tg = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, p);
    curve.getTangentAt(t, tg);
    const l = Math.hypot(tg.x, tg.z) || 1;
    const ox = (-tg.z / l) * (width / 2);
    const oz = (tg.x / l) * (width / 2);
    pos.push(p.x + ox, p.y + y, p.z + oz, p.x - ox, p.y + y, p.z - oz);
    const u = (t * len) / uvPeriod;
    uv.push(u, 1, u, 0);
    if (i < segments) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.userData.segments = segments;
  return geo;
}

let roadMat;
export function Road({ curve, width = 1.2, y = 0.012, segments = 200 }) {
  const geo = useMemo(() => ribbonGeometry(curve, width, segments, { uvPeriod: 2, y }), [curve, width, segments, y]);
  roadMat ||= new THREE.MeshStandardMaterial({ map: roadTex(), roughness: 0.95 });
  return <mesh geometry={geo} material={roadMat} receiveShadow />;
}

/** Place an object on a curve at t, facing the direction of travel. */
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
export function placeOnCurve(obj, curve, t, lane = 0, reverse = false) {
  const u = ((t % 1) + 1) % 1;
  curve.getPointAt(u, _p);
  curve.getTangentAt(u, _t);
  if (reverse) _t.negate();
  const l = Math.hypot(_t.x, _t.z) || 1;
  obj.position.set(_p.x + (-_t.z / l) * lane, _p.y, _p.z + (_t.x / l) * lane);
  obj.rotation.set(0, Math.atan2(_t.x, _t.z), 0);
}

/* ------------------------------------------------------------ buildings */
const bCache = new Map();
function sideMat(color, width, h, lit, glow) {
  const cols = Math.max(1, Math.round(width / 0.55));
  const rows = Math.max(1, Math.round(h / 0.62));
  const key = `${color}|${cols}|${rows}|${lit}|${glow}`;
  let m = bCache.get(key);
  if (!m) {
    const map = windowTex().clone();
    map.repeat.set(cols / 4, rows / 4);
    map.needsUpdate = true;
    m = new THREE.MeshStandardMaterial({ color, map, roughness: 0.7, flatShading: true });
    if (lit > 0) {
      const em = litTex().clone();
      em.repeat.set(cols / 4, rows / 4);
      em.needsUpdate = true;
      m.emissive = new THREE.Color(glow);
      m.emissiveMap = em;
      m.emissiveIntensity = lit;
    }
    bCache.set(key, m);
  }
  return m;
}

export function Building({ p = [0, 0, 0], w = 1.4, d = 1.4, h = 2, c = '#f1eee7', roof = '#d9d4ca', lit = 0, glow = '#ffcf8a', top = true, ry = 0 }) {
  const mats = useMemo(() => {
    const sx = sideMat(c, d, h, lit, glow);
    const sz = sideMat(c, w, h, lit, glow);
    const r = mat(roof);
    return [sx, sx, r, r, sz, sz];
  }, [c, w, d, h, lit, glow, roof]);
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <mesh geometry={GEO.box} material={mats} position={[0, h / 2, 0]} scale={[w, h, d]} castShadow receiveShadow />
      <B p={[0, h, 0]} s={[w + 0.06, 0.08, d + 0.06]} c={roof} />
      {top && w > 0.9 && (
        <>
          <B p={[w * 0.18, h + 0.08, -d * 0.15]} s={[0.32, 0.22, 0.28]} c="#c9c4ba" />
          <B p={[-w * 0.2, h + 0.08, d * 0.12]} s={[0.22, 0.14, 0.22]} c="#bfbab0" />
        </>
      )}
    </group>
  );
}

export function Warehouse({ p = [0, 0, 0], w = 3, d = 2, h = 1.2, c = '#eceae4', roof = '#9aa4b5', door = '#4a5262', ry = 0, docks = 3 }) {
  const teeth = Math.max(2, Math.round(w / 0.9));
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <B s={[w, h, d]} c={c} />
      {Array.from({ length: teeth }, (_, i) => (
        <mesh
          key={i}
          geometry={GEO.prism}
          material={mat(roof)}
          position={[-w / 2 + (w / teeth) * (i + 0.5), h + 0.115, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[(w / teeth) * 0.62, d, 0.46]}
          castShadow
        />
      ))}
      {Array.from({ length: docks }, (_, i) => (
        <B key={i} p={[-w / 2 + (w / docks) * (i + 0.5), 0, d / 2 + 0.01]} s={[(w / docks) * 0.62, h * 0.62, 0.04]} c={door} />
      ))}
    </group>
  );
}

export function Tree({ p = [0, 0, 0], s = 1, c = '#5f9a6a' }) {
  return (
    <group position={p} scale={s}>
      <Cy s={[0.12, 0.35, 0.12]} c="#7b5b45" g={GEO.cyl8} />
      <Ball p={[0, 0.62, 0]} s={[0.62, 0.72, 0.62]} c={c} g={GEO.ico} />
    </group>
  );
}

export function Container({ p = [0, 0, 0], c = '#c8553d', ry = 0, ...rest }) {
  const m = useMemo(() => containerMat(c), [c]);
  return <B p={p} s={[0.78, 0.78, 1.7]} m={m} r={[0, ry, 0]} {...rest} />;
}
const cMats = new Map();
export function containerMat(c) {
  if (!cMats.has(c)) {
    const map = ribTex().clone();
    map.repeat.set(2, 1);
    map.needsUpdate = true;
    cMats.set(c, new THREE.MeshStandardMaterial({ color: c, map, roughness: 0.75, flatShading: true }));
  }
  return cMats.get(c);
}

export function Pin({ p = [0, 0, 0], c = '#2ad1b8', s = 1 }) {
  return (
    <group position={p} scale={s}>
      <mesh geometry={GEO.cone} material={mat(c, { e: c, ei: 0.35 })} position={[0, 0.42, 0]} rotation={[Math.PI, 0, 0]} scale={[0.36, 0.7, 0.36]} castShadow />
      <Ball p={[0, 0.86, 0]} s={0.5} c={c} e={c} ei={0.35} />
      <Ball p={[0, 0.86, 0.2]} s={0.2} c="#ffffff" />
    </group>
  );
}

/* --------------------------------------------------------------- truck */
const _wp = new THREE.Vector3();
/** Forward is +Z. Children ride on the bed (bed top at y = 0.34). */
export const Truck = forwardRef(function Truck({ cab = '#f4f1ea', cargo = '#24365e', kind = 'box', children, scale = 1, ...props }, ref) {
  const root = useRef();
  const wheels = useRef([]);
  const st = useRef({ last: null, spin: 0 });
  useImperativeHandle(ref, () => root.current);
  useFrame(() => {
    const g = root.current;
    if (!g) return;
    g.getWorldPosition(_wp);
    const s = st.current;
    if (s.last) {
      const dist = _wp.distanceTo(s.last);
      if (dist < 1) s.spin += dist / (0.17 * scale);
      s.last.copy(_wp);
    } else s.last = _wp.clone();
    for (const w of wheels.current) if (w) w.rotation.x = s.spin;
  });
  const wz = kind === 'tractor' ? [0.62, -0.1] : [0.72, -0.38, -0.72];
  return (
    <group ref={root} scale={scale} {...props}>
      <Blob w={1.1} d={2.5} />
      <B p={[0, 0.16, -0.05]} s={[0.66, 0.1, kind === 'tractor' ? 1.3 : 2.1]} c="#2a2f3a" />
      {wz.map((z) =>
        [-0.33, 0.33].map((x) => (
          <group key={`${x}${z}`} position={[x, 0.17, z]} ref={(el) => el && !wheels.current.includes(el) && wheels.current.push(el)}>
            <mesh geometry={GEO.cyl} material={mat('#1b1e25')} rotation={[0, 0, Math.PI / 2]} scale={[0.34, 0.14, 0.34]} castShadow />
            <mesh geometry={GEO.box} material={mat('#c9ced8')} position={[x > 0 ? 0.072 : -0.072, 0, 0]} scale={[0.01, 0.12, 0.06]} />
          </group>
        )),
      )}
      {/* cab */}
      <B p={[0, 0.22, 0.78]} s={[0.72, 0.6, 0.52]} c={cab} />
      <B p={[0, 0.22, 0.95]} s={[0.74, 0.16, 0.22]} c="#2a2f3a" />
      <B p={[0, 0.53, 1.045]} s={[0.6, 0.22, 0.02]} c="#1b2433" e="#3b5a86" ei={0.25} />
      <B p={[0.25, 0.36, 1.045]} s={[0.12, 0.06, 0.02]} c="#fff6d8" e="#fff1c2" ei={1.2} />
      <B p={[-0.25, 0.36, 1.045]} s={[0.12, 0.06, 0.02]} c="#fff6d8" e="#fff1c2" ei={1.2} />
      <B p={[0, 0.82, 0.74]} s={[0.66, 0.06, 0.4]} c={cargo} />
      {kind === 'box' && (
        <>
          <B p={[0, 0.24, -0.38]} s={[0.76, 0.78, 1.5]} c={cargo} />
          <B p={[0, 1.02, -0.38]} s={[0.78, 0.04, 1.52]} c="#ffffff" />
          <B p={[0.385, 0.5, -0.38]} s={[0.01, 0.16, 1.2]} c="#ffffff" />
          <B p={[-0.385, 0.5, -0.38]} s={[0.01, 0.16, 1.2]} c="#ffffff" />
        </>
      )}
      {kind === 'tanker' && <Cy p={[0, 0.42, -0.38]} s={[0.66, 1.4, 0.66]} r={[Math.PI / 2, 0, 0]} c={cargo} center />}
      <group position={[0, 0.26, -0.38]}>{children}</group>
    </group>
  );
});

export function Car({ c = '#e5574f', ...props }) {
  return (
    <group {...props}>
      <Blob w={0.8} d={1.4} />
      <B p={[0, 0.1, 0]} s={[0.56, 0.24, 1.1]} c={c} />
      <B p={[0, 0.34, -0.06]} s={[0.48, 0.2, 0.6]} c="#1b2433" e="#2b4466" ei={0.2} />
      <B p={[0, 0.54, -0.06]} s={[0.5, 0.03, 0.56]} c={c} />
      <B p={[0.18, 0.18, 0.555]} s={[0.1, 0.05, 0.01]} c="#fff" e="#fff1c2" ei={1} />
      <B p={[-0.18, 0.18, 0.555]} s={[0.1, 0.05, 0.01]} c="#fff" e="#fff1c2" ei={1} />
      {[0.34, -0.34].map((z) => (
        <B key={z} p={[0, 0.02, z]} s={[0.6, 0.16, 0.2]} c="#1b1e25" />
      ))}
    </group>
  );
}

/* --------------------------------------------------------------- people */
/** Forward is +Z. `walk()` returns 0..1 stride amplitude, `wave()` raises the right arm. */
export const Person = forwardRef(function Person({ shirt = '#2ad1b8', pants = '#2a3242', skin = '#c99a76', hair = '#2b2420', hat, walk, wave, speed = 9, phase = 0, children, ...props }, ref) {
  const root = useRef();
  const legL = useRef();
  const legR = useRef();
  const armL = useRef();
  const armR = useRef();
  const body = useRef();
  const world = useWorld();
  const shirtMat = useMemo(() => new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85, flatShading: true }), [shirt]);
  useImperativeHandle(ref, () => {
    const g = root.current;
    if (g) g.userData.shirt = shirtMat;
    return g;
  });
  useFrame((state) => {
    const still = world?.current.reduced;
    const a = walk && !still ? walk() : 0;
    const w = wave ? wave() : 0;
    const t = state.clock.elapsedTime * speed + phase;
    const sw = Math.sin(t) * 0.7 * a;
    if (legL.current) legL.current.rotation.x = sw;
    if (legR.current) legR.current.rotation.x = -sw;
    if (armL.current) armL.current.rotation.x = -sw * 0.8;
    if (armR.current) armR.current.rotation.x = sw * 0.8 * (1 - w) - 1.25 * w + Math.sin(t * 1.4) * 0.25 * w;
    if (body.current) body.current.position.y = Math.abs(Math.cos(t)) * 0.035 * a;
  });
  return (
    <group ref={root} {...props}>
      <Blob w={0.5} d={0.5} />
      <group ref={body}>
        <group ref={legL} position={[-0.075, 0.36, 0]}>
          <B p={[0, -0.36, 0]} s={[0.11, 0.36, 0.13]} c={pants} />
        </group>
        <group ref={legR} position={[0.075, 0.36, 0]}>
          <B p={[0, -0.36, 0]} s={[0.11, 0.36, 0.13]} c={pants} />
        </group>
        <B p={[0, 0.34, 0]} s={[0.32, 0.38, 0.2]} m={shirtMat} />
        <group ref={armL} position={[-0.215, 0.69, 0]}>
          <B p={[0, -0.31, 0]} s={[0.09, 0.31, 0.11]} m={shirtMat} />
        </group>
        <group ref={armR} position={[0.215, 0.69, 0]}>
          <B p={[0, -0.31, 0]} s={[0.09, 0.31, 0.11]} m={shirtMat} />
        </group>
        <Ball p={[0, 0.86, 0]} s={0.26} c={skin} />
        {hat === 'hard' ? (
          <group position={[0, 0.9, 0]}>
            <mesh geometry={GEO.hemi} material={mat('#f2b134')} scale={[0.3, 0.26, 0.3]} castShadow />
            <Cy s={[0.36, 0.02, 0.36]} c="#f2b134" />
          </group>
        ) : (
          <mesh geometry={GEO.hemi} material={mat(hair)} position={[0, 0.875, -0.01]} scale={[0.275, 0.22, 0.275]} />
        )}
        {children}
      </group>
    </group>
  );
});

/* ---------------------------------------------------------------- glows */
/** Additive halo, sized in world units. `vis()` → 0..1. */
export function Glow({ color = '#2ad1b8', size = 2, vis, pulse = 0, ...props }) {
  const ref = useRef();
  const material = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: glowTex(),
        color,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
      }),
    [color],
  );
  useFrame((state) => {
    const v = vis ? vis() : 1;
    const k = 1 + Math.sin(state.clock.elapsedTime * 3) * pulse;
    ref.current.scale.setScalar(size * k * (0.4 + 0.6 * v));
    material.opacity = v;
    ref.current.visible = v > 0.01;
  });
  return <sprite ref={ref} material={material} {...props} />;
}

/** Ground ripple that loops from the centre outwards. */
export function Pulse({ color = '#2ad1b8', radius = 1.6, period = 2, delay = 0, vis, y = 0.03, ...props }) {
  const ch = useChapter();
  const ref = useRef();
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, toneMapped: false }), [color]);
  useFrame(() => {
    const c = ch.current;
    if (!c.visible) return;
    const v = vis ? vis() : 1;
    const t = c.t - delay;
    const f = t < 0 ? 0 : (t % period) / period;
    ref.current.scale.setScalar(0.1 + eo(f) * radius);
    material.opacity = (1 - f) * 0.85 * v * (t < 0 ? 0 : 1);
  });
  return <mesh ref={ref} geometry={GEO.ring} material={material} position={[0, y, 0]} renderOrder={2} {...props} />;
}

/* --------------------------------------------------------------- labels */
const labelCache = new Map();
function drawCheck(g, cx, cy, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#04130f';
  g.lineWidth = r * 0.32;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(cx - r * 0.45, cy + r * 0.02);
  g.lineTo(cx - r * 0.1, cy + r * 0.38);
  g.lineTo(cx + r * 0.5, cy - r * 0.34);
  g.stroke();
}
function labelTexture({ text, sub, accent, check, light }) {
  const key = `${text}|${sub}|${accent}|${check}|${light}`;
  if (labelCache.has(key)) return labelCache.get(key);
  const S = 3;
  const fMain = `600 ${15 * S}px "IBM Plex Sans", system-ui, sans-serif`;
  const fSub = `500 ${11.5 * S}px "IBM Plex Mono", ui-monospace, monospace`;
  const [, m] = makeCanvas(8, 8);
  m.font = fMain;
  const tw = m.measureText(text).width;
  m.font = fSub;
  const sw = sub ? m.measureText(sub).width : 0;
  const pad = 13 * S;
  const icon = 18 * S;
  const h = (sub ? 50 : 32) * S;
  const tip = 6 * S;
  const w = Math.ceil(pad + icon + 9 * S + Math.max(tw, sw) + pad);
  const [c, g] = makeCanvas(w, h + tip);
  const bg = light ? 'rgba(255,255,255,.96)' : 'rgba(11,13,18,.9)';
  g.fillStyle = bg;
  roundRect(g, 1.5 * S, 1.5 * S, w - 3 * S, h - 3 * S, sub ? 12 * S : (h - 3 * S) / 2);
  g.fill();
  g.strokeStyle = light ? 'rgba(0,0,0,.12)' : `${accent}88`;
  g.lineWidth = 1.5 * S;
  g.stroke();
  g.beginPath();
  g.moveTo(w / 2 - tip, h - 2 * S);
  g.lineTo(w / 2, h + tip - 2 * S);
  g.lineTo(w / 2 + tip, h - 2 * S);
  g.closePath();
  g.fillStyle = bg;
  g.fill();
  const cy = h / 2;
  const cx = pad + icon / 2;
  if (check) drawCheck(g, cx, cy, icon / 2, accent);
  else {
    g.fillStyle = `${accent}40`;
    g.beginPath();
    g.arc(cx, cy, icon / 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = accent;
    g.beginPath();
    g.arc(cx, cy, icon / 4.2, 0, Math.PI * 2);
    g.fill();
  }
  const tx = pad + icon + 9 * S;
  g.textBaseline = 'middle';
  g.fillStyle = light ? '#0b0d12' : '#f3f2ee';
  g.font = fMain;
  g.fillText(text, tx, sub ? h / 2 - 8 * S : h / 2 + 0.5 * S);
  if (sub) {
    g.font = fSub;
    g.fillStyle = light ? 'rgba(11,13,18,.62)' : 'rgba(236,235,230,.66)';
    g.fillText(sub, tx, h / 2 + 10 * S);
  }
  const tex = toTexture(c);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const out = { tex, aspect: w / (h + tip), css: (h + tip) / S };
  labelCache.set(key, out);
  return out;
}

/** Floating UI chip, constant size on screen, pops with an overshoot. Anchored by its pointer tip. */
export function Label({ text, sub, accent = '#2ad1b8', check, light, vis, ...props }) {
  const world = useWorld();
  const ch = useChapter();
  const ref = useRef();
  const compact = world.current.compact;
  const { tex, aspect, css } = useMemo(
    () => labelTexture({ text, sub: compact ? undefined : sub, accent, check, light }),
    [text, sub, accent, check, light, compact],
  );
  const material = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }),
    [tex],
  );
  useFrame(() => {
    const sp = ref.current;
    if (!sp || (ch && !ch.current.visible)) return;
    const raw = clamp01(vis ? vis() : ch ? ch.current.on : 1);
    const v = ch && !ch.current.armed ? 0 : raw;
    const k = Math.max(back(v), 0.0001);
    const h = (css * world.current.labelScale) / world.current.ppu;
    sp.scale.set(h * aspect * k, h * k, 1);
    material.opacity = clamp01(v * 1.6);
    sp.visible = v > 0.01;
  });
  return <sprite ref={ref} material={material} center={[0.5, 0]} renderOrder={30} {...props} />;
}
