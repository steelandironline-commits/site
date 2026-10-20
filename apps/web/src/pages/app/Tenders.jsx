import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Building, Clock, ExternalLink, Landmark, MapPin, RefreshCw } from 'lucide-react';
import { BR_STATES, TENDER_STATUS_FILTERS, formatCents } from '@autopix/shared';
import {
  BRLText,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  SkeletonCard,
  api,
  useBrand,
  useDebounced,
  useVisibleInterval,
} from '@autopix/ui';
import { relative } from '../../lib/time.js';
import s from './app.module.css';
import t from './tenders.module.css';

const MODALITIES = ['Pregão - Eletrônico', 'Dispensa', 'Concorrência - Eletrônica', 'Credenciamento', 'Inexigibilidade', 'Pregão - Presencial', 'Leilão - Eletrônico', 'Concurso'];
const SPHERE = { F: 'Federal', E: 'Estadual', M: 'Municipal', D: 'Distrital' };

function TenderCard({ item }) {
  const st = item.status;
  return (
    <article className={t.card}>
      <header className={t.cardHead}>
        <Badge tone={st.tone} dot pulse={st.code === 'CLOSING'}>
          {st.label}
        </Badge>
        {item.modality && <span className={t.modality}>{item.modality}</span>}
      </header>
      <p className={t.object}>{item.object}</p>
      <dl className={t.meta}>
        <div>
          <dt className="sr-only">Órgão</dt>
          <dd>
            <Landmark size={13} aria-hidden="true" /> {item.agencyName}
            {SPHERE[item.sphere] ? ` · ${SPHERE[item.sphere]}` : ''}
          </dd>
        </div>
        {(item.city || item.state) && (
          <div>
            <dt className="sr-only">Local</dt>
            <dd>
              <MapPin size={13} aria-hidden="true" /> {[item.city, item.state].filter(Boolean).join(' – ')}
            </dd>
          </div>
        )}
        <div>
          <dt className="sr-only">Situação</dt>
          <dd>
            <Clock size={13} aria-hidden="true" /> {st.detail}
          </dd>
        </div>
      </dl>
      <footer className={t.cardFoot}>
        <span className={`${t.value} num`}>{item.estimatedCents ? <BRLText>{formatCents(item.estimatedCents)}</BRLText> : 'Valor não informado'}</span>
        <a href={item.url} target="_blank" rel="noopener noreferrer" className={t.link}>
          Ver edital no PNCP <ExternalLink size={13} aria-hidden="true" />
        </a>
      </footer>
    </article>
  );
}

export default function Tenders() {
  const { name } = useBrand();
  const { me } = useOutletContext();
  const [filters, setFilters] = useState(() => ({ state: me?.company?.state || '', city: '', q: '', modality: '', status: 'open' }));
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cities, setCities] = useState([]);
  const q = useDebounced(filters.q, 400);

  useEffect(() => {
    document.title = `Licitações — ${name}`;
  }, [name]);

  const query = useMemo(() => {
    const p = new URLSearchParams({ status: filters.status, page: String(page), pageSize: '20' });
    for (const k of ['state', 'city', 'modality']) if (filters[k]) p.set(k, filters[k]);
    if (q.trim()) p.set('q', q.trim());
    return `/api/tenders?${p}`;
  }, [filters.status, filters.state, filters.city, filters.modality, q, page]);

  const load = async (append = false) => {
    setLoading(true);
    try {
      const res = await api(query);
      setData((prev) => (append && prev ? { ...res, items: [...prev.items, ...res.items] } : res));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(page > 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Keep the list fresh while the page is open (the worker syncs the PNCP every 30 minutes).
  useVisibleInterval(() => page === 1 && load(false), 60_000, true);

  useEffect(() => {
    setCities([]);
    if (!filters.state) return;
    api(`/api/tenders/cities?state=${filters.state}`)
      .then((r) => setCities(r.cities))
      .catch(() => setCities([]));
  }, [filters.state]);

  const set = (k) => (e) => {
    const v = e?.target ? e.target.value : e;
    setPage(1);
    setFilters((f) => ({ ...f, [k]: v, ...(k === 'state' ? { city: '' } : {}) }));
  };

  const sync = data?.sync;
  const more = data && data.items.length < data.total;

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Licitações</h1>
          <p className={s.pageSub}>Compras públicas de prefeituras, estados, governo federal e consórcios, com a situação de cada uma.</p>
        </div>
      </header>

      <section className={`${s.panel} ${s.panelPad} ${t.filtersPanel}`} aria-label="Filtros">
        <div className={t.filterGrid}>
          <Field label="Buscar no objeto ou órgão">
            {(a) => <Input {...a} value={filters.q} onChange={set('q')} placeholder="ex.: manutenção predial, aço, transporte" />}
          </Field>
          <Field label="Estado">
            {(a) => (
              <Select {...a} value={filters.state} onChange={set('state')}>
                <option value="">Todo o Brasil</option>
                {BR_STATES.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Cidade">
            {(a) => (
              <Select {...a} value={filters.city} onChange={set('city')} disabled={!filters.state}>
                <option value="">{filters.state ? 'Todas as cidades' : 'Escolha o estado'}</option>
                {cities.map((c) => (
                  <option key={c.city} value={c.city}>
                    {c.city} ({c.count})
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Modalidade">
            {(a) => (
              <Select {...a} value={filters.modality} onChange={set('modality')}>
                <option value="">Todas</option>
                {MODALITIES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className={s.filters} role="group" aria-label="Situação">
          {TENDER_STATUS_FILTERS.map(([value, label]) => (
            <button key={value} type="button" className={`${s.chip} ${filters.status === value ? s.chipActive : ''}`} aria-pressed={filters.status === value} onClick={() => set('status')(value)}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <p className={t.syncLine} role="status">
        <span>
          {data ? (
            <>
              <strong>{data.total.toLocaleString('pt-BR')}</strong> {data.total === 1 ? 'licitação' : 'licitações'} ·{' '}
              {sync?.lastSuccessAt ? `atualizado ${relative(sync.lastSuccessAt)}` : 'primeira atualização em andamento'}
              {sync?.running ? ' · atualizando agora…' : ''} · Fonte: PNCP
            </>
          ) : (
            'Carregando…'
          )}
        </span>
        <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => load(false)} loading={loading && page === 1}>
          Atualizar
        </Button>
      </p>

      {error && !data ? (
        <ErrorState title="Não foi possível carregar as licitações." message={error.message} onRetry={() => load(false)} />
      ) : !data ? (
        <div className={t.list}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          visual={<Building size={28} aria-hidden="true" />}
          title={sync?.lastSuccessAt ? 'Nenhuma licitação com esses filtros.' : 'Buscando as licitações abertas no PNCP…'}
          message={sync?.lastSuccessAt ? 'Tente outro estado, cidade ou palavra.' : 'A primeira carga leva alguns minutos. Esta página atualiza sozinha.'}
        />
      ) : (
        <>
          <div className={t.list}>
            {data.items.map((item) => (
              <TenderCard key={item.id} item={item} />
            ))}
          </div>
          {more && (
            <div className={t.more}>
              <Button variant="secondary" onClick={() => setPage((p) => p + 1)} loading={loading && page > 1}>
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
