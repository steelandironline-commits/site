import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { formatRange } from '@autopix/shared';
import { useApi, useIsMobile } from '../../lib/hooks.js';
import { compactBRL } from '../../lib/time.js';
import LazyRadar from '../../components/radar/LazyRadar.jsx';
import { DemoBadge, EmptyState, ErrorState, MiniRadar, Skeleton } from '../../components/ui/ui.jsx';
import s from './app.module.css';

export default function RadarPage() {
  const navigate = useNavigate();
  const mobile = useIsMobile();
  const { demoMode, me } = useOutletContext();
  const { data, error, reload } = useApi('/api/opportunities?sort=score&pageSize=12');

  useEffect(() => {
    document.title = 'Radar — TemPix';
  }, []);

  const nodes = useMemo(
    () =>
      (data?.items || []).map((o) => ({
        id: o.id,
        value: compactBRL(o.estimatedMaxValue),
        name: o.targetCompanyName,
        match: o.score,
        signal: o.signal,
        range: formatRange(o.estimatedMinValue, o.estimatedMaxValue),
      })),
    [data],
  );
  const anyDemo = data?.items?.some((o) => o.isDemo);

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Radar</h1>
          <p className={s.pageSub}>As oportunidades com maior compatibilidade, ao redor da sua empresa.</p>
        </div>
      </header>
      <div className={s.radarLayout}>
        <div className={s.radarStage}>
          <div className={s.radarHud}>
            <span className="eyebrow">{nodes.length} sinais no radar</span>
            {(demoMode || anyDemo) && <DemoBadge />}
          </div>
          {error ? (
            <div className={s.radarEmpty}>
              <ErrorState compact title="Não foi possível carregar o radar." message={error.message} onRetry={reload} />
            </div>
          ) : !data ? (
            <div className={s.radarEmpty}>
              <MiniRadar size={140} />
            </div>
          ) : nodes.length === 0 ? (
            <div className={s.radarEmpty}>
              <EmptyState visual={<MiniRadar size={140} />} title="Procurando oportunidades..." message="Seus agentes começaram a analisar o mercado." />
            </div>
          ) : (
            <LazyRadar
              nodes={nodes}
              height={mobile ? 380 : 600}
              centerLabel={(me.company?.name || 'SUA EMPRESA').toUpperCase().slice(0, 28)}
              onSelect={(n) => navigate(`/app/opportunities/${n.id}`)}
              demo={anyDemo}
            />
          )}
        </div>
        <aside className={s.panel} aria-label="Lista do radar">
          <div className={s.sectionHead} style={{ padding: '14px 14px 0' }}>
            <h2 className="eyebrow">Por compatibilidade</h2>
          </div>
          <div className={s.radarList}>
            {!data
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className={s.radarItem}>
                    <Skeleton w="70%" h={12} />
                    <Skeleton w={30} h={12} />
                  </div>
                ))
              : data.items.map((o) => (
                  <Link key={o.id} to={`/app/opportunities/${o.id}`} className={s.radarItem}>
                    <strong>{o.targetCompanyName}</strong>
                    <b>{o.score}%</b>
                    <span>{formatRange(o.estimatedMinValue, o.estimatedMaxValue)}</span>
                  </Link>
                ))}
          </div>
        </aside>
      </div>
    </>
  );
}
