import { lazy, Suspense, Component } from 'react';
import styles from './OpportunityRadar.module.css';

const OpportunityRadar = lazy(() => import('./OpportunityRadar.jsx'));

/** Lightweight SVG radar shown while Three.js streams in (or if WebGL fails). */
export function RadarFallback({ height = 520 }) {
  return (
    <div className={styles.fallback} style={{ height }} aria-hidden="true">
      <svg viewBox="0 0 400 220">
        <g fill="none" stroke="#2a2f37">
          <ellipse cx="200" cy="110" rx="190" ry="100" />
          <ellipse cx="200" cy="110" rx="142" ry="75" />
          <ellipse cx="200" cy="110" rx="95" ry="50" />
          <ellipse cx="200" cy="110" rx="48" ry="25" />
          <path d="M10 110H390M200 10V210" />
        </g>
        <circle cx="200" cy="110" r="5" fill="#ecebe6" />
        <circle cx="282" cy="80" r="4" fill="#2ad1b8" />
        <circle cx="120" cy="140" r="4" fill="#3fbf86" />
        <circle cx="300" cy="150" r="4" fill="#e5a53b" />
      </svg>
    </div>
  );
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

class RadarBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function LazyRadar(props) {
  const fallback = <RadarFallback height={props.height} />;
  if (typeof window !== 'undefined' && !webglAvailable()) return fallback;
  return (
    <RadarBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <OpportunityRadar {...props} />
      </Suspense>
    </RadarBoundary>
  );
}
