import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useInView, useIsMobile, usePrefersReducedMotion } from '../../lib/hooks.js';
import styles from './OpportunityRadar.module.css';
import { BRLText } from '../brand/BRLIcon.jsx';

const RADIUS = 4.4;
const RINGS = [1.1, 2.2, 3.3, RADIUS];
const COLORS = {
  primary: new THREE.Color('#2ad1b8'),
  revenue: new THREE.Color('#3fbf86'),
  amber: new THREE.Color('#e5a53b'),
  line: new THREE.Color('#2a2f37'),
  lineStrong: new THREE.Color('#3a404a'),
  text: new THREE.Color('#ecebe6'),
};

const toneFor = (match) => (match >= 85 ? 'primary' : match >= 70 ? 'revenue' : 'amber');

function circlePoints(r, segments = 128) {
  const pts = [];
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  return pts;
}

/* ------------------------------------------------------------------ grid */
function Grid() {
  const objects = useMemo(() => {
    const list = [];
    RINGS.forEach((r, i) => {
      const geo = new THREE.BufferGeometry().setFromPoints(circlePoints(r));
      const mat = new THREE.LineBasicMaterial({
        color: i === RINGS.length - 1 ? COLORS.lineStrong : COLORS.line,
        transparent: true,
        opacity: i === RINGS.length - 1 ? 0.9 : 0.75,
      });
      list.push(new THREE.Line(geo, mat));
    });
    const spokes = [];
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      spokes.push(new THREE.Vector3(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35));
      spokes.push(new THREE.Vector3(Math.cos(a) * RADIUS, 0, Math.sin(a) * RADIUS));
    }
    list.push(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(spokes),
        new THREE.LineBasicMaterial({ color: COLORS.line, transparent: true, opacity: 0.45 }),
      ),
    );
    // Tick marks on the outer ring
    const ticks = [];
    for (let i = 0; i < 72; i += 1) {
      const a = (i / 72) * Math.PI * 2;
      const inner = i % 6 === 0 ? RADIUS - 0.18 : RADIUS - 0.08;
      ticks.push(new THREE.Vector3(Math.cos(a) * inner, 0, Math.sin(a) * inner));
      ticks.push(new THREE.Vector3(Math.cos(a) * RADIUS, 0, Math.sin(a) * RADIUS));
    }
    list.push(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(ticks),
        new THREE.LineBasicMaterial({ color: COLORS.lineStrong, transparent: true, opacity: 0.8 }),
      ),
    );
    return list;
  }, []);
  useEffect(
    () => () =>
      objects.forEach((o) => {
        o.geometry.dispose();
        o.material.dispose();
      }),
    [objects],
  );
  return objects.map((o, i) => <primitive key={i} object={o} />);
}

/* ----------------------------------------------------------------- sweep */
const sweepMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: COLORS.primary }, uSpan: { value: 0.85 } },
    vertexShader: `varying vec2 vPos; void main(){ vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uSpan; varying vec2 vPos;
      void main(){
        float a = atan(vPos.y, vPos.x);
        if (a < 0.0) a += 6.28318530718;
        float t = clamp(a / uSpan, 0.0, 1.0);
        float r = length(vPos) / ${RADIUS.toFixed(1)};
        float alpha = pow(t, 2.4) * 0.32 * (0.35 + 0.65 * r);
        gl_FragColor = vec4(uColor, alpha);
      }`,
  });

function Sweep({ angleRef, speed, animate }) {
  const ref = useRef();
  const geometry = useMemo(() => new THREE.CircleGeometry(RADIUS, 64, 0, 0.85), []);
  const material = useMemo(sweepMaterial, []);
  const edge = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(RADIUS, 0, 0)]);
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: COLORS.primary, transparent: true, opacity: 0.85 }));
  }, []);
  useFrame((_, dt) => {
    if (animate) angleRef.current = (angleRef.current + dt * speed) % (Math.PI * 2);
    if (ref.current) ref.current.rotation.y = -angleRef.current;
  });
  return (
    <group ref={ref}>
      {/* Wedge lies on XZ; its leading edge is at angle uSpan, aligned with the edge line. */}
      <mesh geometry={geometry} material={material} rotation={[Math.PI / 2, 0, -0.85]} position={[0, 0.002, 0]} />
      <primitive object={edge} />
    </group>
  );
}

/* ------------------------------------------------------------- particles */
function Particles({ count, animate }) {
  const ref = useRef();
  const geometry = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const r = Math.sqrt(Math.random()) * RADIUS * 1.25;
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = (Math.random() - 0.3) * 1.2;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [count]);
  const material = useMemo(
    () => new THREE.PointsMaterial({ size: 0.022, color: '#8b929c', transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true }),
    [],
  );
  useFrame((_, dt) => {
    if (animate && ref.current) ref.current.rotation.y += dt * 0.015;
  });
  return <points ref={ref} geometry={geometry} material={material} />;
}

/* ------------------------------------------------------------- core node */
function Core({ animate }) {
  const pulse = useRef();
  useFrame(({ clock }) => {
    if (!pulse.current) return;
    const t = animate ? (clock.elapsedTime % 2.4) / 2.4 : 0.4;
    pulse.current.scale.setScalar(1 + t * 4);
    pulse.current.material.opacity = 0.5 * (1 - t);
  });
  return (
    <group>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.06, 32]} />
        <meshBasicMaterial color={COLORS.text} />
      </mesh>
      <mesh ref={pulse} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.22, 0.26, 48]} />
        <meshBasicMaterial color={COLORS.primary} transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ nodes */
function Nodes({ nodes, sweepAngle, animate, labelRefs, coreLabelRef, cardRef, hovered, setHovered, onSelect, size }) {
  const { camera } = useThree();
  const groupRefs = useRef([]);
  const pulseRefs = useRef([]);
  const travelRefs = useRef([]);
  const state = useMemo(
    () =>
      nodes.map((n, i) => {
        const golden = 2.399963 * i;
        const radius = 1.2 + (1 - Math.min(1, (n.match ?? 70) / 100)) * 6 + ((i * 0.37) % 1) * 0.8;
        return {
          angle: golden % (Math.PI * 2),
          radius: Math.min(RADIUS - 0.3, Math.max(1.1, radius)),
          speed: 0.025 + ((i * 0.13) % 0.04),
          lastHit: -10,
          phase: (i * 0.29) % 1,
        };
      }),
    [nodes],
  );

  const lines = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(1, nodes.length) * 6), 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: COLORS.primary, transparent: true, opacity: 0.16 }));
  }, [nodes.length]);

  const v = useMemo(() => new THREE.Vector3(), []);
  const project = (x, y, z) => {
    v.set(x, y, z).project(camera);
    return [(v.x * 0.5 + 0.5) * size.width, (-v.y * 0.5 + 0.5) * size.height, v.z];
  };

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const pos = lines.geometry.attributes.position.array;
    state.forEach((s, i) => {
      if (animate) s.angle = (s.angle + dt * s.speed) % (Math.PI * 2);
      const x = Math.cos(s.angle) * s.radius;
      const z = Math.sin(s.angle) * s.radius;
      const g = groupRefs.current[i];
      if (g) g.position.set(x, 0.05, z);
      pos.set([0, 0.03, 0, x, 0.03, z], i * 6);

      // Sweep contact → pulse ring
      const diff = Math.abs(((s.angle - sweepAngle.current + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (animate && diff < 0.06 && t - s.lastHit > 1) s.lastHit = t;
      const p = pulseRefs.current[i];
      if (p) {
        const k = Math.min(1, (t - s.lastHit) / 1.4);
        p.scale.setScalar(1 + k * 3.2);
        p.material.opacity = animate ? 0.7 * (1 - k) : 0.25;
      }
      // Signal travelling node → core
      const tr = travelRefs.current[i];
      if (tr) {
        const k = animate ? (t * 0.22 + s.phase) % 1 : 0.5;
        tr.position.set(x * (1 - k), 0.05, z * (1 - k));
        tr.material.opacity = Math.sin(k * Math.PI) * 0.9;
      }

      const el = labelRefs.current[i];
      if (el) {
        const [sx, sy, sz] = project(x, 0.05, z);
        el.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
        el.style.opacity = sz > 1 ? '0' : '1';
      }
      if (hovered === i && cardRef.current) {
        const [sx, sy] = project(x, 0.05, z);
        const flip = sx > size.width * 0.6;
        cardRef.current.style.transform = `translate3d(${flip ? sx - 18 : sx + 18}px, ${sy}px, 0) translate(${flip ? '-100%' : '0'}, -50%)`;
      }
    });
    lines.geometry.attributes.position.needsUpdate = true;
    lines.geometry.setDrawRange(0, nodes.length * 2);
    if (coreLabelRef.current) {
      const [sx, sy] = project(0, 0.05, 0);
      coreLabelRef.current.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
    }
  });

  return (
    <group>
      <primitive object={lines} />
      {nodes.map((n, i) => {
        const tone = COLORS[toneFor(n.match ?? 0)];
        const isHover = hovered === i;
        return (
          <group key={n.id ?? i} ref={(el) => (groupRefs.current[i] = el)}>
            <mesh>
              <sphereGeometry args={[isHover ? 0.15 : 0.11, 20, 20]} />
              <meshBasicMaterial color={tone} />
            </mesh>
            {/* Larger invisible hit area: easier on touch screens. */}
            <mesh
              visible={false}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHovered(i);
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                setHovered((h) => (h === i ? null : h));
                document.body.style.cursor = '';
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (onSelect) onSelect(n);
                else setHovered(i);
              }}
            >
              <sphereGeometry args={[0.34, 10, 10]} />
            </mesh>
            <mesh ref={(el) => (pulseRefs.current[i] = el)} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.13, 0.16, 32]} />
              <meshBasicMaterial color={tone} transparent opacity={0.4} depthWrite={false} />
            </mesh>
            <mesh ref={(el) => (travelRefs.current[i] = el)}>
              <sphereGeometry args={[0.035, 8, 8]} />
              <meshBasicMaterial color={COLORS.primary} transparent opacity={0.8} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/* ---------------------------------------------------------------- camera */
function CameraRig({ animate, distance }) {
  const { camera, pointer } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const px = animate ? pointer.x : 0;
    const py = animate ? pointer.y : 0;
    target.set(px * 0.9, distance * 0.62 + py * 0.45, distance * 0.78);
    camera.position.lerp(target, Math.min(1, dt * 2.2));
    camera.lookAt(0, -0.2, 0);
  });
  return null;
}

/* ------------------------------------------------------------------ root */
export default function OpportunityRadar({ nodes = [], centerLabel = 'SUA EMPRESA', onSelect, height = 520, demo = false, className = '' }) {
  const wrap = useRef(null);
  const labelRefs = useRef([]);
  const coreLabelRef = useRef(null);
  const cardRef = useRef(null);
  const sweepAngle = useRef(0);
  const [hovered, setHovered] = useState(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const reduced = usePrefersReducedMotion();
  const mobile = useIsMobile();
  const inView = useInView(wrap, { rootMargin: '100px' });
  const animate = !reduced;
  const visibleNodes = mobile ? nodes.slice(0, 6) : nodes;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hoveredNode = hovered != null ? visibleNodes[hovered] : null;
  const distance = mobile ? 9.6 : 8.2;

  return (
    <div
      ref={wrap}
      className={`${styles.wrap} ${className}`}
      style={{ height }}
      role="img"
      aria-label={`Radar de oportunidades com ${visibleNodes.length} sinais ao redor da sua empresa${demo ? ' (demonstração)' : ''}`}
    >
      <Canvas
        className={styles.canvas}
        dpr={[1, mobile ? 1.25 : 1.75]}
        frameloop={!inView ? 'never' : animate ? 'always' : 'demand'}
        camera={{ fov: 40, near: 0.1, far: 60, position: [0, distance * 0.62, distance * 0.78] }}
        gl={{ antialias: !mobile, alpha: true, powerPreference: 'low-power' }}
        onPointerMissed={() => setHovered(null)}
      >
        <Grid />
        <Particles count={mobile ? 140 : 420} animate={animate} />
        <Sweep angleRef={sweepAngle} speed={0.55} animate={animate} />
        <Core animate={animate} />
        <Nodes
          nodes={visibleNodes}
          sweepAngle={sweepAngle}
          animate={animate}
          labelRefs={labelRefs}
          coreLabelRef={coreLabelRef}
          cardRef={cardRef}
          hovered={hovered}
          setHovered={setHovered}
          onSelect={onSelect}
          size={size}
        />
        <CameraRig animate={animate} distance={distance} />
      </Canvas>

      <div className={styles.overlay} aria-hidden="true">
        <div ref={coreLabelRef} className={styles.coreLabel}>
          <span>{centerLabel}</span>
        </div>
        {visibleNodes.map((n, i) => (
          <div key={n.id ?? i} ref={(el) => (labelRefs.current[i] = el)} className={`${styles.label} ${hovered === i ? styles.labelActive : ''}`}>
          <span className={styles[toneFor(n.match ?? 0)]}><BRLText>{n.value}</BRLText></span>
          </div>
        ))}
        {hoveredNode && (
          <div ref={cardRef} className={styles.card}>
            <div className={styles.cardHead}>
              <strong>{hoveredNode.name}</strong>
              {demo && <span className={styles.cardDemo}>DEMO</span>}
            </div>
            <div className={styles.cardMatch}>
              MATCH <b>{hoveredNode.match}%</b>
            </div>
            {hoveredNode.signal && <p className={styles.cardSignal}><BRLText>{hoveredNode.signal}</BRLText></p>}
            {hoveredNode.range && (
              <div className={styles.cardRange}>
                <span>Potencial</span>
              <b><BRLText>{hoveredNode.range}</BRLText></b>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
