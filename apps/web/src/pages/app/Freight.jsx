import { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, MapPin, Search, Truck, X } from 'lucide-react';
import { formatBRL } from '@autopix/shared';
import { useApi } from '../../lib/hooks.js';
import { useAction } from '../../lib/actions.js';
import { fmtDate, relative } from '../../lib/time.js';
import { Badge, Button, DemoBadge, EmptyState, ErrorState, Field, Input, SkeletonCard } from '../../components/ui/ui.jsx';
import s from './app.module.css';

const STATUS = { NEW: ['primary', 'Nova'], ACCEPTED: ['revenue', 'Aceita'], REJECTED: ['neutral', 'Recusada'], DRIVER_ARRIVED: ['info', 'Motorista chegou'], COMPLETED: ['revenue', 'Concluída'], EXPIRED: ['neutral', 'Expirada'] };

function MatchRow({ m }) {
  const [tone, label] = STATUS[m.status];
  return (
    <Link to={`/app/freight/matches/${m.id}`} className={s.rowLink}>
      <span className={s.rowIcon} aria-hidden="true">
        <Truck size={16} />
      </span>
      <span className={s.rowMain}>
        <strong>
          {m.origin} → {m.destination}
        </strong>
        <span>
          {m.cargo || 'Carga'} · {m.price ? formatBRL(m.price) : '—'} · {fmtDate(m.pickupDate)}
        </span>
      </span>
      <span className={s.rowBadges}>
        {m.isReturnLoad && <Badge tone="amber">Retorno</Badge>}
        {m.isDemo && <DemoBadge />}
        <Badge tone={tone}>{label}</Badge>
      </span>
    </Link>
  );
}

export default function Freight() {
  const { data, error, reload } = useApi('/api/freight');
  const { run, busy } = useAction();
  const { stream } = useOutletContext();
  const [form, setForm] = useState({ origin: '', destination: '', date: '' });

  useEffect(() => {
    document.title = 'Cargas — AutoPix';
  }, []);
  useEffect(() => {
    if (stream.latest?.source === 'Freight' || /Carga/.test(stream.latest?.title || '')) reload();
  }, [stream.latest, reload]);

  const submit = async (e) => {
    e.preventDefault();
    const out = await run(
      'CREATE_FREIGHT_REQUEST',
      { origin: form.origin, destination: form.destination, date: form.date ? new Date(`${form.date}T11:00:00Z`).toISOString() : null },
      { success: 'Busca de carga criada.' },
    );
    if (out) {
      setForm({ origin: '', destination: '', date: '' });
      reload();
    }
  };

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Cargas</h1>
          <p className={s.pageSub}>Rotas monitoradas e cargas compatíveis, inclusive de retorno.</p>
        </div>
      </header>
      <form className={`${s.panel} ${s.panelPad}`} onSubmit={submit} noValidate style={{ marginBottom: 16 }}>
        <div className={s.formGrid} style={{ gridTemplateColumns: undefined }}>
          <Field label="Origem">{(a) => <Input {...a} value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} placeholder="Santos" />}</Field>
          <Field label="Destino">{(a) => <Input {...a} value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="São Paulo" />}</Field>
          <Field label="Data" optional>{(a) => <Input {...a} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />}</Field>
        </div>
        <div style={{ marginTop: 14 }}>
          <Button type="submit" icon={Search} loading={busy === 'CREATE_FREIGHT_REQUEST'} disabled={form.origin.length < 2 || form.destination.length < 2}>
            Procurar cargas
          </Button>
        </div>
      </form>

      {error ? (
        <ErrorState title="Não foi possível carregar as cargas." message={error.message} onRetry={reload} />
      ) : !data ? (
        <SkeletonCard lines={3} />
      ) : (
        <>
          <section aria-labelledby="matches" className={s.section} style={{ marginTop: 0 }}>
            <h2 id="matches" className="eyebrow" style={{ marginBottom: 10 }}>
              Cargas compatíveis
            </h2>
            {data.matches.length ? (
              <div className={s.list}>
                {data.matches.map((m) => (
                  <MatchRow key={m.id} m={m} />
                ))}
              </div>
            ) : (
              <EmptyState title="Nenhuma carga ainda" message="Crie uma busca acima ou pelo WhatsApp: “procura carga de Santos para São Paulo amanhã”." />
            )}
          </section>
          {data.requests.length > 0 && (
            <section aria-labelledby="reqs" className={s.section}>
              <h2 id="reqs" className="eyebrow" style={{ marginBottom: 10 }}>
                Buscas
              </h2>
              <div className={s.list}>
                {data.requests.map((r) => (
                  <div key={r.id} className={s.rowLink} style={{ cursor: 'default' }}>
                    <span className={s.rowIcon} aria-hidden="true">
                      <MapPin size={16} />
                    </span>
                    <span className={s.rowMain}>
                      <strong>
                        {r.origin} → {r.destination}
                      </strong>
                      <span>
                        {r.date ? fmtDate(r.date) : 'Sem data'} · criada {relative(r.createdAt)}
                      </span>
                    </span>
                    <span className={s.rowBadges}>{r.isDemo && <DemoBadge />}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

export function FreightMatchDetail() {
  const { id } = useParams();
  const { data, error, setData } = useApi(`/api/freight/matches/${id}`);
  const { run, busy } = useAction();
  const m = data?.match;

  const act = async (action, success) => {
    const out = await run(action, { id }, { success });
    if (out?.result?.match) setData({ match: { ...m, ...out.result.match } });
  };

  if (error) return <ErrorState title="Carga não encontrada." message={error.message} />;
  if (!m) return <SkeletonCard lines={4} />;
  const [tone, label] = STATUS[m.status];
  const maps = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(m.origin)}&destination=${encodeURIComponent(m.destination)}`;

  return (
    <>
      <Link to="/app/freight" className={s.backLink}>
        <ArrowLeft size={14} /> Cargas
      </Link>
      <header className={s.detailHead}>
        <div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Badge tone={tone}>{label}</Badge>
            {m.isReturnLoad && <Badge tone="amber">Carga de retorno</Badge>}
            {m.isDemo && <DemoBadge />}
          </div>
          <h1 className={s.detailName}>
            {m.origin} <ArrowRight size={20} style={{ verticalAlign: -2 }} /> {m.destination}
          </h1>
          <p className={s.detailMeta}>
            <span>{m.cargo || 'Carga geral'}</span>
            {m.weightKg && <span>{(m.weightKg / 1000).toLocaleString('pt-BR')} t</span>}
            {m.carrierName && <span>{m.carrierName}</span>}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p className="eyebrow">Frete</p>
          <p className={`${s.revenue} num`} style={{ fontSize: 24 }}>
            {m.price ? formatBRL(m.price) : '—'}
          </p>
          <p className={s.muted} style={{ fontSize: 13 }}>
            Coleta {fmtDate(m.pickupDate)}
          </p>
        </div>
      </header>
      <div className={`${s.pageActions} ${s.section}`}>
        {m.status === 'NEW' && (
          <>
            <Button icon={Check} loading={busy === 'ACCEPT_FREIGHT_MATCH'} onClick={() => act('ACCEPT_FREIGHT_MATCH', 'Carga aceita.')}>
              Tenho interesse
            </Button>
            <Button variant="secondary" icon={X} loading={busy === 'REJECT_FREIGHT_MATCH'} onClick={() => act('REJECT_FREIGHT_MATCH', 'Carga recusada.')}>
              Recusar
            </Button>
          </>
        )}
        {m.status === 'ACCEPTED' && (
          <Button variant="secondary" loading={busy === 'MARK_DRIVER_ARRIVED'} onClick={() => act('MARK_DRIVER_ARRIVED', 'Chegada registrada.')}>
            Motorista chegou
          </Button>
        )}
        {['ACCEPTED', 'DRIVER_ARRIVED'].includes(m.status) && (
          <Button loading={busy === 'COMPLETE_FREIGHT'} onClick={() => act('COMPLETE_FREIGHT', 'Frete concluído.')}>
            Concluir frete
          </Button>
        )}
        <Button variant="ghost" href={maps} target="_blank" rel="noopener noreferrer">
          Ver rota
        </Button>
        <Button variant="ghost" to={`/app/payments?new=1&relatedType=freightMatch&relatedId=${m.id}`}>
          Cobrar com Pix
        </Button>
      </div>
    </>
  );
}
