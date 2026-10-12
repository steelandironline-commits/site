/* Product section: a small living city where the agents work. Every event in
   the activity feed beside it becomes a flight + a pop-out over a company. */
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Ball, Cy, GEO, Glow, Island, Label, Rise, Tree, ChapterCtx, WorldCtx, bump, clamp01, damp, eo } from './kit.jsx';
import { BrandTile, Company } from './islands.jsx';
import { KIND_STYLE, eventKind } from '../../../lib/eventKind.js';

const SITES = [
  { kind: 'factory', angle: 0.35, h: 2.2 },
  { kind: 'office', angle: 1.4, h: 3.1 },
  { kind: 'warehouse', angle: 2.45, h: 1.5 },
  { kind: 'store', angle: 3.5, h: 1.2 },
  { kind: 'site', angle: 4.55, h: 2.7 },
  { kind: 'silo', angle: 5.6, h: 2.0 },
].map((s) => ({ ...s, x: Math.cos(s.angle) * 4.6, z: Math.sin(s.angle) * 4.6 }));

export const ACCENT = { SEARCH: '#8fb2ff', RESEARCH: '#9ff5e6', SIGNAL: '#ffb35c', AGENT: '#b69bff', OPPORTUNITY: '#5fe39a', SYSTEM: '#8fb2ff', PAYMENT: '#4fe0c9' };
const now = () => performance.now() / 1000;
const POP_LIFE = 3.0;
/** Consecutive events land on opposite sides of the island, so pop-outs never pile up. */
const ORDER = [0, 3, 1, 4, 2, 5];

function Stage({ reduced, children }) {
  const st = useRef({ t: 0, since: 0, armed: true, visible: true, on: 1, reduced });
  st.current.reduced = reduced;
  useFrame((s) => {
    st.current.t = s.clock.elapsedTime;
    st.current.since = s.clock.elapsedTime;
  }, -1);
  return <ChapterCtx.Provider value={st}>{children}</ChapterCtx.Provider>;
}

function Rig({ pointer }) {
  const { camera, size } = useThree();
  const world = useContext(WorldCtx);
  const look = useMemo(() => new THREE.Vector3(0, 1.1, 0), []);
  const p = useRef({ x: 0, y: 0 });
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.25);
    p.current.x = damp(p.current.x, pointer.current.x, 2.5, dt);
    p.current.y = damp(p.current.y, pointer.current.y, 2.5, dt);
    const t = world.current.reduced ? 0 : state.clock.elapsedTime;
    const az = Math.PI / 4 + Math.sin(t * 0.12) * 0.22 + p.current.x * 0.18;
    const el = 0.62 - p.current.y * 0.06;
    const tanH = Math.tan((camera.fov * Math.PI) / 360);
    const D = Math.max(13.5 / (2 * tanH), 18.5 / (2 * tanH * (size.width / size.height)));
    camera.position.set(look.x + D * Math.cos(el) * Math.sin(az), look.y + D * Math.sin(el), look.z + D * Math.cos(el) * Math.cos(az));
    camera.lookAt(look);
    world.current.ppu = size.height / (2 * D * tanH);
  }, -2);
  return null;
}

/** TemPix hub at the centre (no radar): base, tower and the floating brand tile. */
function Hub() {
  return (
    <>
      <Rise delay={0.05} dur={0.8}>
        <Cy s={[2.2, 0.3, 2.2]} c="#dfe9e7" />
        <Cy p={[0, 0.3, 0]} s={[1.2, 1.2, 1.2]} c="#24365e" />
        <Cy p={[0, 1.5, 0]} s={[1.24, 0.12, 1.24]} c="#2ad1b8" e="#2ad1b8" ei={0.8} />
      </Rise>
      <BrandTile position={[0, 2.55, 0]} />
      <Glow color="#2ad1b8" size={2.6} position={[0, 2.55, -0.2]} pulse={0.2} />
    </>
  );
}

/**
 * Animated chevrons on the ground (› › ›) from the hub to every company.
 * They march softly all the time and light up in the event's colour when an
 * agent heads to that company.
 */
const STEPS_PER_LANE = 4;
function Lanes({ active }) {
  const lanes = useMemo(
    () =>
      SITES.map((site) => {
        const dir = new THREE.Vector2(site.x, site.z).normalize();
        const yaw = Math.atan2(dir.x, dir.y);
        return Array.from({ length: STEPS_PER_LANE }, (_, i) => {
          const d = 1.5 + i * 0.72;
          return { pos: [dir.x * d, 0.03, dir.y * d], yaw, material: new THREE.MeshBasicMaterial({ color: '#2ad1b8', transparent: true, depthWrite: false, toneMapped: false }) };
        });
      }),
    [],
  );
  const base = useMemo(() => new THREE.Color('#2ad1b8'), []);
  const hot = useMemo(() => new THREE.Color(), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    lanes.forEach((lane, li) => {
      const a = active.current[li];
      const age = a ? now() - a.t0 : 9;
      const firing = age < 1.6;
      if (firing) hot.set(a.color);
      lane.forEach((c, i) => {
        // a light that runs outwards: soft and slow at rest, bright and fast when firing
        const phase = firing ? age * 3.2 - i * 0.35 : (t * 0.9 - i * 0.28 + li * 0.17) % 1.4;
        const wave = firing ? Math.max(0, 1 - Math.abs(phase - 0.5) * 1.6) : Math.max(0, 1 - Math.abs(phase - 0.5) * 2);
        c.material.color.copy(firing ? hot : base);
        c.material.opacity = firing ? 0.25 + 0.75 * wave : 0.12 + 0.35 * wave;
      });
    });
  });
  return lanes.map((lane, li) =>
    lane.map((c, i) => (
      <group key={`${li}-${i}`} position={c.pos} rotation={[0, c.yaw, 0]}>
        {/* "›" pointing away from the hub: arms meet at the front */}
        <mesh geometry={GEO.box} material={c.material} position={[0.17, 0, 0.17]} rotation={[0, -Math.PI / 4, 0]} scale={[0.09, 0.02, 0.55]} renderOrder={2} />
        <mesh geometry={GEO.box} material={c.material} position={[-0.17, 0, 0.17]} rotation={[0, Math.PI / 4, 0]} scale={[0.09, 0.02, 0.55]} renderOrder={2} />
      </group>
    )),
  );
}

/** One feed event: an agent flies from the radar to a company, which ripples, then the pop-out. */
function Pop({ pop, compact }) {
  const life = pop.end - pop.t0;
  const site = pop.site >= 0 ? SITES[pop.site] : null;
  const to = site ? [site.x, site.h + 0.25, site.z] : [0, 3.1, 0];
  const arc = useMemo(() => new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 2.5, 0), new THREE.Vector3(to[0] * 0.5, 5.2, to[2] * 0.5), new THREE.Vector3(...to)), [to[0], to[1], to[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  const orb = useRef();
  const ring = useRef();
  const accent = pop.color;
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: accent, transparent: true, depthWrite: false, toneMapped: false }), [accent]);
  const age = () => now() - pop.t0;
  useFrame(() => {
    const a = age();
    if (orb.current) {
      const k = clamp01(a / 0.7);
      orb.current.visible = k > 0 && k < 1;
      arc.getPoint(eo(k), orb.current.position);
    }
    if (ring.current) {
      const f = clamp01((a - 0.6) / 1.3);
      ring.current.scale.setScalar(0.2 + eo(f) * 2);
      ringMat.opacity = a < 0.6 ? 0 : (1 - f) * 0.85;
    }
  });
  // Pull the pop-out toward the middle so it stays inside the frame (more on phones).
  const pull = compact ? 0.18 : 0.62;
  const at = site ? [to[0] * pull, to[1] + 0.2, to[2] * pull] : to;
  return (
    <>
      {site && <Ball ref={orb} s={0.22} c="#ffffff" e={accent} ei={2} visible={false} />}
      {site && <mesh ref={ring} geometry={GEO.ring} material={ringMat} position={[to[0], 0.05, to[2]]} renderOrder={3} />}
      <Label
        text={pop.text}
        sub={compact ? undefined : pop.sub}
        accent={accent}
        check={pop.type === 'OPPORTUNITY' || pop.kind === 'contract'}
        position={at}
        vis={() => bump(age(), site ? 0.55 : 0, site ? 0.85 : 0.3, life - 0.35, life)}
      />
    </>
  );
}

function City({ active }) {
  return (
    <Island w={13} d={13} top="#e5efec" lip="#c9dcd7" strata={['#a9d1c9', '#5f9d93', '#2f6660']} seed={91}>
      <Hub />
      <Lanes active={active} />
      {SITES.map((s, i) => (
        <group key={s.kind} position={[s.x, 0, s.z]}>
          <Rise delay={0.2 + i * 0.08}>
            <group rotation={[0, Math.atan2(-s.x, -s.z), 0]}>
              <Company kind={s.kind} />
            </group>
          </Rise>
        </group>
      ))}
      {[
        [-1.6, 5.6],
        [5.6, -1.4],
        [-5.6, 2.2],
        [2.4, 5.6],
        [-3.0, -5.6],
      ].map(([x, z]) => (
        <Rise key={`${x}${z}`} delay={0.7} all>
          <Tree p={[x, 0, z]} s={0.8} c="#4f9a86" />
        </Rise>
      ))}
    </Island>
  );
}

export default function ProductScene({ latest, mobile, reduced, running }) {
  const world = useRef({ level: 0, ppu: 30, labelScale: mobile ? 0.8 : 0.92, compact: mobile, reduced });
  world.current.reduced = reduced;
  world.current.compact = mobile;
  world.current.labelScale = mobile ? 0.8 : 0.92;
  const pointer = useRef({ x: 0, y: 0 });
  const [pops, setPops] = useState([]);
  const turn = useRef(0);
  const active = useRef([]);

  useEffect(() => {
    if (!latest) return;
    const hub = latest.type === 'SEARCH';
    turn.current = (turn.current + 1) % ORDER.length;
    const kind = eventKind(latest);
    const pop = {
      id: `${latest.id}:${Date.now()}`,
      site: hub ? -1 : ORDER[turn.current],
      type: latest.type,
      kind,
      color: kind ? KIND_STYLE[kind].color : ACCENT[latest.type] || '#2ad1b8',
      text: latest.title,
      sub: latest.description || latest.source,
      t0: now(),
      end: now() + POP_LIFE,
    };
    if (pop.site >= 0) active.current[pop.site] = { t0: pop.t0, color: pop.color };
    // On phones only one pop-out at a time: the previous one bows out quickly.
    setPops((list) => [
      ...list.filter((p) => now() < p.end).map((p) => (mobile ? { ...p, end: Math.min(p.end, now() + 0.35) } : p)),
      pop,
    ].slice(-2));
  }, [latest, mobile]);

  return (
    <div
      style={{ position: 'absolute', inset: 0 }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return;
        const r = e.currentTarget.getBoundingClientRect();
        pointer.current.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        pointer.current.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      }}
    >
      <Canvas
        dpr={mobile ? [1, 1.5] : [1, 1.75]}
        camera={{ fov: 28, position: [20, 16, 20], near: 1, far: 200 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        frameloop={running ? 'always' : 'never'}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.toneMapping = THREE.NeutralToneMapping;
        }}
      >
        <WorldCtx.Provider value={world}>
          <Stage reduced={reduced}>
            <hemisphereLight args={['#c4fff6', '#0d3236', 1.3]} />
            <ambientLight intensity={0.25} />
            <directionalLight position={[9, 16, 5]} intensity={2} color="#fff4e2" />
            <Rig pointer={pointer} />
            <City active={active} />
            {pops.map((p) => (
              <Pop key={p.id} pop={p} compact={mobile} />
            ))}
          </Stage>
        </WorldCtx.Provider>
      </Canvas>
    </div>
  );
}
