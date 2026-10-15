/* Obra de montagem de galpão: munck içando uma tesoura metálica, britadeira
   em área isolada e soldador com EPI. Built from the same kit as the
   opening islands, so it reads as part of TemPix. Loaded on demand. */
import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { B, Ball, Cy, GEO, Glow, Island, Label, Person, Truck, WorldCtx, damp, mat } from '../descent/kit.jsx';

const STEEL = '#5d6f86';
const STEEL_DARK = '#44546a';
const SAFETY = '#f28c28';

/** Box between two points (structural member). */
function Bar({ a, b, t = 0.12, c = STEEL }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return { pos: va.add(vb).multiplyScalar(0.5), quat: q, len: dir.length() };
  }, [a, b]);
  return <mesh geometry={GEO.box} material={mat(c, { metal: 0.3, rough: 0.6 })} position={pos} quaternion={quat} scale={[t, len, t]} castShadow receiveShadow />;
}

/** Tesoura metálica (Pratt truss) spanning z ∈ [-span/2, span/2], bottom chord at y = 0. */
function Truss({ span = 4, h = 1.3, c = STEEL }) {
  const half = span / 2;
  const n = 4;
  const members = [];
  members.push([[0, 0, -half], [0, 0, half], 0.14]);
  members.push([[0, 0, -half], [0, h, 0], 0.14]);
  members.push([[0, 0, half], [0, h, 0], 0.14]);
  for (let i = 1; i < n; i++) {
    const z = -half + (i * span) / n;
    const y = h * (1 - Math.abs(z) / half);
    members.push([[0, 0, z], [0, y, z], 0.07]);
    const zn = -half + ((i + (z < 0 ? 1 : -1)) * span) / n;
    const yn = h * (1 - Math.abs(zn) / half);
    if (Math.abs(zn) < half) members.push([[0, 0, z], [0, yn, zn], 0.06]);
  }
  return (
    <group>
      {members.map(([a, b, t], i) => (
        <Bar key={i} a={a} b={b} t={t} c={c} />
      ))}
    </group>
  );
}

const BAYS = [-6, -3.5, -1];
const ROWS = [-4, 0];
const COL_H = 4;

function Frame() {
  return (
    <group>
      {/* slab of the warehouse */}
      <B p={[-3.5, 0, -2]} s={[7.4, 0.06, 5]} c="#cfc9bd" shadow={false} />
      {BAYS.map((x) =>
        ROWS.map((z) => (
          <group key={`${x}${z}`}>
            <B p={[x, 0.06, z]} s={[0.5, 0.06, 0.5]} c="#9aa3ad" />
            <B p={[x, 0.06, z]} s={[0.22, COL_H, 0.22]} c={STEEL} />
          </group>
        )),
      )}
      {/* eave beams */}
      {ROWS.map((z) => (
        <Bar key={z} a={[-6, COL_H + 0.06, z]} b={[-1, COL_H + 0.06, z]} t={0.16} c={STEEL_DARK} />
      ))}
      {/* two trusses already in place, with purlins between them */}
      {BAYS.slice(0, 2).map((x) => (
        <group key={x} position={[x, COL_H + 0.14, -2]}>
          <Truss />
        </group>
      ))}
      {[0.35, 0.7].map((k) =>
        [-1, 1].map((side) => {
          const z = -2 + side * 2 * (1 - k);
          const y = COL_H + 0.14 + 1.3 * k;
          return <Bar key={`${k}${side}`} a={[-6, y, z]} b={[-3.5, y, z]} t={0.07} c={STEEL_DARK} />;
        }),
      )}
      {/* steel beams waiting on the ground */}
      {[0, 0.2, 0.4].map((dy, i) => (
        <B key={i} p={[1.6, dy, -4.4 + (i % 2) * 0.08]} s={[3.2, 0.18, 0.2]} c={i === 1 ? STEEL_DARK : STEEL} />
      ))}
    </group>
  );
}

/** Munck with a telescopic boom lifting the third truss onto the frame. */
function Munck({ reduced }) {
  const truss = useRef();
  const cable = useRef();
  const slings = useRef([]);
  const st = useRef({ y: 0 });
  // Boom: from the crane column top to the tip above the truss bay.
  const base = new THREE.Vector3(2.15, 1.7, -2);
  const tip = new THREE.Vector3(-1, 7.4, -2);
  const boom = useMemo(() => {
    const dir = tip.clone().sub(base);
    return { len: dir.length(), angle: Math.atan2(dir.y, dir.x) };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((state, delta) => {
    const t = reduced ? 0 : state.clock.elapsedTime;
    // Slowly lowers the truss towards the columns and lifts it again.
    const target = 0.5 + 0.45 * Math.sin(t * 0.45);
    st.current.y = damp(st.current.y, target, 3, Math.min(delta, 0.1));
    const y = COL_H + 0.14 + st.current.y;
    if (truss.current) {
      truss.current.position.y = y;
      truss.current.rotation.y = reduced ? 0 : Math.sin(t * 0.7) * 0.025;
    }
    const hookY = y + 1.3 + 0.75;
    if (cable.current) {
      const len = tip.y - hookY;
      cable.current.position.y = hookY + len / 2;
      cable.current.scale.y = len;
    }
    slings.current.forEach((s, i) => {
      if (!s) return;
      const z = i === 0 ? -1.15 : 1.15;
      const from = new THREE.Vector3(-1, hookY, -2);
      const to = new THREE.Vector3(-1, y + 1.3 * (1 - Math.abs(z) / 2), -2 + z);
      const dir = to.clone().sub(from);
      s.position.copy(from.clone().add(to).multiplyScalar(0.5));
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      s.scale.set(0.025, dir.length(), 0.025);
    });
  });
  return (
    <group>
      {/* truck: cab facing +x, crane on the flatbed */}
      <Truck kind="flat" cab="#f2b134" cargo="#2a3242" scale={1.6} position={[3.4, 0, -2]} rotation={[0, Math.PI / 2, 0]} />
      {/* stabilizer legs */}
      {[-0.9, 0.9].map((dz) => (
        <group key={dz}>
          <B p={[2.4, 0.38, -2 + dz]} s={[0.12, 0.08, 0.7]} c={SAFETY} />
          <B p={[2.4, 0, -2 + dz * 1.35]} s={[0.1, 0.42, 0.1]} c={SAFETY} />
          <B p={[2.4, 0, -2 + dz * 1.35]} s={[0.36, 0.05, 0.36]} c="#3a3f48" />
        </group>
      ))}
      <Cy p={[2.15, 0.62, -2]} s={[0.36, 1.1, 0.36]} c={SAFETY} />
      <group position={base.toArray()} rotation={[0, 0, boom.angle]}>
        <B p={[boom.len * 0.3, 0, 0]} s={[boom.len * 0.6, 0.26, 0.26]} c={SAFETY} center />
        <B p={[boom.len * 0.78, 0, 0]} s={[boom.len * 0.46, 0.18, 0.18]} c="#f5a347" center />
        <B p={[boom.len * 0.26, -0.24, 0]} s={[0.9, 0.12, 0.12]} c="#c9ced8" center />
      </group>
      <Ball p={tip.toArray()} s={0.24} c="#2a3242" />
      {/* cable, hook and two slings */}
      <mesh ref={cable} geometry={GEO.box} material={mat('#20242c')} position={[-1, 6.5, -2]} scale={[0.035, 1, 0.035]} />
      {[0, 1].map((i) => (
        <mesh key={i} ref={(el) => (slings.current[i] = el)} geometry={GEO.box} material={mat('#e0b23a')} />
      ))}
      <group ref={truss} position={[-1, COL_H + 0.6, -2]}>
        <Truss c="#6f86a3" />
        <Label text="Munck 12 t" sub="içando a tesoura" accent="#ffb35c" position={[0, 2.1, 2.6]} />
      </group>
      {/* worker on the scissor lift guiding the truss */}
      <group position={[0.2, 0, -0.4]}>
        {[0.6, 1.2, 1.8].map((y, i) => (
          <group key={y}>
            <Bar a={[-0.45, y - 0.6, -0.35]} b={[0.45, y, -0.35]} t={0.06} c="#3e4a5c" />
            <Bar a={[0.45, y - 0.6, -0.35]} b={[-0.45, y, -0.35]} t={0.06} c="#3e4a5c" />
            {i === 0 && <B p={[0, 0, 0]} s={[1.1, 0.24, 0.9]} c="#f2b134" />}
          </group>
        ))}
        <B p={[0, 1.8, 0]} s={[1.1, 0.08, 0.9]} c="#f2b134" />
        <B p={[0, 1.88, 0.44]} s={[1.1, 0.5, 0.03]} c="#f2b134" />
        <Person position={[0, 1.88, 0]} rotation={[0, Math.PI, 0]} shirt={SAFETY} hat="hard" wave={() => 0.7} />
      </group>
    </group>
  );
}

/** Worker breaking the floor with a jackhammer, inside a cordoned area. */
function Jackhammer({ reduced }) {
  const tool = useRef();
  const body = useRef();
  const dust = useRef([]);
  const seeds = useMemo(() => Array.from({ length: 7 }, (_, i) => ({ a: (i / 7) * Math.PI * 2, s: 0.6 + (i % 3) * 0.2, o: i / 7 })), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const on = reduced ? 0 : 1;
    const j = Math.sin(t * 60) * 0.02 * on;
    if (tool.current) tool.current.position.y = j;
    if (body.current) body.current.position.y = j * 0.4;
    dust.current.forEach((m, i) => {
      if (!m) return;
      const k = reduced ? 0.5 : (t * 0.8 + seeds[i].o) % 1;
      m.position.set(Math.cos(seeds[i].a) * 0.45 * k, 0.05 + k * 0.5 * seeds[i].s, Math.sin(seeds[i].a) * 0.45 * k);
      m.scale.setScalar(0.08 + k * 0.14);
      m.material.opacity = (1 - k) * 0.55;
    });
  });
  const dustMat = useMemo(() => Array.from({ length: 7 }, () => new THREE.MeshBasicMaterial({ color: '#d9d1c1', transparent: true, depthWrite: false })), []);
  const corners = [
    [2.4, 1.6],
    [5.4, 1.6],
    [5.4, 4.4],
    [2.4, 4.4],
  ];
  return (
    <group>
      {/* concrete floor being broken */}
      <B p={[3.9, 0, 3]} s={[3, 0.04, 2.8]} c="#b7b1a5" shadow={false} />
      <B p={[3.4, 0.03, 3]} s={[1.1, 0.02, 0.8]} c="#7d766b" shadow={false} />
      {[
        [3.1, 2.8, 0.4],
        [3.6, 3.3, -0.6],
        [3.3, 3.2, 1.2],
      ].map(([x, z, r], i) => (
        <B key={i} p={[x, 0.05, z]} s={[0.5, 0.012, 0.03]} r={[0, r, 0]} c="#4b463f" shadow={false} />
      ))}
      {[...Array(6)].map((_, i) => (
        <B key={i} p={[3.0 + (i % 3) * 0.32, 0.03, 3.45 + Math.floor(i / 3) * 0.18]} s={[0.14, 0.09, 0.12]} r={[0, i, 0]} c="#a39c8f" />
      ))}
      {/* cones + tape: delimited safe area */}
      {corners.map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <B p={[0, 0, 0]} s={[0.34, 0.04, 0.34]} c="#2a2f37" />
          <Cy g={GEO.cone} p={[0, 0.04, 0]} s={[0.26, 0.55, 0.26]} c={SAFETY} />
          <Cy p={[0, 0.26, 0]} s={[0.17, 0.08, 0.17]} c="#ffffff" />
        </group>
      ))}
      {corners.map(([x, z], i) => {
        const [nx, nz] = corners[(i + 1) % 4];
        return <Bar key={i} a={[x, 0.5, z]} b={[nx, 0.5, nz]} t={0.03} c={i % 2 ? '#e34b3f' : '#f5f1e8'} />;
      })}
      {/* worker with the jackhammer */}
      <group position={[3.85, 0, 3.05]}>
        <group ref={body}>
          <Person rotation={[0, -Math.PI / 2, 0]} shirt={SAFETY} pants="#2c3a52" hat="hard" wave={() => 0.15}>
            {/* ear protection + glasses */}
            <B p={[0.15, 0.82, 0]} s={[0.05, 0.1, 0.1]} c="#e34b3f" />
            <B p={[-0.15, 0.82, 0]} s={[0.05, 0.1, 0.1]} c="#e34b3f" />
            <B p={[0, 0.88, 0.13]} s={[0.2, 0.05, 0.02]} c="#1b2433" />
          </Person>
        </group>
        <group ref={tool} position={[-0.42, 0, 0]}>
          <Cy p={[0, 0.02, 0]} s={[0.04, 0.18, 0.04]} c="#9aa3ad" />
          <Cy p={[0, 0.2, 0]} s={[0.15, 0.5, 0.15]} c="#e0b23a" />
          <B p={[0, 0.7, 0]} s={[0.07, 0.1, 0.07]} c="#2a2f37" />
          <B p={[0, 0.78, 0]} s={[0.05, 0.05, 0.42]} c="#2a2f37" />
        </group>
        <group position={[-0.42, 0, 0]}>
          {seeds.map((_, i) => (
            <mesh key={i} ref={(el) => (dust.current[i] = el)} geometry={GEO.sph} material={dustMat[i]} />
          ))}
        </group>
        <Label text="Britadeira" sub="área isolada" accent="#f2b134" position={[0, 1.55, 0]} />
      </group>
    </group>
  );
}

/** Welder with mask and leather gear, controlled sparks on a steel beam. */
function Welder({ reduced }) {
  const light = useRef();
  const glow = useRef(1);
  const sparks = useRef([]);
  const seeds = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ a: (i / 14) * Math.PI * 2, v: 0.7 + ((i * 37) % 10) / 12, o: (i * 0.137) % 1 })), []);
  const sparkMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd27a', toneMapped: false }), []);
  const WELD = [-2.6, 0.92, 3.45];
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const f = reduced ? 0.8 : 0.65 + 0.35 * Math.abs(Math.sin(t * 23) * Math.cos(t * 7.3));
    glow.current = f;
    if (light.current) light.current.intensity = 2.2 * f;
    sparks.current.forEach((m, i) => {
      if (!m) return;
      const s = seeds[i];
      const k = reduced ? 0.3 : (t * 1.6 + s.o) % 1;
      m.position.set(Math.cos(s.a) * s.v * k * 0.5, k * 0.45 * s.v - k * k * 0.9, Math.sin(s.a) * s.v * k * 0.5);
      m.scale.setScalar(0.035 * (1 - k) + 0.008);
    });
  });
  return (
    <group>
      {/* trestles + beam being welded */}
      {[-3.4, -1.8].map((x) => (
        <group key={x}>
          <Bar a={[x - 0.2, 0, 3.25]} b={[x, 0.78, 3.45]} t={0.05} c="#3e4a5c" />
          <Bar a={[x + 0.2, 0, 3.25]} b={[x, 0.78, 3.45]} t={0.05} c="#3e4a5c" />
          <Bar a={[x - 0.2, 0, 3.65]} b={[x, 0.78, 3.45]} t={0.05} c="#3e4a5c" />
          <Bar a={[x + 0.2, 0, 3.65]} b={[x, 0.78, 3.45]} t={0.05} c="#3e4a5c" />
        </group>
      ))}
      <B p={[-2.6, 0.78, 3.45]} s={[2.4, 0.14, 0.18]} c={STEEL} />
      <B p={[-2.6, 0.78, 3.45]} s={[0.12, 0.42, 0.42]} c={STEEL_DARK} />
      {/* gas cylinders + machine */}
      <Cy p={[-4.0, 0, 4.2]} s={[0.24, 0.95, 0.24]} c="#3f7d5a" />
      <Cy p={[-4.3, 0, 4.25]} s={[0.24, 0.95, 0.24]} c="#9b3b3b" />
      <B p={[-3.6, 0, 4.6]} s={[0.5, 0.42, 0.34]} c="#2f6fb0" />
      <Bar a={[-3.6, 0.3, 4.45]} b={[-2.75, 0.85, 3.6]} t={0.025} c="#1b1e25" />
      {/* welder: leather apron, gloves, welding mask */}
      <group position={[-2.6, 0, 4.12]} rotation={[0, Math.PI, 0]}>
        <Person shirt="#6b4b3a" pants="#2c3a52" hat="hard" wave={() => 0.55}>
          <B p={[0, 0.82, 0.12]} s={[0.26, 0.26, 0.08]} c="#1b1e25" />
          <B p={[0, 0.84, 0.165]} s={[0.14, 0.05, 0.01]} c="#3a5a3f" e="#6bff8a" ei={0.15} />
          <B p={[0, 0.2, 0.11]} s={[0.3, 0.42, 0.02]} c="#8a5a3c" />
        </Person>
      </group>
      <group position={WELD}>
        <pointLight ref={light} color="#ffb35c" intensity={2} distance={3.5} decay={2} />
        <Glow color="#ffcf7a" size={0.9} vis={() => glow.current} />
        {seeds.map((_, i) => (
          <mesh key={i} ref={(el) => (sparks.current[i] = el)} geometry={GEO.box} material={sparkMat} />
        ))}
      </group>
      <group position={[-2.6, 0, 3.8]}>
        <Label text="Soldagem" sub="EPI completo" accent="#5fe39a" position={[-0.6, 1.6, 0]} />
      </group>
    </group>
  );
}

function Rig({ reduced, mobile }) {
  const { camera, size } = useThree();
  const look = useMemo(() => new THREE.Vector3(-0.3, mobile ? 2.2 : 2.0, 0.9), [mobile]);
  useFrame((state) => {
    const t = reduced ? 0 : state.clock.elapsedTime;
    const az = Math.PI / 4 + 0.1 + Math.sin(t * 0.12) * 0.16;
    const el = 0.5;
    const tanH = Math.tan((camera.fov * Math.PI) / 360);
    // Fit the whole site: munck tip, frame and both workers stay in view.
    const [fh, fw] = mobile ? [12.5, 14.5] : [12.8, 17.5];
    const D = Math.max(fh / (2 * tanH), fw / (2 * tanH * (size.width / size.height)));
    camera.position.set(look.x + D * Math.cos(el) * Math.sin(az), look.y + D * Math.sin(el), look.z + D * Math.cos(el) * Math.cos(az));
    camera.lookAt(look);
  }, -2);
  return null;
}

function World({ reduced, mobile, children }) {
  const world = useRef({ level: 0, ppu: 30, labelScale: mobile ? 0.82 : 0.95, compact: mobile, reduced });
  world.current.reduced = reduced;
  world.current.compact = mobile;
  world.current.labelScale = mobile ? 0.82 : 0.95;
  const { camera, size } = useThree();
  useFrame(() => {
    const tanH = Math.tan((camera.fov * Math.PI) / 360);
    world.current.ppu = size.height / (2 * camera.position.distanceTo(new THREE.Vector3(0, 2, 0)) * tanH);
  }, -1);
  return <WorldCtx.Provider value={world}>{children}</WorldCtx.Provider>;
}

export default function ConstructionScene({ mobile = false, reduced = false, running = true }) {
  return (
    <Canvas
      shadows={!mobile}
      dpr={mobile ? [1, 1.5] : [1, 1.75]}
      camera={{ fov: 30, position: [20, 14, 20], near: 1, far: 200 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      frameloop={running ? 'always' : 'never'}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.toneMapping = THREE.NeutralToneMapping;
      }}
    >
      <World reduced={reduced} mobile={mobile}>
        <hemisphereLight args={['#dfe9ff', '#3a3326', 1.25]} />
        <ambientLight intensity={0.25} />
        <directionalLight position={[8, 16, 9]} intensity={2.1} color="#fff2dc" castShadow={!mobile} shadow-mapSize={[1024, 1024]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} />
        <Rig reduced={reduced} mobile={mobile} />
        <Island w={17} d={12.5} top="#e6e0d3" lip="#cfc7b6" strata={['#bfb6a3', '#8f8571', '#5f5747']} seed={7}>
          <Frame />
          <Munck reduced={reduced} />
          <Jackhammer reduced={reduced} />
          <Welder reduced={reduced} />
        </Island>
      </World>
    </Canvas>
  );
}
