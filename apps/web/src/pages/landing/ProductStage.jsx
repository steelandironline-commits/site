/* Living product preview: 3D city driven by the activity feed, with a
   step bar (fonte → oportunidade). Falls back to the flat pipeline. */
import { Component, Suspense, lazy, useEffect, useRef, useState } from 'react';
import { PipelineFlow } from '../../components/activity/Flow.jsx';
import { useInView, useIsMobile, usePrefersReducedMotion } from '../../lib/hooks.js';
import { KIND_STYLE, eventKind } from '../../lib/eventKind.js';
import { DESKTOP_SCENE_SCALE } from './descent/framing.js';
import s from './landing.module.css';

const ProductScene = lazy(() => import('./descent/ProductScene.jsx'));
const STEPS = ['FONTE', 'PESQUISA', 'SINAL', 'NOTA', 'OPORTUNIDADE'];
const STEP_OF = { SEARCH: 0, RESEARCH: 1, SIGNAL: 2, AGENT: 3, OPPORTUNITY: 4 };

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

class Boundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail?.();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function ProductStage({ latest }) {
  const ref = useRef(null);
  const inView = useInView(ref, { rootMargin: '150px' });
  const mobile = useIsMobile();
  const reduced = usePrefersReducedMotion();
  const [webgl, setWebgl] = useState(true);
  useEffect(() => setWebgl(webglAvailable()), []);
  const kind = eventKind(latest);
  const step = latest ? (kind ? STEPS.length - 1 : (STEP_OF[latest.type] ?? 0)) : -1;
  const color = kind ? KIND_STYLE[kind].color : 'var(--primary)';
  const name = kind ? KIND_STYLE[kind].label.toUpperCase() : step >= 0 ? STEPS[step] : 'PROCURANDO';
  const flat = <PipelineFlow latest={latest} className={s.flowPipeline} />;
  return (
    <div ref={ref} className={s.productStage} style={{ '--desktop-scene-scale': webgl ? DESKTOP_SCENE_SCALE : 1 }}>
      {webgl ? (
        <Boundary fallback={flat} onFail={() => setWebgl(false)}>
          <Suspense fallback={null}>
            <ProductScene latest={latest} mobile={mobile} reduced={reduced} running={inView} />
          </Suspense>
        </Boundary>
      ) : (
        flat
      )}
      <div className={s.productSteps} style={{ '--step': color }} aria-hidden="true">
        <span className={s.stepBars}>
          {STEPS.map((x, i) => (
            <i key={x} className={i <= step ? s.stepOn : undefined} style={{ animationDelay: `${i * 0.14}s` }} />
          ))}
        </span>
        <span key={name} className={s.stepName}>
          {name}
        </span>
      </div>
    </div>
  );
}
