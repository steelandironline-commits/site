import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { LayoutGrid, List, Search } from 'lucide-react';
import { get } from '../../lib/api.js';
import { useDebounced } from '../../lib/hooks.js';
import { OpportunityCard } from '../../components/cards/Cards.jsx';
import { Button, EmptyState, ErrorState, Input, MiniRadar, Select, SkeletonCard } from '../../components/ui/ui.jsx';
import { useOpportunityActions } from './useOpportunityActions.js';
import s from './app.module.css';

const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'NEW', label: 'Nova', param: { status: 'NEW' } },
  { key: 'HIGH', label: 'Alta', param: { priority: 'HIGH' } },
  { key: 'MEDIUM', label: 'Média', param: { priority: 'MEDIUM' } },
  { key: 'LOW', label: 'Baixa', param: { priority: 'LOW' } },
  { key: 'CONTACTED', label: 'Em contato', param: { status: 'CONTACTED' } },
  { key: 'INTERESTED', label: 'Interessado', param: { status: 'INTERESTED' } },
  { key: 'PROPOSAL', label: 'Proposta', param: { status: 'PROPOSAL' } },
  { key: 'WON', label: 'Ganha', param: { status: 'WON' } },
  { key: 'LOST', label: 'Perdida', param: { status: 'LOST' } },
  { key: 'ARCHIVED', label: 'Arquivada', param: { status: 'ARCHIVED' } },
];

const PAGE_SIZE = 24;

export default function Opportunities() {
  const [params, setParams] = useSearchParams();
  const filter = params.get('f') || 'all';
  const sort = params.get('sort') || 'recent';
  const [view, setView] = useState(() => params.get('view') || 'cards');
  const [q, setQ] = useState(params.get('q') || '');
  const dq = useDebounced(q, 300);
  const [state, setState] = useState({ items: [], total: 0, page: 1, loading: true, error: null });

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  const load = useCallback(
    async (page = 1) => {
      setState((st) => ({ ...st, loading: true, error: null }));
      const f = FILTERS.find((x) => x.key === filter)?.param || {};
      const qs = new URLSearchParams({ sort, page: String(page), pageSize: String(PAGE_SIZE), ...f, ...(dq ? { q: dq } : {}) });
      try {
        const data = await get(`/api/opportunities?${qs}`);
        setState((st) => ({
          items: page === 1 ? data.items : [...st.items, ...data.items],
          total: data.total,
          page,
          loading: false,
          error: null,
        }));
      } catch (error) {
        setState((st) => ({ ...st, loading: false, error }));
      }
    },
    [filter, sort, dq],
  );

  useEffect(() => {
    document.title = 'Oportunidades — AutoPix';
  }, []);
  useEffect(() => {
    load(1);
  }, [load]);
  useEffect(() => {
    if (dq !== (params.get('q') || '')) update({ q: dq });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const actions = useOpportunityActions({
    onUpdated: (o) => setState((st) => ({ ...st, items: st.items.map((x) => (x.id === o.id ? { ...x, ...o } : x)) })),
  });

  const hasMore = state.items.length < state.total;

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Oportunidades</h1>
          <p className={s.pageSub}>
            <span className={s.count}>{state.loading && !state.items.length ? '…' : state.total}</span> resultados
          </p>
        </div>
      </header>

      <div className={s.toolbar}>
        <label className={s.search}>
          <span className="sr-only">Buscar oportunidades</span>
          <Search size={15} aria-hidden="true" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa, setor, cidade ou sinal" />
        </label>
        <label>
          <span className="sr-only">Ordenar</span>
          <Select className={s.selectSm} value={sort} onChange={(e) => update({ sort: e.target.value === 'recent' ? null : e.target.value })}>
            <option value="recent">Mais recentes</option>
            <option value="score">Maior score</option>
            <option value="value">Maior valor</option>
          </Select>
        </label>
        <div className={s.segmented} role="group" aria-label="Visualização">
          <button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')} aria-label="Cartões">
            <LayoutGrid size={16} />
          </button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')} aria-label="Lista">
            <List size={16} />
          </button>
        </div>
      </div>

      <div className={s.filters} role="toolbar" aria-label="Filtros">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`${s.chip} ${filter === f.key ? s.chipActive : ''}`}
            aria-pressed={filter === f.key}
            onClick={() => update({ f: f.key === 'all' ? null : f.key })}
          >
            {f.label}
          </button>
        ))}
      </div>

      {state.error && !state.items.length ? (
        <ErrorState title="Não foi possível carregar as oportunidades." message={state.error.message} onRetry={() => load(1)} />
      ) : state.loading && !state.items.length ? (
        <div className={view === 'cards' ? s.cardsGrid : s.list}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : state.items.length === 0 ? (
        filter === 'all' && !dq ? (
          <EmptyState visual={<MiniRadar />} title="Procurando oportunidades..." message="Seus agentes começaram a analisar o mercado." />
        ) : (
          <EmptyState title="Nenhuma oportunidade com esses filtros." message="Ajuste a busca ou escolha outro filtro." />
        )
      ) : (
        <>
          <div className={view === 'cards' ? s.cardsGrid : s.list}>
            <AnimatePresence initial={false}>
              {state.items.map((o, i) => (
                <OpportunityCard
                  key={o.id}
                  index={i % PAGE_SIZE}
                  opportunity={o}
                  layout={view === 'list' ? 'row' : 'card'}
                  busy={actions.busy[o.id]}
                  onApproach={actions.generateApproach}
                  onContact={actions.markContacted}
                />
              ))}
            </AnimatePresence>
          </div>
          {hasMore && (
            <div className={s.loadMore}>
              <Button variant="secondary" onClick={() => load(state.page + 1)} loading={state.loading}>
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
