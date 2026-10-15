/* Three.js stage for the descent: a long-lens camera that dives from island to island. */
import { useContext, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CHAPTERS, HOLD, N, SPACING, levelFromProgress } from './chapters.js';
import { ChapterCtx, WorldCtx, clamp01, damp, glowTex, lerp, rng } from './kit.jsx';
import { CityIsland, DemandIsland, HiringIsland, PanelIsland, PixIsland, RouteIsland, TerminalIsland } from './islands.jsx';
import { descentFrame } from './framing.js';
import { MachineIsland, PortIsland } from './port.jsx';
import { mergeStatic } from './merge.js';

const AZ0 = Math.PI / 4;
const AZ_STEP = 0.32;
const ELEV = 0.55;
const OFFSETS = [
  [0, 0],
  [3, -2.5],
  [-2, -2.5],
  [-2.5, 2],
  [2.5, -1.5],
  [2.5, 3],
  [-2.5, -2],
  [2, -3],
  [0, 0],
];
const FREEZE = [6, 13, 4, 7.6, 9, 8.4, 4.9, 6.6, 2];
const ISLANDS = [CityIsland, DemandIsland, MachineIsland, TerminalIsland, PortIsland, RouteIsland, HiringIsland, PixIsland, PanelIsland];
/** Seconds after an island first comes into view when every Rise has settled. */
const SETTLED = 2.4;

export const islandCenter = (k) => [OFFSETS[k][0], -k * SPACING, OFFSETS[k][1]];

/** Camera orbit offset that is continuous across holds and dives. */
function orbitOffset(p) {
  const x = clamp01(p) * N;
  const k = Math.min(Math.floor(x), N - 1);
  const u = Math.min(x - k, 1);
  if (k === N - 1) return 0.12 * u - 0.06;
  if (u < HOLD) return 0.12 * (u / HOLD) - 0.06;
  const e = (u - HOLD) / (1 - HOLD);
  const ee = e < 0.5 ? 4 * e * e * e : 1 - (-2 * e + 2) ** 3 / 2;
  return 0.06 - 0.12 * ee;
}

function Rig({ progress, pointer, stageRef, layout, onActive, mobile, reduced }) {
  const { camera, size, scene } = useThree();
  const world = useContext(WorldCtx);
  const hemi = useRef();
  const sun = useRef();
  const fill = useRef();
  const st = useRef({ p: progress.current, px: 0, py: 0, active: -1, vw: 0, vh: 0, lv: -1, base: 0, css: '', frame: 0 });
  const pal = useMemo(
    () =>
      CHAPTERS.map(({ palette: c }) => ({
        top: new THREE.Color(c.top),
        bottom: new THREE.Color(c.bottom),
        sky: new THREE.Color(c.sky),
        ground: new THREE.Color(c.ground),
        accent: new THREE.Color(c.accent),
      })),
    [],
  );
  const tmp = useMemo(() => ({ top: new THREE.Color(), bottom: new THREE.Color(), accent: new THREE.Color(), target: new THREE.Vector3() }), []);

  useEffect(() => {
    scene.add(sun.current.target);
    return () => scene.remove(sun.current?.target);
  }, [scene]);

  useFrame((state, delta) => {
    const s = st.current;
    const w = world.current;
    const dt = Math.min(delta, 0.25);
    // Shadows refresh every other frame: the map and its matrix stay paired,
    // so a skipped frame only delays moving shadows by ~16 ms.
    const sm = state.gl.shadowMap;
    if (sm.enabled) {
      sm.autoUpdate = false;
      s.frame += 1;
      sm.needsUpdate = s.frame % 2 === 1;
    }
    s.p = reduced ? progress.current : damp(s.p, progress.current, 5, dt);
    const { level } = levelFromProgress(s.p);
    w.level = level;
    s.px = damp(s.px, pointer.current.x, 2.5, dt);
    s.py = damp(s.py, pointer.current.y, 2.5, dt);

    const i = Math.min(Math.floor(level), N - 2);
    const f = level - i;
    const a = islandCenter(i);
    const b = islandCenter(i + 1);
    const target = tmp.target.set(lerp(a[0], b[0], f), lerp(a[1], b[1], f) + 1.2, lerp(a[2], b[2], f));

    const tanH = Math.tan((camera.fov * Math.PI) / 360);
    const dive = Math.sin(Math.PI * (level - Math.floor(level)));
    // Reframe when the canvas or the caption changes, so the island never sits under the text.
    const lv = layout?.current?.v ?? 0;
    if (s.vw !== size.width || s.vh !== size.height || s.lv !== lv) {
      s.vw = size.width;
      s.vh = size.height;
      s.lv = lv;
      const frame = descentFrame({ width: size.width, height: size.height, fov: camera.fov, mobile, copy: layout?.current });
      s.base = frame.distance;
      camera.setViewOffset(size.width, size.height, frame.offset.x, frame.offset.y, size.width, size.height);
    }
    const D = s.base * (1 + 0.32 * dive);
    const az = AZ0 + level * AZ_STEP + orbitOffset(s.p) + s.px * 0.12;
    const el = ELEV + dive * 0.18 - s.py * 0.06;
    camera.position.set(
      target.x + D * Math.cos(el) * Math.sin(az),
      target.y + D * Math.sin(el),
      target.z + D * Math.cos(el) * Math.cos(az),
    );
    camera.lookAt(target);
    camera.near = Math.max(D * 0.35, 1);
    camera.far = D + 160;
    camera.updateProjectionMatrix();
    w.ppu = size.height / (2 * D * tanH);

    // palette blend
    const j = Math.min(Math.floor(level), N - 1);
    const k = Math.min(j + 1, N - 1);
    const g = level - j;
    tmp.top.lerpColors(pal[j].top, pal[k].top, g);
    tmp.bottom.lerpColors(pal[j].bottom, pal[k].bottom, g);
    tmp.accent.lerpColors(pal[j].accent, pal[k].accent, g);
    if (scene.fog) {
      scene.fog.color.copy(tmp.bottom);
      scene.fog.near = D - 4;
      scene.fog.far = D + 36;
    }
    if (hemi.current) {
      hemi.current.color.lerpColors(pal[j].sky, pal[k].sky, g);
      hemi.current.groundColor.lerpColors(pal[j].ground, pal[k].ground, g);
    }
    if (sun.current) {
      sun.current.position.set(target.x + 9, target.y + 16, target.z + 5);
      sun.current.target.position.copy(target);
      sun.current.target.updateMatrixWorld();
    }
    // fill light shares the sun's target (a directional light only needs a direction)
    if (fill.current) {
      fill.current.position.set(target.x - 10, target.y + 6, target.z - 8);
      fill.current.target = sun.current.target;
    }
    const el2 = stageRef.current;
    if (el2) {
      const css = `${tmp.top.getHexString()}${tmp.bottom.getHexString()}${tmp.accent.getHexString()}`;
      if (css !== s.css) {
        s.css = css;
        el2.style.setProperty('--d-top', `#${tmp.top.getHexString()}`);
        el2.style.setProperty('--d-bottom', `#${tmp.bottom.getHexString()}`);
        el2.style.setProperty('--d-accent', `#${tmp.accent.getHexString()}`);
      }
      el2.style.setProperty('--d-fill', (level / (N - 1)).toFixed(4));
    }
    const active = Math.round(level);
    if (active !== s.active) {
      s.active = active;
      onActive(active);
    }
  }, -2);

  return (
    <>
      <hemisphereLight ref={hemi} intensity={1.35} />
      <ambientLight intensity={0.25} />
      <directionalLight
        ref={sun}
        intensity={2.1}
        color="#fff4e2"
        castShadow={!mobile}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-13}
        shadow-camera-right={13}
        shadow-camera-top={13}
        shadow-camera-bottom={-13}
        shadow-camera-near={1}
        shadow-camera-far={32}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={2}
      />
      {/* cool fill from the opposite side: no shadows, lifts the faces the sun misses */}
      <directionalLight ref={fill} intensity={0.45} color="#cfe0ff" />
    </>
  );
}

function Chapter({ index, children }) {
  const world = useContext(WorldCtx);
  const group = useRef();
  const state = useRef({ index, t: 0, t0: 0, first: null, since: -1, armed: false, visible: index === 0, on: 0, reduced: false, settled: 0, batched: 0, unmerge: null });
  useEffect(() => () => state.current.unmerge?.(), []);
  useFrame((st, delta) => {
    const s = state.current;
    const w = world.current;
    const now = st.clock.elapsedTime;
    const dist = Math.abs(w.level - index);
    s.visible = dist < 1.7;
    if (group.current) group.current.visible = s.visible;
    const armed = dist < 0.55;
    if (armed && !s.armed) s.t0 = now;
    s.armed = armed;
    if (dist < 1.05 && s.first === null) s.first = now;
    s.reduced = w.reduced;
    s.t = w.reduced ? FREEZE[index] : now - s.t0;
    s.since = s.first === null ? -1 : now - s.first;
    s.on = damp(s.on, armed ? 1 : 0, 4, Math.min(delta, 0.25));
    // Batch the static meshes into a few draw calls: first what is already in
    // place (a neighbour seen before it rises), then everything once risen.
    // A couple of frames of delay let each Rise apply its scale/visibility.
    if (s.visible && group.current && s.batched < 2) {
      s.settled += 1;
      const full = s.since > SETTLED;
      if (s.settled > 2 && (s.batched === 0 || full)) {
        s.unmerge?.();
        s.unmerge = mergeStatic(group.current);
        s.batched = full ? 2 : 1;
        s.settled = 0;
      }
    }
  }, -1);
  const [x, y, z] = islandCenter(index);
  return (
    <ChapterCtx.Provider value={state}>
      <group ref={group} position={[x, y, z]} rotation={[0, index * AZ_STEP, 0]}>
        {children}
      </group>
    </ChapterCtx.Provider>
  );
}

/** Lowers the pixel ratio when frames run long and restores it when they're fast again. */
function AdaptiveDpr({ max }) {
  const setDpr = useThree((s) => s.setDpr);
  const initial = useThree((s) => s.viewport.dpr);
  const st = useRef({ acc: 0, n: 0, dpr: initial, calm: 0 });
  useFrame((_, delta) => {
    const s = st.current;
    if (delta > 0.2) return; // tab switch or a one-off hitch
    s.acc += delta;
    s.n += 1;
    if (s.n < 90) return;
    const avg = s.acc / s.n;
    s.acc = 0;
    s.n = 0;
    if (avg > 1 / 42 && s.dpr > 1) {
      s.dpr = Math.max(1, Math.round((s.dpr - 0.25) * 4) / 4);
      s.calm = 0;
      setDpr(s.dpr);
    } else if (avg < 1 / 56 && s.dpr < max) {
      s.calm += 1;
      if (s.calm >= 4) {
        s.dpr = Math.min(max, s.dpr + 0.25);
        s.calm = 0;
        setDpr(s.dpr);
      }
    } else s.calm = 0;
  });
  return null;
}

/** Dust in the whole shaft + cloud banks between islands that we dive through. */
function Atmosphere() {
  const world = useContext(WorldCtx);
  const dust = useMemo(() => {
    const r = rng(3);
    const n = 900;
    const pos = new Float32Array(n * 3);
    const bottom = -(N - 1) * SPACING - 14;
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * 46;
      pos[i * 3 + 1] = 10 + r() * (bottom - 10);
      pos[i * 3 + 2] = (r() - 0.5) * 46;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  const dustMat = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 3,
        sizeAttenuation: false,
        map: glowTex(),
        transparent: true,
        depthWrite: false,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        fog: false,
        color: '#ffffff',
      }),
    [],
  );
  const banks = useMemo(() => {
    const r = rng(17);
    return Array.from({ length: N - 1 }, (_, g) => {
      const a = islandCenter(g);
      const b = islandCenter(g + 1);
      const material = new THREE.SpriteMaterial({ map: glowTex(), color: '#ffffff', transparent: true, depthWrite: false, opacity: 0, fog: false });
      const puffs = Array.from({ length: 14 }, () => {
        const ang = r() * Math.PI * 2;
        const rad = 2 + r() * 13;
        return {
          p: [lerp(a[0], b[0], 0.5) + Math.cos(ang) * rad, -(g + 0.5) * SPACING + (r() - 0.5) * 7, lerp(a[2], b[2], 0.5) + Math.sin(ang) * rad],
          s: 9 + r() * 12,
        };
      });
      return { material, puffs };
    });
  }, []);
  const points = useRef();
  const groups = useRef([]);
  useFrame((state) => {
    const L = world.current.level;
    banks.forEach((bk, g) => {
      bk.material.opacity = 0.5 * clamp01(1 - Math.abs(L - (g + 0.5)) * 1.8);
      // a faded bank still costs one draw call per puff, so hide it
      if (groups.current[g]) groups.current[g].visible = bk.material.opacity > 0.004;
    });
    if (points.current) points.current.rotation.y = state.clock.elapsedTime * 0.012;
  });
  return (
    <>
      <points ref={points} geometry={dust} material={dustMat} />
      {banks.map((bk, g) => (
        <group key={g} ref={(el) => (groups.current[g] = el)} visible={false}>
          {bk.puffs.map((p, i) => (
            <sprite key={i} material={bk.material} position={p.p} scale={[p.s, p.s * 0.62, 1]} renderOrder={5} />
          ))}
        </group>
      ))}
    </>
  );
}

export default function DescentScene({ progress, pointer, stageRef, layout, onActive, onReady, mobile, reduced, running }) {
  const world = useRef({ level: 0, ppu: 30, labelScale: 1, compact: mobile, reduced });
  world.current.reduced = reduced;
  world.current.compact = mobile;
  world.current.labelScale = mobile ? 0.86 : 1;
  world.current.shadows = !mobile;
  return (
    <Canvas
      shadows={mobile ? false : 'percentage'}
      dpr={mobile ? [1, 1.5] : [1, 1.75]}
      camera={{ fov: mobile ? 24 : 22, position: [40, 30, 40], near: 1, far: 400 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      frameloop={running ? 'always' : 'never'}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.toneMapping = THREE.NeutralToneMapping;
        onReady?.();
      }}
    >
      <WorldCtx.Provider value={world}>
        <fog attach="fog" args={['#0e1830', 40, 120]} />
        <Rig progress={progress} pointer={pointer} stageRef={stageRef} layout={layout} onActive={onActive} mobile={mobile} reduced={reduced} />
        <AdaptiveDpr max={mobile ? 1.5 : 1.75} />
        <Atmosphere />
        {ISLANDS.map((Island, i) => (
          <Chapter key={CHAPTERS[i].id} index={i}>
            <Island />
          </Chapter>
        ))}
      </WorldCtx.Provider>
    </Canvas>
  );
}
