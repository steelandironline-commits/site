import { AnimatePresence, motion } from 'framer-motion';
import { ActivityCard } from './ActivityCard.jsx';
import { KIND_STYLE, eventKind } from '../../lib/eventKind.js';
import { Badge, DemoBadge, Skeleton } from '@autopix/ui';
import s from './activity.module.css';

const MODE_LABEL = { live: 'Ao vivo', polling: 'Atualizando', connecting: 'Conectando', demo: 'Simulação' };

/**
 * ATIVIDADE — live list of events.
 *  mode="demo": landing showcase (badge optional: `badge={false}` on the landing).
 *  otherwise:   only events stored in the database (REAL).
 */
export function ActivityStream({ events, mode = 'live', demo = false, badge = true, loading, title = 'Atividade', max = 12, compact, empty, className, eventLink }) {
  return (
    <section className={`${s.stream} ${className || ''}`} aria-label={title}>
      <header className={s.streamHead}>
        <div className={s.streamTitle}>
          <span className={s.liveDot} data-mode={mode} aria-hidden="true" />
          <h2 className="eyebrow">{title}</h2>
        </div>
        <div className={s.streamBadges}>
          {badge && (demo ? <DemoBadge /> : <Badge tone={mode === 'live' ? 'primary' : 'neutral'}>{MODE_LABEL[mode] || mode}</Badge>)}
        </div>
      </header>
      <div className={s.streamList} aria-live="polite" aria-relevant="additions">
        {loading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={s.skeletonRow}>
              <Skeleton w={52} h={10} />
              <Skeleton w={24} h={24} r={4} />
              <Skeleton w={`${70 - i * 8}%`} h={12} />
            </div>
          ))}
        {!loading && events.length === 0 && empty}
        <AnimatePresence initial={false}>
          {events.slice(0, max).map((e) => {
            const kind = eventKind(e);
            return (
            <motion.div
              key={e.id}
              layout="position"
              initial={{ opacity: 0, y: -8, backgroundColor: 'rgba(42,209,184,0.08)' }}
              animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(42,209,184,0)' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className={s.streamItem}
            >
              {kind && (
                <span
                  className={`${s.sweep} ${kind === 'contract' ? '' : s.sweepBlink}`}
                  style={{ '--sweep': KIND_STYLE[kind].color }}
                  aria-hidden="true"
                />
              )}
              <ActivityCard event={demo ? { ...e, isDemo: false } : e} compact={compact} eventLink={eventLink} />
            </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </section>
  );
}
