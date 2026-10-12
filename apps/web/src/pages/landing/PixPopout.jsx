/* "Pix recebido" notification that pops out from the TemPix logo, like a push
   from the app. Decorative product preview: cycles a few example payments. */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion } from 'framer-motion';
import { formatCents } from '@autopix/shared';
import { LogoMark } from '../../components/brand/Logo.jsx';
import { usePrefersReducedMotion } from '../../lib/hooks.js';
import s from './pixPopout.module.css';

const NOTES = [
  { cents: 125000, note: 'Serviço elétrico concluído' },
  { cents: 480000, note: 'Frete Santos → Campinas' },
  { cents: 980000, note: 'Obra concluída · liberado na conta' },
  { cents: 38000, note: 'Diária · ajudante geral' },
];
const FIRST_MS = 1800;
const SHOW_MS = 3800;
const GAP_MS = 2200;

/** Counts up to the amount, After Effects style. */
function Amount({ cents, run }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!run) {
      el.textContent = formatCents(cents);
      return undefined;
    }
    const ctrl = animate(0, cents, {
      duration: 0.9,
      delay: 0.2,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        el.textContent = formatCents(Math.round(v));
      },
    });
    return () => ctrl.stop();
  }, [cents, run]);
  return (
    <span ref={ref} className={s.amount}>
      {formatCents(run ? 0 : cents)}
    </span>
  );
}

export default function PixPopout({ active }) {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!active) {
      setShown(false);
      return undefined;
    }
    let timer;
    let alive = true;
    const cycle = (wait) => {
      timer = setTimeout(() => {
        if (!alive) return;
        if (document.hidden) {
          cycle(GAP_MS);
          return;
        }
        setShown(true);
        timer = setTimeout(() => {
          if (!alive) return;
          setShown(false);
          setIndex((n) => (n + 1) % NOTES.length);
          cycle(GAP_MS);
        }, SHOW_MS);
      }, wait);
    };
    cycle(FIRST_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [active]);

  const n = NOTES[index];
  return (
    <div className={s.anchor} aria-hidden="true">
      <AnimatePresence>
        {shown && (
          <motion.div
            key={index}
            className={s.card}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -18, scale: 0.82 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 430, damping: 24 } }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.94, transition: { duration: 0.28, ease: [0.55, 0, 1, 0.45] } }}
          >
            {!reduced && <span className={s.ping} />}
            <span className={s.icon}>
              <LogoMark size={22} />
            </span>
            <span className={s.body}>
              <span className={s.head}>
                <strong>TemPix</strong>
                <span>agora</span>
              </span>
              <span className={s.title}>
                Pix recebido <Amount cents={n.cents} run={!reduced} />
              </span>
              <span className={s.note}>{n.note}</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
