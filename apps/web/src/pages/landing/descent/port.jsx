/* Opening islands for machines (rental) and the maritime vertical. */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { B, Building, Container, Cy, GEO, Glow, Island, Label, Person, Rise, Road, Truck, bump, damp, eio, mat, placeOnCurve, seg, useChapter, useWorld } from './kit.jsx';
import { MachineSite } from './machines.jsx';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* --------------------------------------------------- aluguel de máquinas */
export function MachineIsland() {
  const world = useWorld();
  return (
    <Island w={17} d={13} top="#e8e1d2" lip="#d1c6b2" strata={['#d6b77a', '#a8834a', '#6b5230']} seed={11}>
      <Rise delay={0.05} all>
        <group scale={0.94}>
          <MachineSite
            rental
            reduced={world?.current.reduced}
            labels={{
              munck: ['Munck 12 t', 'locação com operador'],
              jack: ['Britadeira', 'diária com operador'],
              weld: ['Soldagem', 'equipe por etapa'],
              excavator: ['Escavadeira', 'disponível hoje'],
            }}
          />
        </group>
      </Rise>
    </Island>
  );
}

/* ------------------------------------------------------- porto e navio */
const PERIOD = 13;
const BOX = ['#c8553d', '#2ad1b8', '#f2b134', '#4f9dff', '#8fb2ff', '#e5574f'];
/** Ship deck height (top of the hull plating). */
const DECK = 1.06;
/** Gangway from the quay (x 0.4) up to the hull edge (x -0.9). */
const GANG_A = [0.4, 0.04];
const GANG_B = [-0.9, 1.11];
const GANG_LEN = Math.hypot(GANG_B[0] - GANG_A[0], GANG_B[1] - GANG_A[1]);
const GANG_TILT = -Math.atan2(GANG_B[1] - GANG_A[1], GANG_A[0] - GANG_B[0]);

/** Docked ship: the buyer with a need on board. */
function Ship() {
  const ch = useChapter();
  const g = useRef();
  useFrame((state) => {
    if (!ch.current.visible || !g.current) return;
    const t = ch.current.reduced ? 0 : state.clock.elapsedTime;
    g.current.position.y = Math.sin(t * 0.9) * 0.035;
    g.current.rotation.x = Math.sin(t * 0.7) * 0.006;
  });
  const boxes = useMemo(() => {
    const out = [];
    // Five bays between the bridge (front at z -3.9) and the bow (z 5.5).
    for (let i = 0; i < 5; i++)
      for (const x of [-0.5, 0.5]) {
        const n = 1 + ((i * 3 + (x > 0 ? 1 : 0)) % 3);
        for (let k = 0; k < n; k++) out.push({ p: [x, DECK + k * 0.8, -2.9 + i * 1.8], c: BOX[(i + k + (x > 0 ? 2 : 0)) % BOX.length] });
      }
    return out;
  }, []);
  return (
    <group ref={g} userData={{ rigid: true }}>
      <B p={[0, -0.45, 0]} s={[2.9, 1.5, 11]} c="#1f3b63" />
      <B p={[0, 0.0, 0]} s={[2.92, 0.18, 11.02]} c="#b8432f" />
      <B p={[0, 0.98, 0]} s={[2.7, DECK - 0.98, 10.6]} c="#3b4c66" />
      {/* bow: triangular prism whose base meets the hull end at z 5.5 */}
      <mesh geometry={GEO.prism} material={mat('#1f3b63')} position={[0, 0.3, 6.03]} scale={[3.35, 1.5, 2.13]} castShadow receiveShadow />
      {/* bridge + funnel at the stern */}
      <B p={[0, DECK, -4.6]} s={[2.4, 3.0 - DECK, 1.4]} c="#f2f0ea" />
      <B p={[0, 2.6, -3.88]} s={[2.2, 0.24, 0.02]} c="#1b2433" e="#3b5a86" ei={0.35} />
      <B p={[0, 3.0, -4.6]} s={[2.6, 0.12, 1.6]} c="#e6e3dc" />
      <Cy p={[0.6, 3.12, -5.0]} s={[0.5, 0.8, 0.5]} c="#c8553d" />
      {boxes.map((b, i) => (
        <Container key={i} p={b.p} c={b.c} />
      ))}
    </group>
  );
}

export function PortIsland() {
  const ch = useChapter();
  // Ends beside the gangway, where the part is handed over.
  const road = useMemo(() => new THREE.CatmullRomCurve3([v3(7.6, 0, 6.0), v3(5.5, 0, 5.6), v3(2.9, 0, 4.6), v3(1.9, 0, 2.8), v3(1.8, 0, 0.4)], false, 'centripetal'), []);
  const van = useRef();
  const boat = useRef();
  const crane = useRef();
  const gangway = useRef(0);
  useFrame((state) => {
    const c = ch.current;
    if (!c.visible) return;
    const t = c.t % PERIOD;
    // supplier van drives to the gangway, waits, leaves
    let u = 0;
    if (t < 3.2) u = 0;
    else if (t < 7.0) u = eio(seg(t, 3.2, 7.0));
    else u = 1;
    placeOnCurve(van.current, road, Math.min(Math.max(u, 0.0001), 0.9999), 0);
    const s = Math.min(seg(t, 3.0, 3.4), 1 - seg(t, 12.4, 12.9));
    van.current.scale.setScalar(Math.max(s, 0.001) * 0.85);
    gangway.current = bump(t, 7.0, 7.6, 11.6, 12.2);
    // support launch circling in the water
    const a = (c.reduced ? 0 : state.clock.elapsedTime) * 0.22;
    if (boat.current) {
      boat.current.position.set(-6.1 + Math.cos(a) * 1.1, 0.05, Math.sin(a) * 4.4);
      boat.current.rotation.y = -a + Math.PI;
    }
    // Swings over the forward bays only: never across the bridge.
    if (crane.current) crane.current.rotation.y = damp(crane.current.rotation.y, 0.17 + Math.sin(t * 0.5) * 0.43, 2, 0.016);
  });
  return (
    <Island w={17} d={15} top="#e6e1d6" lip="#cfc6b6" strata={['#9fb7cf', '#6f8aa6', '#3f556e']} seed={21}>
      {/* sea + quay edge */}
      <B p={[-4.4, 0, 0]} s={[8.2, 0.04, 15]} c="#3d7cc9" e="#1d4f8a" ei={0.3} shadow={false} />
      <B p={[-0.25, 0, 0]} s={[0.3, 0.12, 15]} c="#8d8a85" />
      {[-5, -2, 1, 4].map((z) => (
        <Cy key={z} p={[-0.05, 0.1, z]} s={[0.16, 0.18, 0.16]} c="#2a2f37" />
      ))}
      <Road curve={road} width={1.0} />
      <Rise delay={0.1}>
        <group position={[-2.3, 0, 0]}>
          <Ship />
        </group>
      </Rise>
      {/* gangway: inclined plank resting on the hull edge, with handrails */}
      <group position={[(GANG_A[0] + GANG_B[0]) / 2, (GANG_A[1] + GANG_B[1]) / 2, 1.2]} rotation={[0, 0, GANG_TILT]}>
        <B s={[GANG_LEN, 0.05, 0.55]} c="#c9ced8" center />
        {[-0.25, 0.25].map((z) => (
          <group key={z}>
            <B p={[0, 0.32, z]} s={[GANG_LEN - 0.1, 0.03, 0.03]} c="#8d96a5" center />
            {[-1, 1].map((e) => (
              <B key={e} p={[e * (GANG_LEN / 2 - 0.08), 0.16, z]} s={[0.03, 0.32, 0.03]} c="#8d96a5" center />
            ))}
          </group>
        ))}
      </group>
      <Person position={[0.95, 0, 1.2]} rotation={[0, -Math.PI / 2, 0]} shirt="#f28c28" hat="hard" wave={() => gangway.current} />
      {/* mobile harbour crane: the boom clears the tallest stack (3.5) */}
      <Rise delay={0.25}>
        <group position={[1.6, 0, -1.6]}>
          <B s={[1.4, 0.5, 1.4]} c="#3a3f48" />
          <group ref={crane} userData={{ rigid: true }} position={[0, 0.5, 0]}>
            <B s={[1.0, 1.4, 1.0]} c="#f2b134" />
            <B p={[0.7, 0.3, 0]} s={[0.4, 0.6, 0.8]} c="#3a3f48" />
            <B p={[-1.85, 2.6, 0]} s={[4.86, 0.24, 0.24]} c="#f2b134" r={[0, 0, -0.565]} center />
            <B p={[-3.9, 3.49, 0]} s={[0.03, 0.58, 0.03]} c="#20242c" center />
            <B p={[-3.9, 3.11, 0]} s={[0.18, 0.18, 0.18]} c="#2a3242" center />
          </group>
        </group>
      </Rise>
      {/* partner workshop on the quay */}
      <Rise delay={0.35}>
        <Building p={[5.4, 0, -2.4]} w={2.6} d={2.2} h={1.7} c="#f1ece3" roof="#4f9dff" lit={0.3} />
        <B p={[5.4, 0, 0.2]} s={[1.6, 0.6, 1.0]} c="#5d6f86" />
        <Container p={[6.6, 0, 2.0]} c="#4f9dff" />
      </Rise>
      <Truck ref={van} kind="box" cab="#ffffff" cargo="#4f9dff">
        <Label text="Peça a caminho" sub="cotação aceita" accent="#4f9dff" position={[0, 1.6, 0]} vis={() => bump(ch.current.t % PERIOD, 4.2, 4.7, 6.4, 6.9)} />
      </Truck>
      <group ref={boat} userData={{ rigid: true }}>
        <B p={[0, 0, 0]} s={[0.7, 0.28, 1.6]} c="#f2f0ea" />
        <B p={[0, 0.28, -0.2]} s={[0.5, 0.36, 0.6]} c="#e5574f" />
      </group>
      <Glow color="#4f9dff" size={2.2} position={[-0.4, 1.3, 1.2]} vis={() => gangway.current} />
      <Label text="Navio atracado" sub="precisa de reparo · 8 h" accent="#4f9dff" position={[-2.3, 4.3, -1]} vis={() => bump(ch.current.t % PERIOD, 0.3, 0.8, 5.2, 5.7)} />
      <Label text="Usinagem parceira" sub="Ø650 mm · plantão 24h" accent="#4f9dff" position={[5.4, 2.7, -2.4]} vis={() => bump(ch.current.t % PERIOD, 1.2, 1.7, 3.8, 4.2)} />
      <Label text="Entregue a bordo" sub="pagamento assegurado" check accent="#5fe39a" position={[0.2, 2.2, 1.2]} vis={() => gangway.current} />
    </Island>
  );
}

