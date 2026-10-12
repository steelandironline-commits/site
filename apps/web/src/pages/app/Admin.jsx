import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { formatCents } from '@autopix/shared';
import { useApi } from '../../lib/hooks.js';
import { useAction } from '../../lib/actions.js';
import { api } from '../../lib/api.js';
import { useSession } from '../../lib/session.jsx';
import { fmtDateTime } from '../../lib/time.js';
import { MetricCard } from '../../components/cards/Cards.jsx';
import { Badge, Button, Dialog, EmptyState, ErrorState, Field, Select, SkeletonCard, Textarea } from '../../components/ui/ui.jsx';
import s from './app.module.css';

const money = (c) => (c == null ? '—' : formatCents(c));
const short = (id) => (id ? `…${String(id).slice(-8)}` : '—');

/** Columns per back-office view. Read-only: no field edits financial state. */
const VIEWS = {
  reconciliation: { label: 'Reconciliação', path: '/api/admin/reconciliation', cols: [['kind', 'Tipo'], ['status', 'Status', (v) => <Badge tone={v === 'OPEN' ? 'danger' : v === 'AUTO_REPAIRED' ? 'info' : 'neutral'}>{v}</Badge>], ['localStatus', 'Local'], ['providerStatus', 'Provedor'], ['paymentId', 'Pagamento', short], ['createdAt', 'Criado', fmtDateTime]] },
  disputes: { label: 'Disputas', path: '/api/admin/disputes', cols: [['reason', 'Motivo'], ['status', 'Status', (v) => <Badge tone={v.startsWith('RESOLVED') ? 'neutral' : 'amber'}>{v}</Badge>], ['transaction', 'Valor', (t) => money(t?.grossAmount)], ['transactionId', 'Transação', short], ['createdAt', 'Aberta', fmtDateTime]] },
  payments: { label: 'Pagamentos', path: '/api/admin/payments', cols: [['kind', 'Tipo'], ['status', 'Status'], ['amountCents', 'Valor', money], ['refundedCents', 'Reembolsado', money], ['provider', 'Provedor'], ['isSandbox', 'Ambiente', (v) => (v ? 'SANDBOX' : 'produção')], ['createdAt', 'Criado', fmtDateTime]] },
  transactions: { label: 'Transações', path: '/api/admin/transactions', cols: [['type', 'Tipo'], ['status', 'Status'], ['grossAmount', 'Bruto', money], ['commissionAmount', 'Comissão', money], ['settlementStatus', 'Repasse'], ['createdAt', 'Criado', fmtDateTime]] },
  events: { label: 'Eventos do provedor', path: '/api/admin/provider-events', cols: [['provider', 'Provedor'], ['type', 'Tipo'], ['status', 'Status'], ['processingStatus', 'Processamento'], ['payloadHash', 'Hash', (v) => (v ? `${v.slice(0, 10)}…` : '—')], ['createdAt', 'Recebido', fmtDateTime]] },
  failed: { label: 'Webhooks com falha', path: '/api/admin/failed-webhooks', cols: [['provider', 'Provedor'], ['type', 'Tipo'], ['processingStatus', 'Status'], ['error', 'Erro'], ['createdAt', 'Recebido', fmtDateTime]] },
  refunds: { label: 'Reembolsos', path: '/api/admin/refunds', cols: [['amountCents', 'Valor', money], ['status', 'Status'], ['error', 'Erro'], ['paymentId', 'Pagamento', short], ['createdAt', 'Criado', fmtDateTime]] },
  payouts: { label: 'Falhas de repasse', path: '/api/admin/payout-failures', cols: [['amountCents', 'Valor', money], ['status', 'Status'], ['error', 'Erro'], ['transactionId', 'Transação', short], ['createdAt', 'Criado', fmtDateTime]] },
};

function IssueActions({ row, onDone }) {
  const { run, busy } = useAction();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  if (['RESOLVED', 'AUTO_REPAIRED'].includes(row.status)) return null;
  return (
    <>
      {row.status === 'OPEN' && (
        <Button size="sm" variant="ghost" loading={busy === `ack-${row.id}`} onClick={async () => (await run('RESOLVE_RECONCILIATION_ISSUE', { id: row.id, status: 'ACKNOWLEDGED' }, { key: `ack-${row.id}` })) && onDone()}>
          Reconhecer
        </Button>
      )}
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Encerrar
      </Button>
      <Dialog
        open={open}
        title="Encerrar divergência"
        onClose={() => setOpen(false)}
        actions={
          <Button disabled={note.trim().length < 10} loading={busy === 'RESOLVE_RECONCILIATION_ISSUE'} onClick={async () => (await run('RESOLVE_RECONCILIATION_ISSUE', { id: row.id, status: 'RESOLVED', note }, { success: 'Divergência encerrada.' })) && (setOpen(false), onDone())}>
            Encerrar
          </Button>
        }
      >
        <p className={s.muted} style={{ fontSize: 13, marginBottom: 12 }}>
          Registra a resolução no histórico auditado. Nenhum valor é alterado por esta tela.
        </p>
        <Field label="Resolução">{(a) => <Textarea {...a} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />}</Field>
      </Dialog>
    </>
  );
}

function DisputeActions({ row, onDone }) {
  const { run, busy } = useAction();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState(row.metadata?.summary || null);
  const [outcome, setOutcome] = useState('BUYER');
  const [note, setNote] = useState('');
  if (row.status.startsWith('RESOLVED') || row.status === 'CANCELLED') return null;
  return (
    <>
      <Button size="sm" variant="secondary" onClick={async () => {
        setOpen(true);
        if (!summary) setSummary((await api(`/api/admin/disputes/${row.id}/summary`, { method: 'POST' })).summary);
      }}>
        Analisar
      </Button>
      <Dialog
        open={open}
        title="Decisão da disputa"
        onClose={() => setOpen(false)}
        actions={
          <Button variant="danger" disabled={note.trim().length < 10} loading={busy === 'RESOLVE_DISPUTE'} onClick={async () => (await run('RESOLVE_DISPUTE', { id: row.id, outcome, note })) && (setOpen(false), onDone())}>
            Decidir (pede senha)
          </Button>
        }
      >
        {summary && (
          <ul className={s.timeline} style={{ marginBottom: 12 }}>
            {summary.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
            <li>
              <em>{summary.note}</em>
            </li>
          </ul>
        )}
        <div className={s.formGrid}>
          <Field label="Decisão">
            {(a) => (
              <Select {...a} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                <option value="BUYER">A favor do cliente (reembolso)</option>
                <option value="SELLER">A favor do prestador (segue para liberação)</option>
                <option value="CANCEL">Encerrar sem decisão</option>
              </Select>
            )}
          </Field>
          <Field label="Fundamentação">{(a) => <Textarea {...a} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />}</Field>
        </div>
      </Dialog>
    </>
  );
}

export default function Admin() {
  const { me } = useSession();
  const [view, setView] = useState('reconciliation');
  const overview = useApi(me?.user?.isPlatformAdmin ? '/api/admin/overview' : null);
  const list = useApi(me?.user?.isPlatformAdmin ? VIEWS[view].path : null);

  useEffect(() => {
    document.title = 'Administração financeira — TemPix';
  }, []);
  if (me && !me.user?.isPlatformAdmin) return <Navigate to="/app" replace />;

  const o = overview.data?.overview;
  const v = VIEWS[view];
  const reload = () => {
    list.reload();
    overview.reload();
  };

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Administração financeira</h1>
          <p className={s.pageSub}>Acesso restrito. Leitura e anotações auditadas — nenhum estado financeiro é editado manualmente.</p>
        </div>
        <Badge tone="danger" dot>
          <ShieldAlert size={12} aria-hidden="true" /> Restrito
        </Badge>
      </header>
      <div className={s.metrics}>
        <MetricCard index={0} label="Divergências abertas" value={o?.openIssues ?? 0} loading={!o} tone="primary" />
        <MetricCard index={1} label="Disputas abertas" value={o?.openDisputes ?? 0} loading={!o} />
        <MetricCard index={2} label="Webhooks com falha" value={o?.failedEvents ?? 0} loading={!o} />
        <MetricCard index={3} label="Reembolsos em curso" value={o?.refundsInFlight ?? 0} loading={!o} />
      </div>
      <nav className={`${s.filters} ${s.section}`} aria-label="Visões">
        {Object.entries(VIEWS).map(([k, x]) => (
          <button key={k} type="button" className={`${s.chip} ${view === k ? s.chipActive : ''}`} aria-pressed={view === k} onClick={() => setView(k)}>
            {x.label}
          </button>
        ))}
      </nav>
      {list.error ? (
        <ErrorState title="Não foi possível carregar." message={list.error.message} onRetry={list.reload} />
      ) : !list.data ? (
        <SkeletonCard lines={4} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="Nada aqui" message="Nenhum registro nesta visão." />
      ) : (
        <div className={`${s.panel} ${s.tableWrap}`}>
          <table className={s.table}>
            <thead>
              <tr>
                {v.cols.map(([, label]) => (
                  <th key={label}>{label}</th>
                ))}
                {['reconciliation', 'disputes', 'transactions'].includes(view) && <th aria-label="Ações" />}
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((row) => (
                <tr key={row.id}>
                  {v.cols.map(([key, label, fmt]) => (
                    <td key={label}>{fmt ? fmt(row[key]) : (row[key] ?? '—')}</td>
                  ))}
                  {view === 'reconciliation' && (
                    <td>
                      <IssueActions row={row} onDone={reload} />
                    </td>
                  )}
                  {view === 'disputes' && (
                    <td>
                      <DisputeActions row={row} onDone={reload} />
                    </td>
                  )}
                  {view === 'transactions' && (
                    <td>
                      <Link to={`/app/pay/transactions/${row.id}`}>Abrir</Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
