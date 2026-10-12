/* Immersive opening: scrolling dives the camera through one island per chapter. */
import { Component, Fragment, Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { ArrowRight, Building2, Container, Landmark, LayoutDashboard, Radar, Route, UserCheck } from 'lucide-react';
import { Button } from '../../../components/ui/ui.jsx';
import { useInView, useIsMobile, usePrefersReducedMotion } from '../../../lib/hooks.js';
import { useSession } from '../../../lib/session.jsx';
import { CHAPTERS, N, levelFromProgress, progressForChapter } from './chapters.js';
import s from './descent.module.css';

const DescentScene = lazy(() => import('./DescentScene.jsx'));
const ART = [Building2, Radar, Container, Route, UserCheck, Landmark, LayoutDashboard];
const ease = [0.22, 1, 0.36, 1];

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

class SceneBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail?.();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Waits for the brand fonts so the in-scene labels are drawn with them. */
function useFontsReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    const fonts = document.fonts;
    const loads = fonts ? Promise.all([fonts.load('600 15px "IBM Plex Sans"'), fonts.load('500 12px "IBM Plex Mono"')]) : Promise.resolve();
    Promise.race([loads, new Promise((r) => setTimeout(r, 1500))])
      .catch(() => {})
      .then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

function Copy({ index, reduced }) {
  const c = CHAPTERS[index];
  const { isAuthenticated } = useSession();
  const words = c.title.split(' ');
  const Heading = index === 0 ? motion.h1 : motion.h2;
  const word = {
    hidden: reduced ? { opacity: 0 } : { y: '110%', rotate: 3 },
    show: reduced ? { opacity: 1 } : { y: '0%', rotate: 0, transition: { duration: 0.85, ease } },
    exit: reduced ? { opacity: 0 } : { y: '-110%', transition: { duration: 0.32, ease: [0.55, 0, 1, 0.45] } },
  };
  const fade = {
    hidden: { opacity: 0, y: reduced ? 0 : 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
    exit: { opacity: 0, y: reduced ? 0 : -8, transition: { duration: 0.25 } },
  };
  return (
    <motion.div
      className={s.copy}
      initial="hidden"
      animate="show"
      exit="exit"
      variants={{ show: { transition: { staggerChildren: 0.045, delayChildren: 0.22 } }, exit: { transition: { staggerChildren: 0.012 } } }}
    >
      <motion.p className={s.kicker} variants={fade}>
        <motion.span className={s.kickerBar} variants={{ hidden: { scaleX: 0 }, show: { scaleX: 1, transition: { duration: 0.7, ease } }, exit: { scaleX: 0 } }} />
        {c.kicker}
      </motion.p>
      <Heading id={index === 0 ? 'descent-title' : undefined} className={s.title}>
        {words.map((w, i) => (
          <Fragment key={`${w}${i}`}>
            <span className={s.mask}>
              <motion.span className={w.startsWith('TemPix') ? `${s.word} ${s.brand}` : s.word} variants={word}>
                {w}
              </motion.span>
            </span>
            {i < words.length - 1 ? ' ' : null}
          </Fragment>
        ))}
      </Heading>
      <motion.p className={s.body} variants={fade}>
        {c.body}
      </motion.p>
      {(index === 0 || index === N - 1) && (
        <motion.div className={s.ctas} variants={fade}>
          {isAuthenticated ? (
            <Button to="/app" size="lg" iconRight={ArrowRight}>
              ABRIR PAINEL
            </Button>
          ) : (
            <>
              <Button to="/login" size="lg" variant="outline">
                FAZER LOGIN
              </Button>
              <Button to="/onboarding" size="lg" iconRight={ArrowRight}>
                CADASTRE-SE AGORA
              </Button>
            </>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

function Rail({ active, onJump }) {
  return (
    <nav className={s.rail} aria-label="Partes da apresentação">
      <span className={s.railTrack} aria-hidden="true">
        <span className={s.railFill} />
      </span>
      <ol>
        {CHAPTERS.map((c, i) => (
          <li key={c.id}>
            <button type="button" className={i === active ? s.railOn : undefined} onClick={() => onJump(i)} aria-current={i === active ? 'step' : undefined}>
              <span className={s.railLabel}>{c.rail}</span>
              <span className={s.railDot} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default function Descent() {
  const section = useRef(null);
  const stage = useRef(null);
  const copyBox = useRef(null);
  const progress = useRef(0);
  const pointer = useRef({ x: 0, y: 0 });
  const [active, setActive] = useState(0);
  const [canvasOn, setCanvasOn] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const mobile = useIsMobile();
  const reduced = usePrefersReducedMotion();
  const inView = useInView(section, { rootMargin: '200px' });
  const fontsReady = useFontsReady();

  const { scrollYProgress } = useScroll({ target: section, offset: ['start start', 'end end'] });
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    progress.current = v;
  });

  useEffect(() => {
    setWebgl(webglAvailable());
    progress.current = scrollYProgress.get();
  }, [scrollYProgress]);

  useEffect(() => {
    const onMove = (e) => {
      if (e.pointerType !== 'mouse') return;
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  // Keep the scroll cue just above the caption on phones.
  useLayoutEffect(() => {
    const el = copyBox.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => stage.current?.style.setProperty('--copy-h', `${Math.round(el.getBoundingClientRect().height)}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const jump = useCallback((k) => {
    const el = section.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const total = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + total * progressForChapter(k), behavior: reduced ? 'auto' : 'smooth' });
  }, [reduced]);

  // Click / tap anywhere on the scene, swipe sideways or use ← → to change part.
  const pending = useRef({ k: 0, at: 0 });
  const touch = useRef(null);
  const step = useCallback(
    (dir) => {
      const now = performance.now();
      const from = now - pending.current.at < 1100 ? pending.current.k : Math.round(levelFromProgress(progress.current).level);
      const k = from + dir;
      if (k < 0) return;
      if (k > N - 1) {
        document.getElementById('produto')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
        return;
      }
      pending.current = { k, at: now };
      jump(k);
    },
    [jump, reduced],
  );
  const onStageClick = (e) => {
    if (e.target.closest('a, button, input, select, textarea, [role="button"]')) return;
    if (touch.current?.swiped && performance.now() - touch.current.at < 500) return;
    if (window.getSelection?.().toString()) return;
    step(1);
  };
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, at: performance.now(), swiped: false };
  };
  const onTouchEnd = (e) => {
    const start = touch.current;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      start.swiped = true;
      start.at = performance.now();
      step(dx < 0 ? 1 : -1);
    }
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const r = section.current?.getBoundingClientRect();
      if (!r || r.top > 1 || r.bottom < window.innerHeight - 1) return;
      e.preventDefault();
      step(e.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  const onActive = useCallback((i) => setActive(i), []);
  const onReady = useCallback(() => setCanvasOn(true), []);
  const Art = ART[active];

  return (
    <section ref={section} className={s.descent} style={{ '--n': N }} aria-labelledby="descent-title" data-immersive>
      <span id="como-funciona" className={s.anchor} style={{ '--at': progressForChapter(1) }} aria-hidden="true" />
      <div ref={stage} className={s.stage} onClick={onStageClick} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className={s.sky} aria-hidden="true" />
        <div className={s.horizon} aria-hidden="true" />
        {webgl && fontsReady ? (
          <div className={`${s.canvas} ${canvasOn ? s.canvasOn : ''}`} aria-hidden="true">
            <SceneBoundary onFail={() => setWebgl(false)}>
              <Suspense fallback={null}>
                <DescentScene
                  progress={progress}
                  pointer={pointer}
                  stageRef={stage}
                  onActive={onActive}
                  onReady={onReady}
                  mobile={mobile}
                  reduced={reduced}
                  running={inView}
                />
              </Suspense>
            </SceneBoundary>
          </div>
        ) : null}
        {!webgl && <FallbackArt Art={Art} />}
        <div className={s.vignette} aria-hidden="true" />
        <div ref={copyBox} className={s.copyBox}>
          <AnimatePresence initial mode="wait">
            <Copy key={active} index={active} reduced={reduced} />
          </AnimatePresence>
        </div>
        <Rail active={active} onJump={jump} />
        {active < N - 1 && (
          <button type="button" className={s.cue} onClick={() => step(1)} aria-label="Continuar rolando para a próxima parte">
            <span className={s.mouse}>
              <span className={s.wheel} />
            </span>
            {active === 0 && <span className={s.cueText}>Continuar rolando</span>}
          </button>
        )}
      </div>
      {!webgl && <FallbackScroll onActive={onActive} progress={scrollYProgress} />}
    </section>
  );
}

/** Without WebGL the captions still follow the scroll; a large icon stands in for the island. */
function FallbackArt({ Art }) {
  return (
    <div className={s.fallback} aria-hidden="true">
      <Art size={140} strokeWidth={1} />
    </div>
  );
}

function FallbackScroll({ onActive, progress }) {
  useMotionValueEvent(progress, 'change', (v) => onActive(Math.min(N - 1, Math.floor(v * N))));
  return null;
}
