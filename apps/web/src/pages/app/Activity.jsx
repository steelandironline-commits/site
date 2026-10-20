import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { Badge, Button, EmptyState, ErrorState, Input, MiniRadar, Skeleton, get, useDebounced } from '@autopix/ui';
import { fmtDay } from '../../lib/time.js';
import { ActivityCard } from '../../components/activity/ActivityCard.jsx';
import s from './app.module.css';

/** `copy`: { subtitle, empty, filters, eventLink } (os filtros são [{ key, label }]; a chave vazia é "tudo"; eventLink(evento) é a página que o evento abre, se houver). */
export default function Activity({ copy }) {
  const { stream } = useOutletContext();
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const [state, setState] = useState({ items: [], hasMore: false, loading: true, error: null });

  useEffect(() => {
    document.title = 'Atividade — TemPix';
  }, []);

  const load = useCallback(
    async (before) => {
      setState((st) => ({ ...st, loading: true, error: null }));
      const qs = new URLSearchParams({ limit: '60', ...(type ? { type } : {}), ...(dq ? { q: dq } : {}), ...(before ? { before } : {}) });
      try {
        const data = await get(`/api/activity?${qs}`);
        setState((st) => ({ items: before ? [...st.items, ...data.items] : data.items, hasMore: data.hasMore, loading: false, error: null }));
      } catch (error) {
        setState((st) => ({ ...st, loading: false, error }));
      }
    },
    [type, dq],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Merge live events (SSE) that match the current filter.
  useEffect(() => {
    const e = stream.latest;
    if (!e || (type && e.type !== type)) return;
    if (dq && !`${e.title} ${e.description || ''} ${e.source || ''}`.toLowerCase().includes(dq.toLowerCase())) return;
    setState((st) => (st.items.some((x) => x.id === e.id) ? st : { ...st, items: [e, ...st.items] }));
  }, [stream.latest, type, dq]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const e of state.items) {
      const day = new Date(e.createdAt).toDateString();
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(e);
    }
    return [...map.entries()];
  }, [state.items]);

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Atividade</h1>
          <p className={s.pageSub}>{copy.subtitle}</p>
        </div>
        <Badge tone={stream.mode === 'live' ? 'primary' : 'neutral'} dot pulse={stream.mode === 'live'}>
          {stream.mode === 'live' ? 'Ao vivo' : stream.mode === 'polling' ? 'Atualização periódica' : 'Conectando'}
        </Badge>
      </header>

      <div className={s.toolbar}>
        <label className={s.search}>
          <span className="sr-only">Buscar na atividade</span>
          <Search size={15} aria-hidden="true" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar eventos" />
        </label>
      </div>
      <div className={s.filters} role="toolbar" aria-label="Filtrar por tipo">
        {copy.filters.map((f) => (
          <button key={f.key || 'all'} type="button" className={`${s.chip} ${type === f.key ? s.chipActive : ''}`} aria-pressed={type === f.key} onClick={() => setType(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <section className={`${s.panel}`} style={{ padding: 8 }} aria-live="polite">
        {state.error && !state.items.length ? (
          <ErrorState compact title="Não foi possível carregar a atividade." message={state.error.message} onRetry={() => load()} />
        ) : state.loading && !state.items.length ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '64px 26px 1fr', gap: 10, padding: 12 }}>
              <Skeleton w={52} h={10} />
              <Skeleton w={24} h={24} />
              <Skeleton w={`${80 - i * 6}%`} h={12} />
            </div>
          ))
        ) : !state.items.length ? (
          <EmptyState visual={<MiniRadar size={72} />} title="Nenhum evento ainda" message={copy.empty} />
        ) : (
          groups.map(([day, items]) => (
            <div key={day} className={s.dayGroup}>
              <p className={s.dayLabel}>{fmtDay(items[0].createdAt)}</p>
              <AnimatePresence initial={false}>
                {items.map((e) => (
                  <motion.div key={e.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.35 }}>
                    <ActivityCard event={e} eventLink={copy.eventLink} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ))
        )}
      </section>
      {state.hasMore && (
        <div className={s.loadMore}>
          <Button variant="secondary" loading={state.loading} onClick={() => load(state.items[state.items.length - 1].createdAt)}>
            Carregar eventos anteriores
          </Button>
        </div>
      )}
    </>
  );
}
