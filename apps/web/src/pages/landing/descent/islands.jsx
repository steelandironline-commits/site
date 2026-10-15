/* The seven islands. Each one is composed for a camera looking from +x/+z,
   and runs its own looping timeline (seconds since the camera arrived). */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { drawBRLCanvasText } from '../../../components/brand/BRLIcon.jsx';
import {
  B,
  Ball,
  Building,
  Car,
  Container,
  Cy,
  GEO,
  Glow,
  Island,
  Label,
  Person,
  Pin,
  Pulse,
  Rise,
  Road,
  Tree,
  Truck,
  Warehouse,
  back,
  bump,
  clamp01,
  containerMat,
  eio,
  eo,
  lerp,
  mat,
  placeOnCurve,
  ribbonGeometry,
  rng,
  roundRect,
  screenTexture,
  seg,
  sweepTex,
  useChapter,
} from './kit.jsx';

const ONE = () => 1;
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

function roundedLoop(hw, hd, r) {
  const pts = [];
  const corners = [
    [hw - r, hd - r, 0],
    [-(hw - r), hd - r, Math.PI / 2],
    [-(hw - r), -(hd - r), Math.PI],
    [hw - r, -(hd - r), 1.5 * Math.PI],
  ];
  for (const [cx, cz, a0] of corners)
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      pts.push(v3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r));
    }
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal');
}

function circleCurve(r) {
  const pts = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    pts.push(v3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal');
}

/** Ping-pong walker between a and b at speed v (units/s). */
function walkBetween(obj, a, b, T, v, phase = 0) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const f = (((T * v + phase) / L) % 2 + 2) % 2;
  const k = f < 1 ? f : 2 - f;
  obj.position.set(lerp(a[0], b[0], k), 0, lerp(a[1], b[1], k));
  const dx = (b[0] - a[0]) * (f < 1 ? 1 : -1);
  const dz = (b[1] - a[1]) * (f < 1 ? 1 : -1);
  obj.rotation.y = Math.atan2(dx, dz);
}

/** Move obj from a to b over [t0, t1], facing the motion. Returns progress. */
function walkTo(obj, a, b, t, t0, t1) {
  const k = eio(seg(t, t0, t1));
  obj.position.set(lerp(a[0], b[0], k), 0, lerp(a[1], b[1], k));
  if (t > t0 && t < t1) obj.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
  return k;
}

function House({ p, ry = 0, c = '#f3efe7', roof = '#c46a4a' }) {
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <B s={[0.9, 0.6, 1]} c={c} />
      <mesh geometry={GEO.prism} material={mat(roof)} position={[0, 0.6 + 0.11, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.16, 1.08, 0.44]} castShadow />
      <B p={[0, 0, 0.505]} s={[0.22, 0.36, 0.02]} c="#5a4636" />
    </group>
  );
}

function Bench({ p, ry = 0 }) {
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <B p={[0, 0.14, 0]} s={[0.7, 0.05, 0.22]} c="#9b7653" />
      <B p={[0, 0.14, -0.1]} s={[0.7, 0.2, 0.04]} c="#9b7653" />
      <B s={[0.05, 0.14, 0.18]} p={[-0.3, 0, 0]} c="#3a3f4c" />
      <B s={[0.05, 0.14, 0.18]} p={[0.3, 0, 0]} c="#3a3f4c" />
    </group>
  );
}

function Lamp({ p }) {
  return (
    <group position={p}>
      <Cy s={[0.05, 0.9, 0.05]} c="#3a3f4c" g={GEO.cyl8} />
      <Ball p={[0, 0.94, 0]} s={0.13} c="#fff3cf" e="#ffe2a0" ei={1.2} />
    </group>
  );
}

/** The TemPix mark as a floating 2.5D tile: navy base, teal top, dark check. */
function BrandTile(props) {
  const ch = useChapter();
  const ref = useRef();
  useFrame((state) => {
    const c = ch.current;
    if (!c.visible || !ref.current) return;
    const T = c.reduced ? 0 : state.clock.elapsedTime;
    ref.current.rotation.y = Math.PI / 4 + Math.sin(T * 0.8) * 0.35;
    ref.current.position.y = props.position[1] + Math.sin(T * 1.6) * 0.08;
    const k = c.reduced ? 1 : back(seg(c.since, 0.6, 1.3));
    ref.current.scale.setScalar(Math.max(k, 0.0001));
  });
  return (
    <group ref={ref} userData={{ rigid: true }} {...props}>
      <B p={[0, -0.12, -0.1]} s={[1.05, 1.05, 0.22]} r={[0, 0, Math.PI / 4]} c="#1c2a45" center />
      <B s={[1.05, 1.05, 0.24]} r={[0, 0, Math.PI / 4]} c="#2ad1b8" e="#2ad1b8" ei={0.35} center />
      <B p={[-0.17, -0.07, 0.13]} s={[0.36, 0.13, 0.04]} r={[0, 0, -Math.PI / 4]} c="#04201b" center />
      <B p={[0.12, 0.01, 0.13]} s={[0.62, 0.13, 0.04]} r={[0, 0, Math.PI / 4 + 0.05]} c="#04201b" center />
    </group>
  );
}

/* =================================================================== 0 · cidade */
/** Pop-outs over the city: payments landing and companies hiring, one after another. */
const CITY_POPS = [
  { text: 'Pix recebido R$ 1.250,00', sub: 'Serviço de eletricista', accent: '#4fe0c9', check: true, at: [-2.2, 1.4, 2.2] },
  { text: 'Empresa contratando', sub: 'Pedreiro', accent: '#ffb35c', at: [-0.9, 4.55, -6.45] },
  { text: 'Pix recebido R$ 4.800,00', sub: 'Rota concluída', accent: '#4fe0c9', check: true, truck: 0 },
  { text: 'Empresa contratando', sub: 'Soldador', accent: '#ffb35c', at: [6.45, 1.75, 0.4] },
  { text: 'Pix depositado R$ 9.800,00', sub: 'Contrato Construções', accent: '#4fe0c9', check: true, at: [0, 7.05, 0] },
  { text: 'Empresa contratando', sub: 'Eletricista', accent: '#ffb35c', at: [-6.45, 4.95, -1.0] },
];
const POP_STEP = 2.6;
const POP_SHOW = 4.2;
const POP_PERIOD = POP_STEP * CITY_POPS.length;

function popVis(ch, i) {
  const c = ch.current;
  if (c.reduced) return i === 0 || i === 1 ? 1 : 0;
  const tau = (((c.t - 0.8 - i * POP_STEP) % POP_PERIOD) + POP_PERIOD) % POP_PERIOD;
  return c.t < 0.8 + i * POP_STEP ? 0 : bump(tau, 0, 0.35, POP_SHOW - 0.4, POP_SHOW);
}

function CityPop({ pop, index }) {
  const ch = useChapter();
  return (
    <Label text={pop.text} sub={pop.sub} accent={pop.accent} check={pop.check} keepSub position={pop.at || [0, 1.3, 0]} vis={() => popVis(ch, index)} />
  );
}

const CITY_TRUCKS = [
  { o: 0, cab: '#f4f1ea', cargo: '#24365e' },
  { o: 0.34, cab: '#ffffff', cargo: '#2ad1b8' },
  { o: 0.67, cab: '#f4f1ea', cargo: '#e5a53b', kind: 'tanker' },
];
const CITY_CARS = [
  { o: 0.14, c: '#e5574f' },
  { o: 0.5, c: '#f2f0ea' },
  { o: 0.82, c: '#3b6fd6' },
];
const CITY_WALKERS = [
  { a: [-2.4, 5.3], b: [2.4, 5.3], shirt: '#e5a53b', v: 0.55 },
  { a: [5.3, 2.2], b: [5.3, -2.4], shirt: '#8fb2ff', v: 0.5 },
  { a: [-5.3, -2.2], b: [-5.3, 2.4], shirt: '#2ad1b8', v: 0.6 },
  { a: [2.4, -5.3], b: [-2.4, -5.3], shirt: '#e5574f', v: 0.45 },
  { a: [1.1, 3.1], b: [2.9, 3.1], shirt: '#f2f0ea', v: 0.35 },
  { a: [-2.9, 1.2], b: [-2.9, -1.0], shirt: '#5fe39a', v: 0.4 },
];
const BACK_ROW = [
  { x: -4.9, w: 1.7, h: 3.4, c: '#e9edf4' },
  { x: -2.9, w: 1.6, h: 2.2, c: '#f3efe7' },
  { x: -0.9, w: 1.8, h: 4.2, c: '#dfe6f1' },
  { x: 1.2, w: 1.5, h: 2.8, c: '#f1ece4' },
  { x: 3.2, w: 1.7, h: 3.6, c: '#e6ebf3' },
  { x: 5.2, w: 1.4, h: 2.0, c: '#f3efe7' },
];
const LEFT_COL = [
  { z: -3.0, d: 1.6, h: 3.0, c: '#f1ece4' },
  { z: -1.0, d: 1.7, h: 4.6, c: '#e2e8f2' },
  { z: 1.1, d: 1.6, h: 2.4, c: '#f3efe7' },
  { z: 3.1, d: 1.7, h: 3.2, c: '#e9edf4' },
  { z: 5.1, d: 1.4, h: 1.8, c: '#f1ece4' },
];

export function CityIsland() {
  const ch = useChapter();
  const loop = useMemo(() => roundedLoop(4.3, 4.3, 1.7), []);
  const trucks = useRef([]);
  const cars = useRef([]);
  const walkers = useRef([]);
  useFrame((state) => {
    const c = ch.current;
    if (!c.visible) return;
    const T = c.reduced ? 6 : state.clock.elapsedTime;
    trucks.current.forEach((g, i) => g && placeOnCurve(g, loop, CITY_TRUCKS[i].o + T * 0.028, 0.32));
    cars.current.forEach((g, i) => g && placeOnCurve(g, loop, CITY_CARS[i].o - T * 0.04, 0.32, true));
    walkers.current.forEach((g, i) => g && walkBetween(g, CITY_WALKERS[i].a, CITY_WALKERS[i].b, T, CITY_WALKERS[i].v, i * 1.7));
  });
  const d = (x, z) => 0.1 + Math.hypot(x, z) * 0.07;
  return (
    <Island w={15} d={15} top="#e8e6e1" lip="#cfd3dc" strata={['#b9c3d8', '#8592b2', '#56618a']} seed={11}>
      <Road curve={loop} width={1.3} />
      <B p={[0, 0, 0]} s={[6.4, 0.04, 6.4]} c="#dcdfe6" shadow={false} />
      {/* TemPix tower */}
      <Rise delay={0.05} dur={0.9}>
        <B s={[2.3, 0.18, 2.3]} c="#c5ccd9" />
        <Building p={[0, 0.18, 0]} w={1.5} d={1.5} h={4.5} c="#2c4170" roof="#1c2a45" lit={1} glow="#8ff0de" top={false} />
        <Cy p={[0, 4.74, 0]} s={[1.2, 0.2, 1.2]} c="#2ad1b8" e="#2ad1b8" ei={0.9} />
        <Cy p={[0, 4.94, 0]} s={[0.07, 0.6, 0.07]} c="#dfe6f2" g={GEO.cyl8} />
      </Rise>
      <BrandTile position={[0, 6.35, 0]} />
      {CITY_POPS.map((pop, k) =>
        pop.at ? (
          <group key={k}>
            <CityPop pop={pop} index={k} />
            <group position={[pop.at[0], 0, pop.at[2]]}>
              <Pulse color={pop.accent} radius={1.8} period={POP_PERIOD} delay={0.8 + k * POP_STEP} y={k === 4 ? 4.9 : 0.04} />
            </group>
          </group>
        ) : null,
      )}
      <group position={[0, 4.9, 0]}>
        <Pulse color="#9ff5e6" radius={3.6} period={2.6} />
        <Pulse color="#9ff5e6" radius={3.6} period={2.6} delay={1.3} />
      </group>
      <Glow color="#2ad1b8" size={3.2} position={[0, 6.35, -0.3]} pulse={0.15} />
      {/* plaza */}
      <Rise delay={0.3}>
        <Building p={[-2.2, 0, -2.2]} w={1.3} d={1.3} h={2.4} c="#eef1f6" lit={0.5} />
        <Building p={[2.2, 0, -2.2]} w={1.3} d={1.2} h={1.6} c="#f3efe7" lit={0.5} />
        <House p={[-2.2, 0, 2.2]} c="#f3efe7" roof="#5d7cb8" />
        <Cy p={[2.2, 0, 2.2]} s={[1.2, 0.16, 1.2]} c="#c5ccd9" />
        <Cy p={[2.2, 0.16, 2.2]} s={[0.95, 0.03, 0.95]} c="#7fb6e8" e="#4b8fd6" ei={0.2} />
      </Rise>
      {[
        [1.6, 0],
        [-1.6, 0],
        [0, 1.6],
        [0, -1.6],
        [2.9, 0.8],
        [-0.8, 2.9],
      ].map(([x, z]) => (
        <Rise key={`t${x}${z}`} delay={0.4 + Math.abs(x + z) * 0.05} all>
          <Tree p={[x, 0, z]} s={0.75} c="#6aa77a" />
        </Rise>
      ))}
      <Bench p={[1.2, 0, 1.55]} />
      <Lamp p={[-1.3, 0, 1.3]} />
      <Lamp p={[1.3, 0, -1.3]} />
      {/* outer band */}
      {BACK_ROW.map((b) => (
        <Rise key={`b${b.x}`} delay={d(b.x, -6.5)}>
          <Building p={[b.x, 0, -6.45]} w={b.w} d={1.5} h={b.h} c={b.c} lit={0.55} />
        </Rise>
      ))}
      {LEFT_COL.map((b) => (
        <Rise key={`l${b.z}`} delay={d(-6.5, b.z)}>
          <Building p={[-6.45, 0, b.z]} w={1.5} d={b.d} h={b.h} c={b.c} lit={0.55} />
        </Rise>
      ))}
      <Rise delay={0.8}>
        <Building p={[-6.45, 0, -6.45]} w={1.5} d={1.5} h={5.4} c="#24365e" roof="#1c2a45" lit={0.9} />
      </Rise>
      <Rise delay={0.7}>
        <House p={[-4.9, 0, 6.4]} roof="#c46a4a" />
        <House p={[-3.5, 0, 6.4]} c="#eef1f6" roof="#5d7cb8" />
        <Warehouse p={[0.6, 0, 6.45]} w={3} d={1.4} h={1.0} roof="#8592b2" docks={3} />
        <House p={[6.4, 0, -4.9]} ry={Math.PI / 2} roof="#5d7cb8" />
        <House p={[6.4, 0, -3.5]} ry={Math.PI / 2} c="#eef1f6" roof="#c46a4a" />
        <Warehouse p={[6.45, 0, 0.4]} ry={Math.PI / 2} w={2.6} d={1.4} h={1.1} roof="#e5a53b" docks={2} />
      </Rise>
      {[
        [3.4, 6.5],
        [4.6, 6.3],
        [5.9, 6.5],
        [6.4, 5.0],
        [6.5, 3.4],
        [-6.5, 6.5],
        [-1.6, 6.6],
      ].map(([x, z]) => (
        <Rise key={`o${x}${z}`} delay={0.9} all>
          <Tree p={[x, 0, z]} s={0.8 + ((x * z) % 0.3)} c="#5f9a6a" />
        </Rise>
      ))}
      <Rise delay={0.9} all>
        {CITY_TRUCKS.map((t, i) => (
          <Truck key={i} ref={(el) => (trucks.current[i] = el)} cab={t.cab} cargo={t.cargo} kind={t.kind || 'box'} scale={0.8}>
            {/* undo the truck's 0.8 scale so this pop-out matches the others */}
            <group scale={1.25}>{CITY_POPS.map((pop, k) => (pop.truck === i ? <CityPop key={k} pop={pop} index={k} /> : null))}</group>
          </Truck>
        ))}
        {CITY_CARS.map((t, i) => (
          <Car key={i} ref={(el) => (cars.current[i] = el)} c={t.c} scale={0.85} />
        ))}
        {CITY_WALKERS.map((w, i) => (
          <Person key={i} ref={(el) => (walkers.current[i] = el)} shirt={w.shirt} walk={ONE} phase={i} scale={0.75} />
        ))}
      </Rise>
    </Island>
  );
}

/* ================================================================= 1 · demanda */
const COMPANIES = [
  { kind: 'factory', match: { text: 'Precisa de frete', sub: '94% compatível · Joinville/SC' } },
  { kind: 'office' },
  { kind: 'warehouse', match: { text: 'Pediu orçamento', sub: '91% compatível · manutenção' } },
  { kind: 'store' },
  { kind: 'site', match: { text: 'Vaga aberta', sub: '88% compatível · 2 operadores' } },
  { kind: 'silo' },
];
const SWEEP_PERIOD = 6;
const W_SWEEP = (Math.PI * 2) / SWEEP_PERIOD;

function Company({ kind }) {
  switch (kind) {
    case 'factory':
      return (
        <group>
          <Warehouse w={1.9} d={1.4} h={0.9} roof="#7fb5ad" docks={2} />
          <Cy p={[0.6, 0, -0.4]} s={[0.26, 2.1, 0.26]} c="#c9cfd8" />
          <Cy p={[0.6, 2.1, -0.4]} s={[0.32, 0.14, 0.32]} c="#c8553d" />
        </group>
      );
    case 'office':
      return <Building w={1.2} d={1.2} h={3.0} c="#eef2f5" roof="#c9d6d4" lit={0.15} />;
    case 'warehouse':
      return <Warehouse w={2} d={1.5} h={1.1} roof="#5f9d93" docks={3} />;
    case 'store':
      return (
        <group>
          <Building w={1.4} d={1.1} h={1.0} c="#f6f2ea" roof="#e5a53b" top={false} />
          {[-0.5, -0.17, 0.17, 0.5].map((x, i) => (
            <B key={x} p={[x, 0.82, 0.62]} s={[0.33, 0.06, 0.34]} c={i % 2 ? '#ffffff' : '#e5574f'} />
          ))}
        </group>
      );
    case 'site':
      return (
        <group>
          {[
            [-0.6, -0.5],
            [0.6, -0.5],
            [-0.6, 0.5],
            [0.6, 0.5],
          ].map(([x, z]) => (
            <B key={`${x}${z}`} p={[x, 0, z]} s={[0.1, 1.6, 0.1]} c="#c9cfd8" />
          ))}
          <B p={[0, 0.8, 0]} s={[1.4, 0.08, 1.2]} c="#d9d4ca" />
          <B p={[0, 1.6, 0]} s={[1.4, 0.08, 1.2]} c="#d9d4ca" />
          <B p={[1.05, 0, -0.6]} s={[0.12, 2.6, 0.12]} c="#f2b134" />
          <B p={[0.65, 2.6, -0.6]} s={[1.4, 0.1, 0.12]} c="#f2b134" />
        </group>
      );
    default:
      return (
        <group>
          <Cy p={[-0.35, 0, 0]} s={[0.8, 1.7, 0.8]} c="#e9e5dc" />
          <mesh geometry={GEO.hemi} material={mat('#9aa4b5')} position={[-0.35, 1.7, 0]} scale={[0.8, 0.5, 0.8]} castShadow />
          <Cy p={[0.45, 0, -0.2]} s={[0.55, 1.2, 0.55]} c="#e9e5dc" />
          <mesh geometry={GEO.hemi} material={mat('#9aa4b5')} position={[0.45, 1.2, -0.2]} scale={[0.55, 0.36, 0.55]} castShadow />
        </group>
      );
  }
}

export function DemandIsland() {
  const ch = useChapter();
  const R = 4.9;
  const list = useMemo(
    () =>
      COMPANIES.map((co, i) => {
        const phi = (i / COMPANIES.length) * Math.PI * 2 + 0.25;
        const x = Math.cos(phi) * R;
        const z = Math.sin(phi) * R;
        const h = { factory: 2.2, office: 3.1, warehouse: 1.5, store: 1.2, site: 2.7, silo: 2.0 }[co.kind];
        let arc = null;
        let geo = null;
        if (co.match) {
          arc = new THREE.QuadraticBezierCurve3(v3(0, 2.6, 0), v3(x * 0.5, 5.2, z * 0.5), v3(x, h + 0.25, z));
          geo = new THREE.TubeGeometry(arc, 48, 0.04, 6, false);
          geo.setDrawRange(0, 0);
        }
        return { ...co, phi, x, z, h, arc, geo, first: phi / W_SWEEP };
      }),
    [],
  );
  const sweep = useRef();
  const dish = useRef();
  const beacons = useRef([]);
  const orbs = useRef([]);
  const sweepMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: sweepTex(), color: '#13b8a2', transparent: true, depthWrite: false, toneMapped: false }),
    [],
  );
  const arcMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#0fa58f', toneMapped: false }), []);
  useFrame(() => {
    const c = ch.current;
    if (!c.visible) return;
    const t = c.t;
    const theta = t * W_SWEEP;
    sweep.current.rotation.y = -theta;
    dish.current.rotation.y = -theta - Math.PI / 2;
    list.forEach((co, i) => {
      const since = (((theta - co.phi) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const ping = theta >= co.phi ? Math.exp((-since / W_SWEEP) * 2.2) : 0;
      const b = beacons.current[i];
      if (b) b.scale.setScalar(0.22 + ping * 0.25);
      if (co.geo) {
        const k = eo(seg(t, co.first, co.first + 0.7));
        co.geo.setDrawRange(0, Math.floor(k * 48) * 6 * 6);
        const o = orbs.current[i];
        if (o) {
          o.visible = k >= 1;
          if (o.visible) co.arc.getPoint(((t - co.first) * 0.45) % 1, o.position);
        }
      }
    });
  });
  return (
    <Island w={15} d={15} top="#e5efec" lip="#c9dcd7" strata={['#a9d1c9', '#5f9d93', '#2f6660']} seed={23}>
      {[2.4, 4.4, 6.4].map((r) => (
        <mesh key={r} geometry={GEO.ring} material={mat('#9cc9c1')} position={[0, 0.01, 0]} scale={[r, 1, r]} />
      ))}
      <mesh ref={sweep} userData={{ dyn: true }} geometry={GEO.disc} material={sweepMat} position={[0, 0.02, 0]} scale={[6.6, 1, 6.6]} renderOrder={1} />
      <Rise delay={0.05} dur={0.8}>
        <Cy s={[2.4, 0.3, 2.4]} c="#dfe9e7" />
        <Cy p={[0, 0.3, 0]} s={[1.3, 0.9, 1.3]} c="#24365e" />
        <Cy p={[0, 1.0, 0]} s={[1.34, 0.1, 1.34]} c="#2ad1b8" e="#2ad1b8" ei={0.8} />
        <Cy p={[0, 1.2, 0]} s={[0.22, 1.2, 0.22]} c="#c9d3e0" />
      </Rise>
      <group ref={dish} userData={{ rigid: true }} position={[0, 2.5, 0]}>
        <Rise delay={0.4} all>
          <group rotation={[-0.95, 0, 0]}>
            <mesh geometry={GEO.hemi} material={mat('#f3f6f9', { side: THREE.DoubleSide })} rotation={[Math.PI, 0, 0]} scale={[1.9, 0.7, 1.9]} castShadow />
            <Cy p={[0, -0.1, 0]} s={[0.07, 0.75, 0.07]} c="#9aa4b5" g={GEO.cyl8} />
            <Ball p={[0, 0.66, 0]} s={0.16} c="#2ad1b8" e="#2ad1b8" ei={1.4} />
          </group>
        </Rise>
      </group>
      <Glow color="#2ad1b8" size={2} position={[0, 2.6, 0]} pulse={0.2} />
      <Label text="Procurando 24h" sub="sinais públicos de demanda" accent="#2ad1b8" position={[0, 3.3, 0]} vis={() => 1 - seg(ch.current.t, 2.2, 2.6)} />
      {list.map((co, i) => (
        <group key={co.kind} position={[co.x, 0, co.z]}>
          <Rise delay={0.25 + i * 0.08}>
            <group rotation={[0, Math.atan2(-co.x, -co.z), 0]}>
              <Company kind={co.kind} />
            </group>
          </Rise>
          <Ball
            ref={(el) => (beacons.current[i] = el)}
            userData={{ dyn: true }}
            p={[0, co.h + 0.25, 0]}
            s={0.22}
            c={co.match ? '#e5a53b' : '#9cc9c1'}
            e={co.match ? '#ffb35c' : '#2ad1b8'}
            ei={co.match ? 1.2 : 0.4}
          />
          {co.match && (
            <>
              <Glow color="#ffb35c" size={1.3} position={[0, co.h + 0.25, 0]} pulse={0.25} />
              <Pulse color="#e5a53b" radius={1.6} period={SWEEP_PERIOD} delay={co.first} />
              <Label
                text={co.match.text}
                sub={co.match.sub}
                accent="#ffb35c"
                position={[0, co.h + 0.6, 0]}
                vis={() => seg(ch.current.t, co.first + 0.5, co.first + 0.9)}
              />
            </>
          )}
        </group>
      ))}
      {list.map((co, i) =>
        co.geo ? (
          <group key={`a${i}`}>
            <mesh geometry={co.geo} material={arcMat} />
            <Ball ref={(el) => (orbs.current[i] = el)} userData={{ dyn: true }} s={0.2} c="#ffffff" e="#9ff5e6" ei={2} visible={false} />
          </group>
        ) : null,
      )}
      {[
        [-1.8, 6.2],
        [6.3, -1.6],
        [-6.2, 2.4],
        [2.6, 6.3],
        [-3.4, -6.2],
        [6.2, 3.6],
      ].map(([x, z]) => (
        <Rise key={`${x}${z}`} delay={0.8} all>
          <Tree p={[x, 0, z]} s={0.85} c="#4f9a86" />
        </Rise>
      ))}
    </Island>
  );
}

/* ================================================================ 2 · terminais */
const BOX_COLORS = ['#c8553d', '#2f6fb3', '#e0a43a', '#3b8f6a', '#7c4fb0', '#d9d4ca', '#1f3b63', '#e5574f'];
const CRANE_Z = 0.6;
const LANE_X = -3.3;
const SHIP_X = -5.75;
const T_PERIOD = 11;

export function TerminalIsland() {
  const ch = useChapter();
  const road = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        [v3(LANE_X, 0, -7.4), v3(LANE_X, 0, -3), v3(LANE_X, 0, 1), v3(LANE_X, 0, 3.6), v3(-2.6, 0, 5.0), v3(-1.2, 0, 5.6), v3(1, 0, 5.6), v3(4, 0, 5.6), v3(8.4, 0, 5.6)],
        false,
        'centripetal',
      ),
    [],
  );
  const uCrane = useMemo(() => {
    let best = 0;
    let bd = 1e9;
    const p = new THREE.Vector3();
    for (let i = 0; i <= 600; i++) {
      road.getPointAt(i / 600, p);
      const dd = Math.abs(p.z - (CRANE_Z + 0.38)) + Math.abs(p.x - LANE_X);
      if (dd < bd) {
        bd = dd;
        best = i / 600;
      }
      if (p.z > 2) break;
    }
    return best;
  }, [road]);
  const stacks = useMemo(() => {
    const r = rng(5);
    const out = [];
    for (const z of [-5.4, -3.5, -1.6, 0.3, 2.2])
      for (const x of [-1.4, -0.5, 0.4, 1.3]) {
        const n = Math.floor(r() * 3.2);
        for (let k = 0; k < n; k++) out.push({ p: [x, k * 0.8, z], c: BOX_COLORS[Math.floor(r() * BOX_COLORS.length)] });
      }
    return out;
  }, []);
  const truck = useRef();
  const trolley = useRef();
  const spreader = useRef();
  const cables = useRef([]);
  const boxShip = useRef();
  const boxHang = useRef();
  const boxTruck = useRef();
  const barrier = useRef();
  const flash = useRef(0);
  useFrame(() => {
    const c = ch.current;
    if (!c.visible) return;
    const t = c.t % T_PERIOD;
    // crane trolley + spreader
    let tx = LANE_X;
    if (t < 2.0) tx = lerp(LANE_X, SHIP_X, eio(seg(t, 0.4, 2.0)));
    else if (t < 3.8) tx = SHIP_X;
    else tx = lerp(SHIP_X, LANE_X, eio(seg(t, 3.8, 5.4)));
    const UP = 3.6;
    let sy = UP;
    if (t >= 2.0 && t < 3.0) sy = lerp(UP, 1.68, eio(seg(t, 2.0, 2.8)));
    else if (t >= 3.0 && t < 3.8) sy = lerp(1.68, UP, eio(seg(t, 3.0, 3.8)));
    else if (t >= 5.4 && t < 6.2) sy = lerp(UP, 1.05, eio(seg(t, 5.4, 6.2)));
    else if (t >= 6.2) sy = lerp(1.05, UP, eio(seg(t, 6.2, 6.9)));
    trolley.current.position.x = tx;
    spreader.current.position.set(tx, sy, CRANE_Z);
    const len = 4.5 - (sy + 0.12);
    cables.current.forEach((cb) => {
      if (!cb) return;
      cb.position.set(tx, sy + 0.12 + len / 2, cb.position.z);
      cb.scale.y = Math.max(len, 0.01);
    });
    const onShip = t < 3.0;
    const hanging = t >= 3.0 && t < 6.2;
    boxShip.current.visible = onShip;
    boxShip.current.scale.setScalar(Math.max(back(seg(t, 0, 0.35)), 0.001));
    boxHang.current.visible = hanging;
    boxHang.current.position.set(tx, sy - 0.39, CRANE_Z);
    boxTruck.current.visible = t >= 6.2 && t < 10.4;
    flash.current = bump(t, 2.8, 2.9, 3.0, 3.3) + bump(t, 6.1, 6.2, 6.3, 6.6);
    // truck
    let u;
    if (t < 2.2) u = lerp(0, uCrane, eo(seg(t, 0, 2.2)));
    else if (t < 6.6) u = uCrane;
    else u = lerp(uCrane, 1, eio(seg(t, 6.6, 10.4)));
    placeOnCurve(truck.current, road, Math.min(u, 0.9999), 0);
    const s = Math.min(back(seg(t, 0, 0.4)), 1 - seg(t, 10.0, 10.4));
    truck.current.scale.setScalar(Math.max(s, 0.001) * 0.95);
    // gate barrier lifts while the truck passes
    const tp = truck.current.position;
    const near = tp.z > 3.6 && tp.x > -3.6 && tp.x < 2.6;
    barrier.current.rotation.x = damp1(barrier.current.rotation.x, near ? 1.3 : 0);
  });
  const boxMat = containerMat('#c8553d');
  return (
    <Island w={16} d={14} top="#ebe5dc" lip="#d3c8b8" strata={['#dcb48f', '#b0764f', '#713f2a']} seed={37}>
      {/* water + quay */}
      <B p={[-6.2, 0, 0]} s={[3.6, 0.03, 14]} c="#3d7cc9" e="#1d4f8a" ei={0.25} shadow={false} />
      <B p={[-4.32, 0, 0]} s={[0.16, 0.1, 14]} c="#8d8a85" />
      <Road curve={road} width={1.05} />
      {/* ship */}
      <group position={[-6.2, 0, -0.6]}>
        <Rise delay={0.1}>
          <B p={[0, -0.3, 0]} s={[2.4, 1.2, 9]} c="#1f3b63" />
          <B p={[0, 0.02, 0]} s={[2.42, 0.16, 9.02]} c="#b8432f" />
          <B p={[0, 0.9, -3.7]} s={[2.0, 1.7, 1.1]} c="#f2f0ea" />
          <B p={[0, 2.2, -3.13]} s={[1.8, 0.2, 0.02]} c="#1b2433" e="#3b5a86" ei={0.3} />
          <Cy p={[0.5, 2.6, -4.0]} s={[0.4, 0.7, 0.4]} c="#c8553d" />
          {[
            [-0.45, -2.4, 2],
            [0.45, -2.4, 1],
            [-0.45, -0.6, 1],
            [0.45, -0.6, 2],
            [-0.45, 1.2, 2],
            [-0.45, 3.0, 1],
            [0.45, 3.0, 2],
          ].map(([x, z, n]) =>
            Array.from({ length: n }, (_, k) => <Container key={`${x}${z}${k}`} p={[x, 0.9 + k * 0.8, z]} c={BOX_COLORS[(Math.abs(x * 10 + z * 3 + k) | 0) % BOX_COLORS.length]} />),
          )}
        </Rise>
      </group>
      <group ref={boxShip} userData={{ rigid: true }} position={[SHIP_X, 0.9, CRANE_Z]}>
        <B s={[0.78, 0.78, 1.7]} m={boxMat} />
      </group>
      <B ref={boxHang} userData={{ dyn: true }} p={[SHIP_X, 0, CRANE_Z]} s={[0.78, 0.78, 1.7]} m={boxMat} visible={false} />
      {/* gantry crane */}
      <Rise delay={0.2}>
        {[-7.6, -2.55].map((x) =>
          [CRANE_Z - 0.75, CRANE_Z + 0.75].map((z) => <B key={`${x}${z}`} p={[x, 0, z]} s={[0.2, 4.6, 0.2]} c="#f2a33a" />),
        )}
        <B p={[-7.6, 0, CRANE_Z]} s={[0.3, 0.2, 1.8]} c="#d98a27" />
        <B p={[-2.55, 0, CRANE_Z]} s={[0.3, 0.2, 1.8]} c="#d98a27" />
        <B p={[-4.7, 4.6, CRANE_Z]} s={[8.2, 0.4, 1.1]} c="#f2a33a" />
        <B p={[-1.9, 5.0, CRANE_Z]} s={[1.3, 0.6, 1.1]} c="#f2f0ea" />
        <B p={[-7.6, 2.6, CRANE_Z]} s={[0.14, 0.14, 1.5]} c="#d98a27" />
        <B p={[-2.55, 2.6, CRANE_Z]} s={[0.14, 0.14, 1.5]} c="#d98a27" />
      </Rise>
      <B ref={trolley} userData={{ dyn: true }} p={[LANE_X, 4.3, CRANE_Z]} s={[0.8, 0.3, 1.2]} c="#2a2f3a" />
      {[-0.3, 0.3].map((dz, i) => (
        <B key={dz} ref={(el) => (cables.current[i] = el)} userData={{ dyn: true }} p={[LANE_X, 2, CRANE_Z + dz]} s={[0.03, 1, 0.03]} c="#2a2f3a" center />
      ))}
      <group ref={spreader} userData={{ rigid: true }}>
        <B s={[0.9, 0.12, 1.8]} c="#f2c94c" />
        <Glow color="#ffd36b" size={1.6} position={[0, 0, 0]} vis={() => flash.current} />
      </group>
      {/* yard */}
      <Rise delay={0.35}>
        {stacks.map((b, i) => (
          <Container key={i} p={b.p} c={b.c} />
        ))}
      </Rise>
      {/* carrier depot */}
      <Rise delay={0.45}>
        <Warehouse p={[5.8, 0, 1.0]} ry={-Math.PI / 2} w={4.4} d={3.2} h={1.5} c="#efe9e0" roof="#c7743f" docks={3} />
        <Building p={[6.0, 0, -3.6]} w={2.2} d={1.6} h={1.6} c="#f4efe6" roof="#c7743f" lit={0.2} />
      </Rise>
      <Rise delay={0.6} all>
        <Truck position={[3.05, 0, -0.47]} rotation={[0, -Math.PI / 2, 0]} cargo="#24365e" />
        <Truck position={[3.05, 0, 1.0]} rotation={[0, -Math.PI / 2, 0]} cargo="#c7743f" />
      </Rise>
      <Label text="Transportadora" sub="3 caminhões disponíveis" accent="#ffb35c" position={[5.8, 2.6, 1.0]} />
      {/* gate */}
      <Rise delay={0.5}>
        <B p={[0.6, 0, 6.65]} s={[0.8, 0.85, 0.7]} c="#f2f0ea" />
        <B p={[0.6, 0.85, 6.65]} s={[1.0, 0.08, 0.9]} c="#c7743f" />
      </Rise>
      <group ref={barrier} userData={{ rigid: true }} position={[0.6, 0.55, 6.3]}>
        <B p={[0, 0, -0.65]} s={[0.08, 0.08, 1.3]} c="#e5574f" center />
        <B p={[0, 0, -0.33]} s={[0.085, 0.085, 0.3]} c="#ffffff" center />
        <B p={[0, 0, -0.95]} s={[0.085, 0.085, 0.3]} c="#ffffff" center />
      </group>
      <Label text="Terminal" sub="gate de saída" accent="#ffb35c" position={[0.6, 1.3, 6.65]} />
      <Truck ref={truck} kind="flat" cab="#ffffff" cargo="#c7743f">
        <B ref={boxTruck} userData={{ dyn: true }} s={[0.78, 0.78, 1.7]} m={boxMat} visible={false} />
        <Label
          text="Carga 28 t"
          sub="Santos → Campinas"
          accent="#ffb35c"
          position={[0, 1.4, 0]}
          vis={() => bump(ch.current.t % T_PERIOD, 6.3, 6.7, 9.6, 10.0)}
        />
      </Truck>
      {[
        [7.2, -6.2],
        [4.6, -6.3],
        [7.3, 4.2],
        [-2.1, -6.7],
      ].map(([x, z]) => (
        <Rise key={`${x}${z}`} delay={0.7} all>
          <Tree p={[x, 0, z]} s={0.85} c="#7da36a" />
        </Rise>
      ))}
    </Island>
  );
}
const damp1 = (a, b) => a + (b - a) * 0.12;

/* ================================================================== 3 · trajeto */
const R_PERIOD = 10;
/** Lateral offset of each truck lane: both fit on the road and the bridge. */
const LANE = 0.33;
export function RouteIsland() {
  const ch = useChapter();
  const road = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        [v3(-7.8, 0, -2.6), v3(-5.6, 0, -3.0), v3(-3.4, 0, -2.0), v3(-1.6, 0, -0.2), v3(0.4, 0, 1.3), v3(2.6, 0, 2.0), v3(4.6, 0, 1.2), v3(6.2, 0, 1.6), v3(7.8, 0, 2.4)],
        false,
        'centripetal',
      ),
    [],
  );
  const river = useMemo(
    () => new THREE.CatmullRomCurve3([v3(-3.6, 0, 5.5), v3(-2.4, 0, 3.2), v3(-1.2, 0, 1.2), v3(-0.2, 0, -1.0), v3(0.4, 0, -3.4), v3(1.6, 0, -5.5)], false, 'centripetal'),
    [],
  );
  const riverGeo = useMemo(() => ribbonGeometry(river, 1.1, 80, { y: 0.006 }), [river]);
  const SEGS = 220;
  const trailGeo = useMemo(() => ribbonGeometry(road, 0.26, SEGS, { y: 0.03 }), [road]);
  const trailMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#9b7bff', transparent: true, toneMapped: false }), []);
  const bridge = useMemo(() => {
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    let best = { d: 1e9, u: 0 };
    for (let i = 0; i <= 200; i++) {
      road.getPointAt(i / 200, p);
      for (let j = 0; j <= 80; j++) {
        river.getPointAt(j / 80, q);
        const d = p.distanceToSquared(q);
        if (d < best.d) best = { d, u: i / 200 };
      }
    }
    road.getPointAt(best.u, p);
    road.getTangentAt(best.u, q);
    return { pos: [p.x, 0, p.z], ry: Math.atan2(q.x, q.z) };
  }, [road, river]);
  const CPS = [0.36, 0.68];
  const truck = useRef();
  const ret = useRef();
  const pinB = useRef();
  const cps = useRef([]);
  const st = useRef({ u: 0 });
  useFrame((state) => {
    const c = ch.current;
    if (!c.visible) return;
    const t = c.t % R_PERIOD;
    const u = 0.02 + 0.95 * eio(seg(t, 0.8, 7.6));
    st.current.u = u;
    placeOnCurve(truck.current, road, u, LANE);
    truck.current.scale.setScalar(Math.max(Math.min(back(seg(t, 0, 0.4)), 1 - seg(t, 9.4, 9.8)), 0.001) * 0.85);
    trailGeo.setDrawRange(0, Math.floor(clamp01((u - 0.02) / 0.95) * SEGS) * 6);
    trailMat.opacity = 1 - seg(t, 9.2, 9.8);
    cps.current.forEach((m, i) => m && m.scale.setScalar(u > CPS[i] ? 0.3 + 0.08 * Math.sin(state.clock.elapsedTime * 6) : 0.18));
    pinB.current.scale.setScalar(1 + 0.35 * bump(t, 7.6, 7.8, 7.9, 8.4) * back(seg(t, 7.6, 8.2)));
    const T = c.reduced ? 5 : state.clock.elapsedTime;
    const ur = 1 - ((T / 14) % 1);
    placeOnCurve(ret.current, road, ur, LANE, true);
    ret.current.scale.setScalar(Math.max(Math.min(seg(ur, 0, 0.04), seg(1 - ur, 0, 0.04)), 0.001) * 0.8);
    st.current.ur = ur;
    // the return-freight tag only shows when it can't sit on top of "Em rota"
    st.current.gap = truck.current.position.distanceTo(ret.current.position);
  });
  return (
    <Island w={18} d={11} top="#e3eadc" lip="#c9d3bf" strata={['#c3b4e6', '#8a72c4', '#53408a']} seed={41}>
      <mesh geometry={riverGeo} material={mat('#4a86d6', { e: '#2b5fb0', ei: 0.25 })} receiveShadow />
      <Road curve={road} width={1.35} />
      <mesh geometry={trailGeo} material={trailMat} renderOrder={2} />
      <group position={bridge.pos} rotation={[0, bridge.ry, 0]}>
        <B p={[0.78, 0, 0]} s={[0.07, 0.18, 1.7]} c="#d9d4ca" />
        <B p={[-0.78, 0, 0]} s={[0.07, 0.18, 1.7]} c="#d9d4ca" />
        <B p={[0, 0, 0]} s={[1.5, 0.025, 1.6]} c="#8d8a85" shadow={false} />
      </group>
      {[
        [-5.4, 3.2, 3.2, 1.3, 2.6, '#a8c89a'],
        [-7.2, 0.6, 2.2, 0.9, 1.8, '#93b987'],
        [3.4, -3.6, 3.6, 1.5, 2.8, '#b5d0a4'],
        [6.2, -2.4, 2.4, 1.0, 2.0, '#9fbf8a'],
        [2.6, 4.4, 2.0, 0.8, 1.6, '#b5d0a4'],
        [-3.6, -4.4, 2.6, 1.0, 1.8, '#9fbf8a'],
      ].map(([x, z, w, h, d, c]) => (
        <Rise key={`${x}${z}`} delay={0.2 + Math.abs(x) * 0.03}>
          <Ball p={[x, 0, z]} s={[w, h * 2, d]} c={c} g={GEO.ico1} />
        </Rise>
      ))}
      {[
        [-4.6, 4.6],
        [-2.0, 5.0],
        [1.0, -2.2],
        [1.7, -1.6],
        [4.6, -1.0],
        [5.2, -0.4],
        [-8.3, -4.6],
        [-1.0, 4.2],
        [7.8, -4.2],
      ].map(([x, z]) => (
        <Rise key={`t${x}${z}`} delay={0.5} all>
          <Tree p={[x, 0, z]} s={0.8} c="#5f9a6a" />
        </Rise>
      ))}
      {/* origin */}
      <Rise delay={0.15}>
        <Warehouse p={[-6.6, 0, -4.4]} w={2.6} d={1.6} h={1.1} roof="#8a72c4" docks={3} />
      </Rise>
      <Rise delay={0.3} all>
        <Pin p={[-7.3, 0, -1.4]} c="#b69bff" />
      </Rise>
      <Label text="Coleta" sub="08:12 · CD de origem" accent="#b69bff" position={[-7.3, 1.25, -1.4]} vis={() => bump(ch.current.t % R_PERIOD, 0.5, 0.9, 9.2, 9.6)} />
      {/* destination */}
      <Rise delay={0.25}>
        <Building p={[7.3, 0, 4.1]} w={2} d={1.4} h={1.8} c="#f3efe7" roof="#8a72c4" lit={0.2} />
        <Warehouse p={[5.0, 0, 4.3]} w={2} d={1.3} h={0.9} roof="#8a72c4" docks={2} />
      </Rise>
      <group ref={pinB} userData={{ rigid: true }} position={[7.4, 0, 0.2]}>
        <Rise delay={0.35} all>
          <Pin c="#ff7ac8" />
        </Rise>
        <Pulse color="#ff7ac8" radius={1.8} period={1.6} vis={() => seg(ch.current.t % R_PERIOD, 7.6, 7.9) * (1 - seg(ch.current.t % R_PERIOD, 9.3, 9.6))} />
      </group>
      <Label
        text="Chegada registrada"
        sub="14:40 · aguardando confirmação"
        accent="#ff7ac8"
        check
        position={[7.4, 1.35, 0.2]}
        vis={() => bump(ch.current.t % R_PERIOD, 7.7, 8.1, 9.4, 9.8)}
      />
      {CPS.map((u, i) => {
        const p = road.getPointAt(u);
        const tg = road.getTangentAt(u);
        const l = Math.hypot(tg.x, tg.z);
        const x = p.x - (tg.z / l) * 1.0;
        const z = p.z + (tg.x / l) * 1.0;
        return (
          <group key={u} position={[x, 0, z]}>
            <Cy s={[0.07, 0.8, 0.07]} c="#53408a" g={GEO.cyl8} />
            <Ball ref={(el) => (cps.current[i] = el)} userData={{ dyn: true }} p={[0, 0.9, 0]} s={0.18} c="#ffffff" e="#b69bff" ei={1.5} />
          </group>
        );
      })}
      <Truck ref={truck} cab="#ffffff" cargo="#6a4bc0">
        <Label text="Em rota" sub="212 km · previsão 14:40" accent="#b69bff" position={[0, 1.15, 0]} vis={() => bump(ch.current.t % R_PERIOD, 1.4, 1.8, 7.0, 7.4)} />
      </Truck>
      <Truck ref={ret} cab="#f4f1ea" cargo="#e5a53b">
        <Label
          text="Frete de retorno"
          sub="Campinas → Santos"
          accent="#ffb35c"
          position={[0, 1.15, 0]}
          vis={() => bump(st.current.ur ?? 0, 0.42, 0.5, 0.78, 0.86) * seg(st.current.gap ?? 0, 5, 6.5)}
        />
      </Truck>
    </Island>
  );
}

/* ================================================================== 4 · pessoas */
const H_PERIOD = 11;
const HIRE_BLUE = new THREE.Color('#8fb2ff');
const HIRE_GREEN = new THREE.Color('#3f9a63');
const H0 = [-0.2, 2.4];
const H1 = [-0.75, 0.55];
const M0 = [-1.0, -2.0];
const M1 = [-0.85, -0.25];
const DOOR_H = [-0.58, -2.05];
const DOOR_M = [-1.14, -2.05];

function vagaTexture() {
  return screenTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#2f8a57';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.fillRect(0, h - 56, w, 56);
    g.fillStyle = '#ffffff';
    g.font = '700 92px "IBM Plex Sans", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('VAGA', w / 2, 92);
    g.font = '600 34px "IBM Plex Sans", system-ui, sans-serif';
    g.fillText('ESTAMOS CONTRATANDO', w / 2, 168);
    g.font = '500 24px "IBM Plex Mono", ui-monospace, monospace';
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.fillText('operador logístico', w / 2, h - 28);
  });
}

function Forklift({ children, ...props }) {
  return (
    <group {...props}>
      <B p={[0, 0.12, -0.1]} s={[0.62, 0.45, 0.9]} c="#f2b134" />
      {[
        [-0.27, -0.45],
        [0.27, -0.45],
        [-0.27, 0.25],
        [0.27, 0.25],
      ].map(([x, z]) => (
        <B key={`${x}${z}`} p={[x, 0.57, z]} s={[0.05, 0.6, 0.05]} c="#2a2f3a" />
      ))}
      <B p={[0, 1.17, -0.1]} s={[0.62, 0.05, 0.78]} c="#2a2f3a" />
      <B p={[-0.2, 0.05, 0.42]} s={[0.06, 1.3, 0.06]} c="#3a3f4c" />
      <B p={[0.2, 0.05, 0.42]} s={[0.06, 1.3, 0.06]} c="#3a3f4c" />
      <B p={[-0.15, 0.08, 0.75]} s={[0.07, 0.04, 0.62]} c="#3a3f4c" />
      <B p={[0.15, 0.08, 0.75]} s={[0.07, 0.04, 0.62]} c="#3a3f4c" />
      <Ball p={[0, 0.82, -0.15]} s={0.2} c="#c99a76" />
      {[-0.42, 0.42].map((z) => (
        <B key={z} p={[0, 0, z - 0.1]} s={[0.66, 0.2, 0.22]} c="#1b1e25" />
      ))}
      <group position={[0, 0.12, 0.75]}>{children}</group>
    </group>
  );
}

export function HiringIsland() {
  const ch = useChapter();
  const hero = useRef();
  const boss = useRef();
  const hat = useRef();
  const lift = useRef();
  const workers = useRef([]);
  const signMat = useMemo(() => new THREE.MeshBasicMaterial({ map: vagaTexture(), toneMapped: false }), []);
  const st = useRef({ walkH: 0, walkM: 0, wave: 0 });
  useFrame((state) => {
    const c = ch.current;
    if (!c.visible) return;
    const t = c.t % H_PERIOD;
    const s = st.current;
    const h = hero.current;
    const m = boss.current;
    // hero candidate
    if (t < 5.2) {
      walkTo(h, H0, H1, t, 1.0, 2.8);
      if (t < 1.0) h.rotation.y = Math.PI;
      if (t >= 2.8) h.rotation.y = Math.PI;
    } else walkTo(h, H1, DOOR_H, t, 5.2, 7.6);
    s.walkH = (t > 1.0 && t < 2.8) || (t > 5.2 && t < 7.6) ? 1 : 0;
    const hs = t < 0.4 ? back(seg(t, 0, 0.4)) : 1 - seg(t, 7.6, 8.0);
    h.scale.setScalar(Math.max(hs, 0.001) * 0.9);
    h.userData.shirt?.color.lerpColors(HIRE_BLUE, HIRE_GREEN, seg(t, 4.4, 4.9));
    hat.current.scale.setScalar(Math.max(back(seg(t, 4.5, 5.0)), 0.001));
    hat.current.visible = t > 4.5;
    // manager
    if (t < 5.2) {
      walkTo(m, M0, M1, t, 1.9, 3.2);
      if (t >= 3.2 || t < 1.9) m.rotation.y = 0;
    } else walkTo(m, M1, DOOR_M, t, 5.2, 7.6);
    s.walkM = (t > 1.9 && t < 3.2) || (t > 5.2 && t < 7.6) ? 1 : 0;
    const ms = t < 1.6 ? 0 : t < 1.9 ? back(seg(t, 1.6, 1.9)) : 1 - seg(t, 7.6, 8.0);
    m.scale.setScalar(Math.max(ms, 0.001) * 0.9);
    s.wave = bump(t, 3.3, 3.6, 4.2, 4.5);
    // forklift + workers
    const T = c.reduced ? 3 : state.clock.elapsedTime;
    const f = ((T * 0.18) % 2 + 2) % 2;
    lift.current.position.z = lerp(-1.6, 2.6, eio(f < 1 ? f : 2 - f));
    workers.current.forEach((g, i) => g && walkBetween(g, [2.4 + i * 0.5, 4.6], [6.0, 4.6 - i * 0.4], T, 0.5, i * 2));
  });
  const walkH = () => st.current.walkH;
  const walkM = () => st.current.walkM;
  const wave = () => st.current.wave;
  return (
    <Island w={15} d={13} top="#e4ede2" lip="#c8d8c6" strata={['#a6d3b2', '#5f9e74', '#2f6444']} seed={53}>
      <B p={[-0.6, 0, 0.3]} s={[6.2, 0.03, 4.6]} c="#d9ddd6" shadow={false} />
      <B p={[-0.85, 0, -1.2]} s={[1.3, 0.035, 2.0]} c="#cfd5cc" shadow={false} />
      <Rise delay={0.05} dur={0.9}>
        <Building p={[-1, 0, -3.6]} w={6.2} d={2.8} h={2.4} c="#f3f1ec" roof="#5fa77a" lit={0.15} />
        <B p={[-0.85, 0, -2.19]} s={[1.0, 1.25, 0.04]} c="#22303d" e="#3f9a63" ei={0.15} />
        <B p={[-0.85, 1.3, -1.9]} s={[1.7, 0.08, 0.66]} c="#3f9a63" />
        <B p={[-3.0, 1.45, -2.18]} s={[2.0, 0.5, 0.04]} c="#3f9a63" e="#3f9a63" ei={0.2} />
        <Warehouse p={[4.6, 0, -3.8]} w={3.4} d={2.6} h={1.4} roof="#79a986" docks={2} />
      </Rise>
      <Label text="Sua empresa" sub="contratando agora" accent="#5fe39a" position={[-3.0, 2.75, -3.0]} />
      {/* VAGA board */}
      <Rise delay={0.3}>
        <group position={[3.0, 0, 0.8]}>
          <Cy p={[-0.75, 0, 0]} s={[0.09, 1.9, 0.09]} c="#3a3f4c" g={GEO.cyl8} />
          <Cy p={[0.75, 0, 0]} s={[0.09, 1.9, 0.09]} c="#3a3f4c" g={GEO.cyl8} />
          <B p={[0, 0.95, 0]} s={[1.9, 0.98, 0.08]} c="#2f8a57" />
          <mesh geometry={GEO.plane} material={signMat} position={[0, 1.44, 0.045]} scale={[1.8, 0.9, 1]} />
        </group>
      </Rise>
      <group position={[3.0, 0, 0.8]}>
        <Pulse color="#3f9a63" radius={2} period={2.2} />
      </group>
      {/* candidates */}
      <Rise delay={0.45} all>
        <Person position={[-3.4, 0, 2.5]} rotation={[0, Math.PI, 0]} shirt="#e5a53b" scale={0.9} />
        <Person position={[-2.3, 0, 2.7]} rotation={[0, Math.PI - 0.3, 0]} shirt="#c8553d" scale={0.9} skin="#8d5b3e" />
        <Person position={[1.0, 0, 2.6]} rotation={[0, Math.PI + 0.3, 0]} shirt="#7c4fb0" scale={0.9} skin="#e2b48f" />
      </Rise>
      <Person ref={hero} recolor shirt="#8fb2ff" walk={walkH} wave={wave} skin="#a87454">
        <group ref={hat} userData={{ rigid: true }} position={[0, 0.9, 0]} visible={false}>
          <mesh geometry={GEO.hemi} material={mat('#f2b134')} scale={[0.3, 0.26, 0.3]} castShadow />
          <Cy s={[0.36, 0.02, 0.36]} c="#f2b134" />
        </group>
      </Person>
      <Person ref={boss} shirt="#24365e" pants="#1b2433" walk={walkM} wave={wave} skin="#e2b48f" />
      <Label
        text="Contratado"
        sub="operador logístico · início seg."
        accent="#5fe39a"
        check
        position={[-0.75, 1.15, 0.55]}
        vis={() => bump(ch.current.t % H_PERIOD, 4.4, 4.8, 7.0, 7.4)}
      />
      {/* forklift + crew */}
      <group ref={lift} userData={{ rigid: true }} position={[5.6, 0, 0]}>
        <Forklift>
          <B s={[0.7, 0.08, 0.7]} c="#b08a5a" />
          <B p={[0, 0.08, 0]} s={[0.6, 0.5, 0.6]} c="#c9a36b" />
        </Forklift>
      </group>
      {[0, 1].map((i) => (
        <Person key={i} ref={(el) => (workers.current[i] = el)} shirt="#f2b134" pants="#2a3242" hat="hard" walk={ONE} phase={i * 2} scale={0.85} />
      ))}
      {[
        [-6.4, 1.4],
        [-6.2, 3.6],
        [-4.8, 5.2],
        [2.0, 5.6],
        [6.6, -1.4],
        [-6.6, -1.4],
      ].map(([x, z]) => (
        <Rise key={`${x}${z}`} delay={0.6} all>
          <Tree p={[x, 0, z]} s={0.85} c="#4f9a6a" />
        </Rise>
      ))}
      <Bench p={[-3.6, 0, 0.6]} ry={Math.PI / 2} />
      <Lamp p={[1.6, 0, -1.4]} />
    </Island>
  );
}

/* ====================================================================== 5 · pix */
const P_PERIOD = 11.5;
function drawPixDiamond(g, cx, cy, r, color) {
  g.save();
  g.translate(cx, cy);
  g.rotate(Math.PI / 4);
  g.fillStyle = color;
  roundRect(g, -r, -r, r * 2, r * 2, r * 0.32);
  g.fill();
  g.restore();
}
function phoneTexture(paid) {
  return screenTexture(360, 680, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0f1a1c');
    bg.addColorStop(1, '#0a0f12');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.font = '500 20px "IBM Plex Mono", ui-monospace, monospace';
    g.fillText('9:41', 26, 40);
    drawPixDiamond(g, 46, 98, 13, '#32bcad');
    g.fillStyle = '#f3f2ee';
    g.font = '600 30px "IBM Plex Sans", system-ui, sans-serif';
    g.fillText('Pix', 74, 109);
    g.fillStyle = 'rgba(236,235,230,.6)';
    g.font = '400 22px "IBM Plex Sans", system-ui, sans-serif';
    g.fillText(paid ? 'Pagamento protegido' : 'Contrato · reforma', 26, 168);
    g.fillStyle = '#f3f2ee';
    g.font = '600 50px "IBM Plex Sans", system-ui, sans-serif';
    drawBRLCanvasText(g, 'R$ 10.000,00', 26, 228);
    if (!paid) {
      g.fillStyle = '#ffffff';
      roundRect(g, 60, 262, 240, 240, 18);
      g.fill();
      const r = rng(99);
      const cell = 200 / 21;
      g.fillStyle = '#0b0d12';
      for (let y = 0; y < 21; y++)
        for (let x = 0; x < 21; x++) {
          const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
          if (finder) {
            const fx = x > 13 ? x - 14 : x;
            const fy = y > 13 ? y - 14 : y;
            const ring = fx === 0 || fy === 0 || fx === 6 || fy === 6 || (fx > 1 && fx < 5 && fy > 1 && fy < 5);
            if (ring) g.fillRect(80 + x * cell, 282 + y * cell, cell + 0.5, cell + 0.5);
          } else if (r() < 0.48) g.fillRect(80 + x * cell, 282 + y * cell, cell + 0.5, cell + 0.5);
        }
      g.fillStyle = '#2ad1b8';
      roundRect(g, 26, 560, w - 52, 70, 16);
      g.fill();
      g.fillStyle = '#04201b';
      g.font = '600 26px "IBM Plex Sans", system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('Pagar com Pix', w / 2, 604);
    } else {
      g.fillStyle = '#2ad1b8';
      g.beginPath();
      g.arc(w / 2, 390, 84, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#04201b';
      g.lineWidth = 16;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(w / 2 - 38, 392);
      g.lineTo(w / 2 - 8, 422);
      g.lineTo(w / 2 + 42, 362);
      g.stroke();
      g.fillStyle = 'rgba(236,235,230,.7)';
      g.font = '400 22px "IBM Plex Sans", system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('Liberado na conclusão da obra', w / 2, 540);
    }
  });
}

function shieldGeometry() {
  const sh = new THREE.Shape();
  sh.moveTo(-0.62, 0.62);
  sh.lineTo(0.62, 0.62);
  sh.lineTo(0.62, 0.05);
  sh.quadraticCurveTo(0.6, -0.5, 0, -0.88);
  sh.quadraticCurveTo(-0.6, -0.5, -0.62, 0.05);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.18, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 14 });
  g.center();
  return g;
}

/** Contract paid by Pix → held by the partner institution → works concluded → released to the account (minus 2%). */
export function PixIsland() {
  const ch = useChapter();
  const PHONE = [-3.8, 0, 3.4];
  const VAULT = [0.2, 0, -0.4];
  const SITE = [3.7, 0, 2.4];
  const BANK = [4.0, 0, -3.6];
  const tokenArc = useMemo(() => new THREE.QuadraticBezierCurve3(v3(-3.4, 2.4, 3.8), v3(-1.6, 5.2, 1.6), v3(0.2, 2.5, -0.4)), []);
  const coinArc = useMemo(() => new THREE.QuadraticBezierCurve3(v3(0.2, 2.1, -0.4), v3(2.2, 5.0, -2.0), v3(4.0, 3.2, -3.6)), []);
  const screens = useMemo(() => [phoneTexture(false), phoneTexture(true)], []);
  const screenMat = useMemo(() => new THREE.MeshBasicMaterial({ map: screens[0], toneMapped: false }), [screens]);
  const shieldGeo = useMemo(() => shieldGeometry(), []);
  const shieldMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#2ad1b8', emissive: '#2ad1b8', emissiveIntensity: 0.2, roughness: 0.5, flatShading: true });
    m.userData.live = true; // glows while the payment is held
    return m;
  }, []);
  const token = useRef();
  const coins = useRef([]);
  const scan = useRef();
  const shield = useRef();
  const walls = useRef();
  const roof = useRef();
  const scaffold = useRef();
  const worker = useRef();
  const st = useRef({ token: 0, held: 0, walk: 0, wave: 0 });
  useFrame((state) => {
    const c = ch.current;
    if (!c.visible) return;
    const t = c.t % P_PERIOD;
    const S = st.current;
    const paid = t >= 1.4 && t < 11;
    if (screenMat.map !== screens[paid ? 1 : 0]) {
      screenMat.map = screens[paid ? 1 : 0];
      screenMat.needsUpdate = true;
    }
    scan.current.visible = t < 1.4;
    scan.current.position.y = lerp(0.9, 2.3, (t * 1.6) % 1);
    // money: phone → protected → released
    const k = seg(t, 1.4, 2.9);
    token.current.visible = k > 0 && k < 1;
    S.token = token.current.visible ? 1 : 0;
    if (token.current.visible) {
      tokenArc.getPoint(eio(k), token.current.position);
      token.current.rotation.y = t * 6;
    }
    S.held = bump(t, 2.8, 3.1, 6.6, 7.4);
    shieldMat.emissiveIntensity = 0.2 + S.held * 0.9;
    const T = c.reduced ? 0 : state.clock.elapsedTime;
    shield.current.rotation.y = Math.PI / 4 + Math.sin(T * 0.9) * 0.3;
    shield.current.position.y = 2.75 + Math.sin(T * 1.7) * 0.07 + S.held * 0.12;
    coins.current.forEach((g, i) => {
      if (!g) return;
      const q = seg(t, 6.6 + i * 0.22, 7.8 + i * 0.22);
      g.visible = q > 0 && q < 1;
      if (g.visible) {
        coinArc.getPoint(eio(q), g.position);
        g.rotation.y = t * 7 + i;
      }
    });
    // the works: walls go up, roof lands, scaffold comes down
    const build = c.reduced ? 1 : eo(seg(t, 3.0, 5.0));
    walls.current.scale.y = Math.max(0.12 + 0.88 * build, 0.001);
    const r = c.reduced ? 1 : seg(t, 5.0, 5.6);
    roof.current.visible = r > 0;
    roof.current.position.y = 1.0 + (1 - back(r)) * 1.4;
    const sc = c.reduced ? 0 : 1 - seg(t, 4.55, 4.95);
    scaffold.current.visible = sc > 0.001;
    scaffold.current.scale.y = Math.max(sc, 0.001);
    // worker paces along the site while building, then waves
    const w = worker.current;
    if (t < 5.6) {
      walkBetween(w, [SITE[0] - 1.5, SITE[2] + 1.6], [SITE[0] + 1.3, SITE[2] + 1.6], T, 0.7);
      S.walk = c.reduced ? 0 : 1;
      S.wave = 0;
    } else {
      w.rotation.y = 0.5;
      S.walk = 0;
      S.wave = bump(t, 5.7, 6.0, 7.0, 7.4);
    }
  });
  const tt = () => ch.current.t % P_PERIOD;
  return (
    <Island w={15} d={13} top="#e2eeec" lip="#c5dbd8" strata={['#9fdcd2', '#4fa79b', '#226862']} seed={67}>
      <B p={[0.2, 0, -0.2]} s={[4.8, 0.03, 4.2]} c="#d6e3e1" shadow={false} />
      {/* contractor pays by Pix */}
      <group position={PHONE} rotation={[0, Math.PI / 4, 0]}>
        <Rise delay={0.05} dur={0.9}>
          <Cy s={[1.6, 0.2, 1.0]} c="#c5ccd9" />
          <group position={[0, 0.2, 0]} rotation={[-0.12, 0, 0]}>
            <B s={[1.75, 3.3, 0.18]} c="#11151c" />
            <mesh geometry={GEO.plane} material={screenMat} position={[0, 1.65, 0.095]} scale={[1.58, 3.0, 1]} />
            <B ref={scan} userData={{ dyn: true }} p={[0, 1.5, 0.1]} s={[1.3, 0.04, 0.01]} c="#2ad1b8" e="#2ad1b8" ei={2} center />
          </group>
        </Rise>
      </group>
      <Person position={[-2.4, 0, 4.2]} rotation={[0, -2.2, 0]} shirt="#e5a53b" scale={0.95} />
      <Label text="Contrato R$ 10.000,00" sub="reforma · pago por Pix" accent="#4fe0c9" position={[-3.8, 3.85, 3.4]} vis={() => bump(tt(), 0.2, 0.6, 1.6, 2.0)} />
      {/* protected by the partner payment institution */}
      <group position={VAULT}>
        <Rise delay={0.25}>
          <B s={[1.9, 0.18, 1.7]} c="#c5ccd9" />
          <group rotation={[0, Math.PI / 4, 0]}>
            <B p={[0, 0.18, 0]} s={[1.5, 1.4, 1.3]} c="#2c3a52" />
            <Cy p={[0, 0.88, 0.66]} s={[0.9, 0.06, 0.9]} r={[Math.PI / 2, 0, 0]} c="#5d6f9c" center />
            <B p={[0, 0.88, 0.71]} s={[0.5, 0.07, 0.04]} c="#c9d3e0" center />
            <B p={[0, 0.88, 0.71]} s={[0.07, 0.5, 0.04]} c="#c9d3e0" center />
          </group>
        </Rise>
        <group ref={shield} userData={{ rigid: true }} position={[0, 2.75, 0]}>
          <Rise delay={0.45} all>
            <mesh geometry={shieldGeo} material={shieldMat} castShadow />
            <B p={[-0.17, -0.05, 0.16]} s={[0.36, 0.12, 0.05]} r={[0, 0, -Math.PI / 4]} c="#04201b" center />
            <B p={[0.12, 0.03, 0.16]} s={[0.6, 0.12, 0.05]} r={[0, 0, Math.PI / 4 + 0.05]} c="#04201b" center />
          </Rise>
        </group>
        <Glow color="#4fe0c9" size={3.2} position={[0, 2.8, 0]} vis={() => st.current.held} />
        <Pulse color="#23b3a6" radius={2.2} period={P_PERIOD} delay={2.9} y={0.22} />
      </group>
      <Label text="Pagamento protegido" sub="até a conclusão da obra" accent="#4fe0c9" position={[0.2, 3.75, -0.4]} vis={() => bump(tt(), 2.9, 3.3, 6.4, 6.8)} />
      {/* the works */}
      <group position={SITE}>
        <Rise delay={0.35}>
          <B s={[2.4, 0.1, 2.0]} c="#cfc9bd" />
        </Rise>
        <group ref={walls} userData={{ rigid: true }} position={[0, 0.1, 0]}>
          <B p={[0, 0, 0.84]} s={[2.0, 0.9, 0.12]} c="#f3efe7" />
          <B p={[0, 0, -0.84]} s={[2.0, 0.9, 0.12]} c="#f3efe7" />
          <B p={[0.94, 0, 0]} s={[0.12, 0.9, 1.6]} c="#f3efe7" />
          <B p={[-0.94, 0, 0]} s={[0.12, 0.9, 1.6]} c="#f3efe7" />
          <B p={[-0.4, 0, 0.91]} s={[0.36, 0.62, 0.02]} c="#5a4636" />
          <B p={[0.45, 0.35, 0.91]} s={[0.42, 0.3, 0.02]} c="#7f95b8" />
        </group>
        <group ref={roof} userData={{ rigid: true }} position={[0, 1.0, 0]} visible={false}>
          <mesh geometry={GEO.prism} material={mat('#c46a4a')} position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} scale={[2.6, 2.3, 1.2]} castShadow />
        </group>
        <group ref={scaffold} userData={{ rigid: true }}>
          {[
            [-1.15, 1.05],
            [1.15, 1.05],
            [-1.15, -1.05],
            [1.15, -1.05],
          ].map(([x, z]) => (
            <B key={`${x}${z}`} p={[x, 0, z]} s={[0.05, 1.5, 0.05]} c="#e5a53b" />
          ))}
          <B p={[0, 0.75, 1.05]} s={[2.35, 0.05, 0.22]} c="#b08a5a" />
        </group>
        <Pulse color="#5fe39a" radius={2} period={P_PERIOD} delay={5.7} y={0.12} />
      </group>
      <Person ref={worker} shirt="#f2b134" hat="hard" walk={() => st.current.walk} wave={() => st.current.wave} scale={0.9} />
      <Label text="Obra concluída" sub="confirmada pelo contratante" accent="#5fe39a" check position={[3.7, 2.6, 2.4]} vis={() => bump(tt(), 5.7, 6.1, 7.6, 8.0)} />
      {/* released to the account */}
      <group position={BANK} rotation={[0, Math.PI / 4, 0]}>
        <Rise delay={0.4}>
          <B s={[3.4, 0.15, 2.8]} c="#e6e2d8" />
          <B p={[0, 0.15, 0]} s={[3.1, 0.15, 2.5]} c="#ece8de" />
          <B p={[0, 0.3, 0]} s={[2.9, 0.3, 2.3]} c="#f2efe7" />
          <B p={[0, 0.6, -0.3]} s={[2.5, 1.5, 1.4]} c="#e9e5dc" />
          {[-1.2, -0.6, 0, 0.6, 1.2].map((x) => (
            <Cy key={x} p={[x, 0.6, 0.85]} s={[0.24, 1.5, 0.24]} c="#f6f3ec" />
          ))}
          <B p={[0, 2.1, 0]} s={[2.9, 0.25, 2.3]} c="#f2efe7" />
          <mesh geometry={GEO.prism} material={mat('#e9e5dc')} position={[0, 2.35 + 0.23, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[3.46, 2.3, 0.62]} castShadow />
        </Rise>
        <Pulse color="#23b3a6" radius={2.6} period={P_PERIOD} delay={8.6} y={0.32} />
      </group>
      <Label text="Liberado na conta" sub="R$ 9.800,00 · taxa TemPix 2%" accent="#4fe0c9" check position={[4.0, 3.5, -3.6]} vis={() => bump(tt(), 8.7, 9.1, 11.0, 11.4)} />
      {/* money in flight */}
      <group ref={token} userData={{ rigid: true }} visible={false}>
        <B s={[0.62, 0.62, 0.14]} r={[0, 0, Math.PI / 4]} c="#32bcad" e="#32bcad" ei={0.9} center />
        <Glow color="#4fe0c9" size={2.2} vis={() => st.current.token} />
      </group>
      {[0, 1, 2, 3, 4].map((i) => (
        <group key={i} ref={(el) => (coins.current[i] = el)} userData={{ dyn: true }} visible={false}>
          <Cy s={[0.42, 0.08, 0.42]} r={[Math.PI / 2, 0, 0]} c="#f2c94c" e="#c99a2e" ei={0.35} center />
        </group>
      ))}
      <Rise delay={0.6} all>
        <Truck position={[1.2, 0, 4.6]} rotation={[0, Math.PI / 2, 0]} cargo="#c46a4a" scale={0.85} />
      </Rise>
      {[
        [-6.3, 0.2],
        [-5.6, -2.4],
        [-1.6, -4.8],
        [6.2, 1.4],
        [6.4, 4.6],
        [-6.2, 5.2],
      ].map(([x, z]) => (
        <Rise key={`${x}${z}`} delay={0.6} all>
          <Tree p={[x, 0, z]} s={0.85} c="#4f9a86" />
        </Rise>
      ))}
      <Lamp p={[-1.6, 0, 1.4]} />
      <Lamp p={[2.0, 0, -1.6]} />
    </Island>
  );
}

/* =================================================================== 6 · painel */
function dashboardTexture() {
  return screenTexture(1024, 620, (g, w, h) => {
    g.fillStyle = '#0d0f12';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#121418';
    g.fillRect(0, 0, 200, h);
    drawPixDiamond(g, 40, 44, 13, '#2ad1b8');
    g.strokeStyle = '#04201b';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(33, 44);
    g.lineTo(38.5, 49.5);
    g.lineTo(47.5, 39);
    g.stroke();
    g.fillStyle = '#ecebe6';
    g.font = '600 26px "IBM Plex Sans", system-ui, sans-serif';
    g.fillText('TemPix', 64, 54);
    const nav = ['Painel', 'Oportunidades', 'Cargas', 'Equipes', 'Pix'];
    nav.forEach((n, i) => {
      if (i === 0) {
        g.fillStyle = 'rgba(42,209,184,.12)';
        roundRect(g, 14, 92 + i * 52, 172, 40, 8);
        g.fill();
      }
      g.fillStyle = i === 0 ? '#2ad1b8' : 'rgba(236,235,230,.6)';
      g.font = '500 20px "IBM Plex Sans", system-ui, sans-serif';
      g.fillText(n, 30, 119 + i * 52);
    });
    g.fillStyle = '#ecebe6';
    g.font = '600 30px "IBM Plex Sans", system-ui, sans-serif';
    g.fillText('Bom dia', 232, 60);
    g.fillStyle = 'rgba(236,235,230,.5)';
    g.font = '500 18px "IBM Plex Mono", ui-monospace, monospace';
    g.fillText('TUDO EM DIA', 232, 90);
    const cards = [
      ['Oportunidades', '12', 'novas hoje', '#2ad1b8'],
      ['Cargas em rota', '3', '1 chegando', '#ffb35c'],
      ['Contratações', '2', 'esta semana', '#5fe39a'],
      ['Pix recebido', 'R$ 4,8 mil', 'confirmado', '#4fe0c9'],
    ];
    cards.forEach(([k, v, s2, c], i) => {
      const x = 232 + (i % 2) * 388;
      const y = 120 + Math.floor(i / 2) * 150;
      g.fillStyle = '#171a1f';
      roundRect(g, x, y, 370, 132, 14);
      g.fill();
      g.fillStyle = c;
      g.fillRect(x, y + 22, 4, 40);
      g.fillStyle = 'rgba(236,235,230,.6)';
      g.font = '500 20px "IBM Plex Sans", system-ui, sans-serif';
      g.fillText(k, x + 24, y + 46);
      g.fillStyle = '#ecebe6';
      g.font = '600 44px "IBM Plex Sans", system-ui, sans-serif';
      drawBRLCanvasText(g, v, x + 24, y + 100);
      g.fillStyle = c;
      g.font = '500 18px "IBM Plex Mono", ui-monospace, monospace';
      g.textAlign = 'right';
      g.fillText(s2, x + 350, y + 100);
      g.textAlign = 'left';
    });
    g.fillStyle = '#171a1f';
    roundRect(g, 232, 428, 758, 160, 14);
    g.fill();
    g.strokeStyle = '#2ad1b8';
    g.lineWidth = 4;
    g.beginPath();
    const pts = [0.2, 0.35, 0.3, 0.5, 0.45, 0.62, 0.58, 0.75, 0.7, 0.86];
    pts.forEach((p, i) => {
      const x = 256 + (i / (pts.length - 1)) * 710;
      const y = 568 - p * 110;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
  });
}

const NOTES = [
  { text: 'Nova oportunidade', sub: '94% compatível · indústria', accent: '#2ad1b8', x: -2.7 },
  { text: 'Carga entregue', sub: 'Campinas · 14:40', accent: '#ffb35c', x: 2.7 },
  { text: 'Pix confirmado', sub: 'R$ 4.800,00', accent: '#4fe0c9', x: -2.4 },
  { text: 'Contratação registrada', sub: 'operador logístico', accent: '#5fe39a', x: 2.4 },
];
export function PanelIsland() {
  const ch = useChapter();
  const ring = useMemo(() => circleCurve(5.3), []);
  const dashMat = useMemo(() => new THREE.MeshBasicMaterial({ map: dashboardTexture(), toneMapped: false }), []);
  const movers = useRef([]);
  const notes = useRef([]);
  useFrame((state) => {
    const c = ch.current;
    if (!c.visible) return;
    const T = c.reduced ? 2 : state.clock.elapsedTime;
    movers.current.forEach((g, i) => g && placeOnCurve(g, ring, i / 3 + T * 0.03, 0.3));
    notes.current.forEach((g, i) => {
      if (!g) return;
      const tau = (((c.t - i * 1.6) % 6.4) + 6.4) % 6.4;
      g.position.y = 3.9 + eo(clamp01(tau / 1.6)) * 0.9;
    });
  });
  return (
    <Island w={15} d={13} top="#e3e7ef" lip="#c7cedd" strata={['#9fb0d4', '#5d6f9c', '#2c3a62']} seed={79}>
      <Road curve={ring} width={0.95} />
      <group rotation={[0, Math.PI / 4, 0]}>
        <Rise delay={0.05} dur={0.9}>
          <B p={[0, 0, 0.4]} s={[5.2, 0.2, 3.4]} c="#cfd5df" />
          <B p={[0, 0.2, 0.55]} s={[4.6, 0.02, 1.6]} c="#2a2f3a" />
          <B p={[0, 0.2, 1.75]} s={[1.4, 0.02, 0.45]} c="#b9c0cc" />
          <group position={[0, 0.2, -1.25]} rotation={[-0.2, 0, 0]}>
            <B p={[0, 0, -0.07]} s={[5.2, 3.3, 0.14]} c="#cfd5df" />
            <mesh geometry={GEO.plane} material={dashMat} position={[0, 1.65, 0.005]} scale={[4.9, 2.97, 1]} />
          </group>
        </Rise>
        <Glow color="#2ad1b8" size={7} position={[0, 1.9, -1.0]} vis={() => 0.35 * ch.current.on} />
      </group>
      {NOTES.map((n, i) => (
        <group key={n.text} ref={(el) => (notes.current[i] = el)} userData={{ dyn: true }} position={[n.x * 0.707, 3.9, n.x * -0.707]}>
          <Label
            text={n.text}
            sub={n.sub}
            accent={n.accent}
            check
            vis={() => {
              const tau = (((ch.current.t - i * 1.6) % 6.4) + 6.4) % 6.4;
              return bump(tau, 0, 0.25, 1.3, 1.55);
            }}
          />
        </group>
      ))}
      <Rise delay={0.5} all>
        <Truck ref={(el) => (movers.current[0] = el)} cargo="#24365e" scale={0.75} />
        <Truck ref={(el) => (movers.current[1] = el)} cargo="#2ad1b8" scale={0.75} />
        <Car ref={(el) => (movers.current[2] = el)} c="#e5a53b" scale={0.8} />
      </Rise>
      <Rise delay={0.3}>
        <Building p={[-6.2, 0, -4.6]} w={1.4} d={1.4} h={2.6} c="#e9edf4" lit={0.3} />
        <Warehouse p={[5.6, 0, -4.8]} w={2.4} d={1.4} h={1.0} roof="#5d6f9c" docks={2} />
        <Building p={[-5.9, 0, 4.4]} w={1.6} d={1.2} h={1.2} c="#f3efe7" roof="#2ad1b8" />
      </Rise>
      {[
        [6.4, 3.6],
        [6.6, 1.8],
        [-6.6, 2.4],
        [3.2, -5.8],
        [-2.8, 5.8],
      ].map(([x, z]) => (
        <Rise key={`${x}${z}`} delay={0.6} all>
          <Tree p={[x, 0, z]} s={0.85} c="#5f8fa0" />
        </Rise>
      ))}
    </Island>
  );
}
