import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Play } from 'lucide-react';
import { post } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.jsx';
import { fmtDateTime, formatDuration, relative } from '../../lib/time.js';
import { AgentCard } from '../../components/cards/Cards.jsx';
import { Badge, Button, EmptyState, ErrorState, SkeletonCard } from '../../components/ui/ui.jsx';
import s from './app.module.css';

const RUN_TONE = { RUNNING: 'revenue', SUCCEEDED: 'primary', FAILED: 'danger' };
const RUN_LABEL = { RUNNING: 'Executando', SUCCEEDED: 'Concluído', FAILED: 'Falhou' };
const JOB_LABEL = { QUEUED: 'Na fila', RUNNING: 'Executando', COMPLETED: 'Concluído', FAILED: 'Falhou', CANCELED: 'Cancelado' };

function metricsText(m) {
  if (!m) return '—';
  return Object.entries(m)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
}

export default function Agents() {
  const { stream, me } = useOutletContext();
  const toast = useToast();
  const agents = useApi('/api/agents');
  const runs = useApi('/api/agents/runs?limit=30');
  const [running, setRunning] = useState(false);
  const active = me.subscription?.status === 'ACTIVE';

  useEffect(() => {
    document.title = 'Agentes — AutoPix';
  }, []);

  useEffect(() => {
    if (!stream.latest) return undefined;
    const t = setTimeout(() => {
      agents.reload();
      runs.reload();
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.latest]);

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await post('/api/agents/run');
      toast.success(res.created ? 'Novo ciclo na fila.' : 'Já existe um ciclo na fila ou em execução.');
      agents.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  };

  const job = agents.data?.latestJob;

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Agentes</h1>
          <p className={s.pageSub}>
            Ciclos automáticos a cada {agents.data?.intervalMinutes ?? '…'} min.
            {job && (
              <>
                {' '}
                Último: <Badge tone={job.status === 'FAILED' ? 'danger' : job.status === 'RUNNING' ? 'revenue' : 'neutral'}>{JOB_LABEL[job.status]}</Badge>{' '}
                <span className={s.muted}>{relative(job.finishedAt || job.startedAt || job.runAt)}</span>
              </>
            )}
          </p>
        </div>
        <Button icon={Play} onClick={runNow} loading={running} disabled={!active}>
          Executar busca agora
        </Button>
      </header>

      {agents.error ? (
        <ErrorState title="Não foi possível carregar os agentes." message={agents.error.message} onRetry={agents.reload} />
      ) : (
        <div className={s.cardsGrid} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 250px), 1fr))' }}>
          {agents.data
            ? agents.data.items.map((a, i) => <AgentCard key={a.key} agent={a} index={i} />)
            : Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} lines={4} />)}
        </div>
      )}

      <section className={s.section} aria-labelledby="runs-title">
        <div className={s.sectionHead}>
          <h2 id="runs-title" className="eyebrow">
            Execuções recentes
          </h2>
        </div>
        <div className={s.panel}>
          {runs.error ? (
            <ErrorState compact title="Não foi possível carregar as execuções." message={runs.error.message} onRetry={runs.reload} />
          ) : runs.data && !runs.data.items.length ? (
            <EmptyState title="Nenhuma execução ainda" message="A primeira busca começa logo após a ativação." />
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th scope="col">Agente</th>
                    <th scope="col">Status</th>
                    <th scope="col">Início</th>
                    <th scope="col">Duração</th>
                    <th scope="col">Métricas</th>
                  </tr>
                </thead>
                <tbody>
                  {(runs.data?.items || []).map((r) => (
                    <tr key={r.id}>
                      <td>{r.agent.name}</td>
                      <td>
                        <Badge tone={RUN_TONE[r.status]}>{RUN_LABEL[r.status]}</Badge>
                      </td>
                      <td className="mono">{fmtDateTime(r.startedAt)}</td>
                      <td className="mono">{formatDuration(r.durationMs)}</td>
                      <td className="mono" title={r.error || ''} style={{ color: r.error ? 'var(--danger)' : undefined }}>
                        {r.error ? r.error.slice(0, 60) : metricsText(r.metrics)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
