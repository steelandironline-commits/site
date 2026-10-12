import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Building2, CircleDollarSign, Play, Radar as RadarIcon, Target } from 'lucide-react';
import { formatBRL } from '@autopix/shared';
import { executeAction } from '../../lib/actions.js';
import { useApi } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.jsx';
import { greeting, relative } from '../../lib/time.js';
import { MetricCard, OpportunityCard } from '../../components/cards/Cards.jsx';
import { ActivityStream } from '../../components/activity/ActivityStream.jsx';
import { BusinessFlow } from '../../components/activity/Flow.jsx';
import { Button, EmptyState, ErrorState, MiniRadar, SkeletonCard } from '../../components/ui/ui.jsx';
import { useOpportunityActions } from './useOpportunityActions.js';
import s from './app.module.css';

export default function Overview() {
  const { stream, me } = useOutletContext();
  const toast = useToast();
  const dash = useApi('/api/dashboard');
  const top = useApi('/api/opportunities?sort=score&pageSize=4');
  const [running, setRunning] = useState(false);
  const actions = useOpportunityActions({ onUpdated: () => top.reload() });
  const active = me.subscription?.status === 'ACTIVE';

  useEffect(() => {
    document.title = 'Visão Geral — AutoPix';
  }, []);

  // Refresh metrics when the agents create something.
  const latest = stream.latest;
  useEffect(() => {
    if (!latest) return undefined;
    const t = setTimeout(() => {
      dash.reload();
      if (latest.type === 'OPPORTUNITY') top.reload();
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest]);

  const runNow = async () => {
    setRunning(true);
    try {
      const { result } = await executeAction('START_AGENT');
      toast.success(result.created ? 'Busca solicitada. Acompanhe na atividade.' : 'Já existe uma busca em andamento.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  };

  const m = dash.data?.metrics;
  const firstName = useMemo(() => me.user.name.split(' ')[0], [me.user.name]);
  const job = dash.data?.latestJob;

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>
            {greeting()}, {firstName}.
          </h1>
          <p className={s.pageSub}>
            {active ? 'Seu AutoPix está procurando oportunidades.' : 'Seus agentes estão pausados. Renove a assinatura para retomar.'}
            {job && (
              <span className={s.muted}>
                {' '}
                · Último ciclo {job.status === 'RUNNING' ? 'em execução' : relative(job.finishedAt || job.runAt)}
              </span>
            )}
          </p>
        </div>
        <div className={s.pageActions}>
          {active ? (
            <Button variant="secondary" icon={Play} onClick={runNow} loading={running}>
              Buscar agora
            </Button>
          ) : (
            <Button to="/app/subscription">Renovar assinatura</Button>
          )}
        </div>
      </header>

      {dash.error ? (
        <ErrorState title="Não foi possível carregar os indicadores." message={dash.error.message} onRetry={dash.reload} />
      ) : (
        <div className={s.metrics}>
          <MetricCard index={0} label="Oportunidades" value={m?.opportunities ?? 0} loading={!m} icon={Target} hint={m ? `+${m.newLast24h} nas últimas 24h` : null} />
          <MetricCard index={1} label="Alta prioridade" value={m?.highPriority ?? 0} loading={!m} icon={RadarIcon} tone="primary" hint="em aberto" />
          <MetricCard
            index={2}
            label="Potencial identificado"
            value={m?.potentialValue ?? 0}
            format={formatBRL}
            loading={!m}
            icon={CircleDollarSign}
            tone="revenue"
            hint="soma do teto estimado em aberto"
          />
          <MetricCard index={3} label="Empresas analisadas" value={m?.companiesAnalyzed ?? 0} loading={!m} icon={Building2} hint="desde a ativação" />
        </div>
      )}

      <div className={s.section}>
        <BusinessFlow flow={dash.data?.flow} latest={stream.latest} active={active} />
      </div>

      <div className={`${s.section} ${s.split}`}>
        <section aria-labelledby="top-opps">
          <div className={s.sectionHead}>
            <h2 id="top-opps" className="eyebrow">
              Melhores oportunidades
            </h2>
            <Link to="/app/opportunities">Ver todas →</Link>
          </div>
          {top.error ? (
            <ErrorState compact title="Não foi possível carregar as oportunidades." message={top.error.message} onRetry={top.reload} />
          ) : !top.data ? (
            <div className={s.list}>
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : top.data.items.length === 0 ? (
            <EmptyState visual={<MiniRadar />} title="Procurando oportunidades..." message="Seus agentes começaram a analisar o mercado." />
          ) : (
            <div className={s.list}>
              {top.data.items.map((o, i) => (
                <OpportunityCard
                  key={o.id}
                  index={i}
                  opportunity={o}
                  layout="row"
                  busy={actions.busy[o.id]}
                  onApproach={actions.generateApproach}
                  onContact={actions.markContacted}
                />
              ))}
            </div>
          )}
        </section>
        <ActivityStream
          events={stream.events}
          mode={stream.mode}
          loading={stream.loading}
          max={14}
          compact
          empty={<EmptyState visual={<MiniRadar size={72} />} title="Aguardando atividade" message="Os eventos dos agentes aparecem aqui em tempo real." />}
        />
      </div>
    </>
  );
}
