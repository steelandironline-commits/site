/* Obra de montagem de galpão: munck içando uma tesoura metálica, britadeira
   em área isolada e soldador com EPI. Built from the same kit as the
   opening islands, so it reads as part of TemPix. Loaded on demand. */
import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Island, WorldCtx } from '../descent/kit.jsx';
import { MachineSite } from '../descent/machines.jsx';

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
          <MachineSite reduced={reduced} />
        </Island>
      </World>
    </Canvas>
  );
}
