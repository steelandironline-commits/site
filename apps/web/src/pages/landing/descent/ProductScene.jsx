/* Product section: a small living city where the agents work. Every event in
   the activity feed beside it becomes a flight + a pop-out over a company. */
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Ball, Cy, GEO, Glow, Island, Label, Rise, Tree, ChapterCtx, WorldCtx, bump, clamp01, damp, eo, mat, sweepTex } from './kit.jsx';
import { Company } from './islands.jsx';

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

function Hub() {
  const sweep = useRef();
  const dish = useRef();
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map: sweepTex(), color: '#13b8a2', transparent: true, depthWrite: false, toneMapped: false }), []);
  useFrame((state) => {
    const th = state.clock.elapsedTime * 1.05;
    sweep.current.rotation.y = -th;
    dish.current.rotation.y = -th - Math.PI / 2;
  });
  return (
    <>
      {[2.3, 4.2, 6.0].map((r) => (
        <mesh key={r} geometry={GEO.ring} material={mat('#9cc9c1')} position={[0, 0.01, 0]} scale={[r, 1, r]} />
      ))}
      <mesh ref={sweep} geometry={GEO.disc} material={material} position={[0, 0.02, 0]} scale={[6.2, 1, 6.2]} renderOrder={1} />
      <Rise delay={0.05} dur={0.8}>
        <Cy s={[2.2, 0.3, 2.2]} c="#dfe9e7" />
        <Cy p={[0, 0.3, 0]} s={[1.2, 0.9, 1.2]} c="#24365e" />
        <Cy p={[0, 1.0, 0]} s={[1.24, 0.1, 1.24]} c="#2ad1b8" e="#2ad1b8" ei={0.8} />
        <Cy p={[0, 1.2, 0]} s={[0.2, 1.1, 0.2]} c="#c9d3e0" />
      </Rise>
      <group ref={dish} position={[0, 2.35, 0]}>
        <Rise delay={0.35} all>
          <group rotation={[-0.95, 0, 0]}>
            <mesh geometry={GEO.hemi} material={mat('#f3f6f9', { side: THREE.DoubleSide })} rotation={[Math.PI, 0, 0]} scale={[1.7, 0.62, 1.7]} />
            <Ball p={[0, 0.6, 0]} s={0.15} c="#2ad1b8" e="#2ad1b8" ei={1.4} />
          </group>
        </Rise>
      </group>
      <Glow color="#2ad1b8" size={2.2} position={[0, 2.5, 0]} pulse={0.2} />
    </>
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
  const accent = ACCENT[pop.type] || '#2ad1b8';
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
        check={pop.type === 'OPPORTUNITY'}
        position={at}
        vis={() => bump(age(), site ? 0.55 : 0, site ? 0.85 : 0.3, life - 0.35, life)}
      />
    </>
  );
}

function City() {
  return (
    <Island w={13} d={13} top="#e5efec" lip="#c9dcd7" strata={['#a9d1c9', '#5f9d93', '#2f6660']} seed={91}>
      <Hub />
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
  const pointer = useRef({ x: 0, y: 0 });
  const [pops, setPops] = useState([]);
  const turn = useRef(0);

  useEffect(() => {
    if (!latest) return;
    const hub = latest.type === 'SEARCH';
    turn.current = (turn.current + 1) % ORDER.length;
    const pop = {
      id: `${latest.id}:${Date.now()}`,
      site: hub ? -1 : ORDER[turn.current],
      type: latest.type,
      text: latest.title,
      sub: latest.description || latest.source,
      t0: now(),
      end: now() + POP_LIFE,
    };
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
            <City />
            {pops.map((p) => (
              <Pop key={p.id} pop={p} compact={mobile} />
            ))}
          </Stage>
        </WorldCtx.Provider>
      </Canvas>
    </div>
  );
}
