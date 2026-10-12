import { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Send, Star, UserPlus, Users, X } from 'lucide-react';
import { useApi } from '../../lib/hooks.js';
import { useAction } from '../../lib/actions.js';
import { fmtDate } from '../../lib/time.js';
import { Badge, Button, DemoBadge, EmptyState, ErrorState, Field, Input, SkeletonCard } from '../../components/ui/ui.jsx';
import s from './app.module.css';

const STATUS = { SUGGESTED: ['primary', 'Sugerido'], INVITED: ['amber', 'Convidado'], ACCEPTED: ['revenue', 'Aceitou'], DECLINED: ['neutral', 'Recusado'], COMPLETED: ['revenue', 'Concluído'] };

export default function Workforce() {
  const { data, error, reload } = useApi('/api/workforce');
  const { run, busy } = useAction();
  const { stream } = useOutletContext();
  const [form, setForm] = useState({ role: '', quantity: '1', startDate: '' });

  useEffect(() => {
    document.title = 'Equipes — AutoPix';
  }, []);
  useEffect(() => {
    if (stream.latest?.source === 'Workforce' || /Profissional/.test(stream.latest?.title || '')) reload();
  }, [stream.latest, reload]);

  const submit = async (e) => {
    e.preventDefault();
    const out = await run(
      'CREATE_WORKFORCE_DEMAND',
      { role: form.role, quantity: Number(form.quantity), startDate: form.startDate ? new Date(`${form.startDate}T11:00:00Z`).toISOString() : null },
      { success: 'Demanda criada.' },
    );
    if (out) {
      setForm({ role: '', quantity: '1', startDate: '' });
      reload();
    }
  };

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Equipes</h1>
          <p className={s.pageSub}>Demandas de profissionais e candidatos compatíveis.</p>
        </div>
      </header>
      <form className={`${s.panel} ${s.panelPad}`} onSubmit={submit} noValidate style={{ marginBottom: 16 }}>
        <div className={s.formGrid}>
          <Field label="Função">{(a) => <Input {...a} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Soldador" />}</Field>
          <Field label="Quantidade">{(a) => <Input {...a} type="number" min={1} max={200} inputMode="numeric" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />}</Field>
          <Field label="Início" optional>{(a) => <Input {...a} type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />}</Field>
        </div>
        <div style={{ marginTop: 14 }}>
          <Button type="submit" icon={UserPlus} loading={busy === 'CREATE_WORKFORCE_DEMAND'} disabled={form.role.length < 2 || Number(form.quantity) < 1}>
            Criar demanda
          </Button>
        </div>
      </form>
      {error ? (
        <ErrorState title="Não foi possível carregar as demandas." message={error.message} onRetry={reload} />
      ) : !data ? (
        <SkeletonCard lines={3} />
      ) : data.demands.length === 0 ? (
        <EmptyState title="Nenhuma demanda" message="Crie acima ou pelo WhatsApp: “preciso de 3 soldadores segunda”." />
      ) : (
        <div className={s.stack}>
          {data.demands.map((d) => (
            <section key={d.id} className={`${s.panel} ${s.panelPad}`}>
              <div className={s.sectionHead}>
                <h2 className={s.panelTitle}>
                  <Users size={15} style={{ verticalAlign: -2 }} aria-hidden="true" /> {d.quantity} × {d.role}
                  {d.startDate && <span className={s.muted}> · início {fmtDate(d.startDate)}</span>}
                </h2>
                {d.isDemo && <DemoBadge />}
              </div>
              {d.matches.length ? (
                <div className={s.list}>
                  {d.matches.map((m) => {
                    const [tone, label] = STATUS[m.status];
                    return (
                      <Link key={m.id} to={`/app/workforce/matches/${m.id}`} className={s.rowLink}>
                        <span className={s.rowMain}>
                          <strong>{m.professionalName}</strong>
                          <span>
                            {m.role}
                            {m.city ? ` · ${m.city}` : ''}
                            {m.experienceYears ? ` · ${m.experienceYears} anos` : ''}
                          </span>
                        </span>
                        <span className={s.rowBadges}>
                          {m.rating && (
                            <span className={s.muted} style={{ fontSize: 12 }}>
                              <Star size={12} aria-hidden="true" /> {m.rating}
                            </span>
                          )}
                          <Badge tone={tone}>{label}</Badge>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className={s.muted} style={{ fontSize: 13 }}>
                  Aguardando profissionais compatíveis.
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

export function WorkforceMatchDetail() {
  const { id } = useParams();
  const { data, error, setData } = useApi(`/api/workforce/matches/${id}`);
  const { run, busy } = useAction();
  const m = data?.match;
  const act = async (action, success) => {
    const out = await run(action, { id }, { success });
    if (out?.result?.match) setData({ match: { ...m, ...out.result.match } });
  };
  if (error) return <ErrorState title="Profissional não encontrado." message={error.message} />;
  if (!m) return <SkeletonCard lines={4} />;
  const [tone, label] = STATUS[m.status];
  return (
    <>
      <Link to="/app/workforce" className={s.backLink}>
        <ArrowLeft size={14} /> Equipes
      </Link>
      <header className={s.detailHead}>
        <div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Badge tone={tone}>{label}</Badge>
            {m.isDemo && <DemoBadge />}
          </div>
          <h1 className={s.detailName}>{m.professionalName}</h1>
          <p className={s.detailMeta}>
            <span>{m.role}</span>
            {m.city && <span>{m.city}</span>}
            {m.experienceYears && <span>{m.experienceYears} anos de experiência</span>}
            {m.rating && (
              <span>
                <Star size={13} aria-hidden="true" /> {m.rating}
              </span>
            )}
          </p>
          <p className={s.muted} style={{ marginTop: 8, fontSize: 13 }}>
            Demanda: {m.demand.quantity} × {m.demand.role}
          </p>
        </div>
      </header>
      <div className={`${s.pageActions} ${s.section}`}>
        {['SUGGESTED', 'DECLINED'].includes(m.status) && (
          <Button icon={Send} loading={busy === 'INVITE_PROFESSIONAL'} onClick={() => act('INVITE_PROFESSIONAL', 'Convite registrado.')}>
            Convidar
          </Button>
        )}
        {['SUGGESTED', 'INVITED'].includes(m.status) && (
          <Button variant="secondary" icon={X} loading={busy === 'REJECT_PROFESSIONAL'} onClick={() => act('REJECT_PROFESSIONAL', 'Profissional recusado.')}>
            Recusar
          </Button>
        )}
        {['INVITED', 'ACCEPTED'].includes(m.status) && (
          <Button variant="secondary" loading={busy === 'COMPLETE_WORKFORCE_SERVICE'} onClick={() => act('COMPLETE_WORKFORCE_SERVICE', 'Serviço concluído.')}>
            Serviço concluído
          </Button>
        )}
        <Button variant="ghost" to={`/app/payments?new=1&relatedType=workforceMatch&relatedId=${m.id}`}>
          Cobrar com Pix
        </Button>
      </div>
    </>
  );
}
