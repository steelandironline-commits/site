import { useEffect, useState } from 'react';
import { Link, useLocation, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Check, Copy, ExternalLink, Globe, Mail, MapPin, Phone, RefreshCw, ShieldCheck } from 'lucide-react';
import { OPPORTUNITY_STATUSES, OPPORTUNITY_STATUS_LABELS, formatRange } from '@autopix/shared';
import { executeAction } from '../../lib/actions.js';
import { BRLText, Button, DemoBadge, ErrorState, Field, ScoreRing, Select, SkeletonCard, Textarea, useApi } from '@autopix/ui';
import { useToast } from '../../lib/toast.jsx';
import { fmtDateTime, relative } from '../../lib/time.js';
import { PriorityBadge, SignalCard, StatusBadge } from '../../components/cards/Cards.jsx';
import s from './app.module.css';

const BREAKDOWN = [
  ['industryFit', 'Setor', 25],
  ['serviceFit', 'Serviços', 25],
  ['locationFit', 'Localização', 15],
  ['signalFit', 'Força do sinal', 25],
  ['valueFit', 'Valor', 10],
];
const SOURCE_LABELS = { DEMO: 'Fonte DEMO', SEARCH: 'Busca web', WEBSITE: 'Website', NEWS: 'Notícia', PUBLIC_REGISTRY: 'Cadastro público' };

export default function OpportunityDetail() {
  const { id } = useParams();
  const { hash } = useLocation();
  const { stream } = useOutletContext();
  const toast = useToast();
  const { data, error, reload, setData } = useApi(`/api/opportunities/${id}`);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(null);
  const o = data?.opportunity;

  useEffect(() => {
    if (o) {
      document.title = `${o.targetCompanyName} — TemPix`;
      setNotes(o.notes || '');
    }
  }, [o?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (o && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [o, hash]);

  // Live: refresh the timeline when an event for this opportunity arrives.
  useEffect(() => {
    if (stream.latest?.opportunityId === id) reload();
  }, [stream.latest, id, reload]);

  const save = async (action, input, kind, message) => {
    setSaving(kind);
    try {
      const { result } = await executeAction(action, { id, ...input });
      setData({ opportunity: result.opportunity });
      toast.success(message);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(null);
    }
  };

  const copyApproach = async () => {
    try {
      await navigator.clipboard.writeText(o.suggestedApproach);
      toast.success('Abordagem copiada.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  };

  if (error) {
    return (
      <>
        <Link to="/app/opportunities" className={s.muted}>
          ← Oportunidades
        </Link>
        <div className={s.section}>
          <ErrorState title={error.status === 404 ? 'Oportunidade não encontrada.' : 'Não foi possível carregar a oportunidade.'} message={error.message} onRetry={error.status === 404 ? undefined : reload} />
        </div>
      </>
    );
  }
  if (!o) {
    return (
      <div className={s.stack}>
        <SkeletonCard lines={2} />
        <SkeletonCard lines={5} />
      </div>
    );
  }

  const breakdown = o.metadata?.breakdown;
  const location = [o.city, o.state].filter(Boolean).join(' / ');

  return (
    <>
      <Link to="/app/opportunities" className={s.muted} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14, fontSize: 14 }}>
        <ArrowLeft size={14} /> Oportunidades
      </Link>

      <header className={s.detailHead}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <PriorityBadge priority={o.priority} />
            <StatusBadge status={o.status} />
            {o.isDemo && <DemoBadge />}
          </div>
          <h1 className={s.detailName}>{o.targetCompanyName}</h1>
          <p className={s.detailMeta}>
            {o.industry && (
              <span>
                <Building2 size={14} aria-hidden="true" /> {o.industry}
              </span>
            )}
            {location && (
              <span>
                <MapPin size={14} aria-hidden="true" /> {location}
              </span>
            )}
            {o.targetWebsite && (
              <a href={o.targetWebsite} target="_blank" rel="noopener noreferrer nofollow">
                <Globe size={14} aria-hidden="true" /> {o.targetWebsite.replace(/^https?:\/\//, '')} <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
          </p>
        </div>
        <div className={s.detailScore}>
          <div style={{ textAlign: 'right' }}>
            <p className="eyebrow">Nota de oportunidade</p>
            <p className="mono" style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              confiança {Math.round(o.confidence * 100)}%
            </p>
          </div>
          <ScoreRing score={o.score} size={76} stroke={5} />
        </div>
      </header>

      <div className={s.detailGrid}>
        <div className={s.stack}>
          <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="sig">
            <h2 id="sig" className="eyebrow" style={{ marginBottom: 12 }}>
              Sinal e compatibilidade
            </h2>
            <dl className={s.kv}>
              <div>
                <dt>Sinal</dt>
                <dd><BRLText>{o.signal}</BRLText></dd>
              </div>
              <div>
                <dt>Valor estimado</dt>
                <dd className={s.revenue}><BRLText>{formatRange(o.estimatedMinValue, o.estimatedMaxValue)}</BRLText></dd>
              </div>
              <div>
                <dt>Serviços compatíveis</dt>
                <dd>{o.matchingServices.length ? o.matchingServices.join(', ') : '—'}</dd>
              </div>
              <div>
                <dt>Detectada</dt>
                <dd title={fmtDateTime(o.createdAt)}>{relative(o.createdAt)}</dd>
              </div>
            </dl>
            {o.description && <p style={{ marginTop: 14, color: 'var(--text-2)', fontSize: 14 }}>{o.description}</p>}
          </section>

          <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="why">
            <h2 id="why" className="eyebrow" style={{ marginBottom: 12 }}>
              Por que o TemPix selecionou
            </h2>
            <ul className={s.reasons}>
              {o.reasons.map((r) => (
                <li key={r}>
                  <Check size={14} aria-hidden="true" /> {r}
                </li>
              ))}
            </ul>
            {breakdown && (
              <div className={s.breakdown} style={{ marginTop: 18 }} aria-label="Composição do score">
                {BREAKDOWN.map(([k, label, max]) => (
                  <div key={k} className={s.bar}>
                    <span>{label}</span>
                    <span className={s.barTrack}>
                      <span style={{ width: `${((breakdown[k] || 0) / max) * 100}%` }} />
                    </span>
                    <span className="mono">
                      {breakdown[k] ?? 0}/{max}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section id="abordagem" className={`${s.panel} ${s.panelPad}`} aria-labelledby="appr" style={{ scrollMarginTop: 72 }}>
            <div className={s.sectionHead}>
              <h2 id="appr" className="eyebrow">
                Abordagem sugerida
              </h2>
              <div className={s.pageActions}>
                {o.suggestedApproach && (
                  <Button size="sm" variant="ghost" icon={Copy} onClick={copyApproach}>
                    Copiar
                  </Button>
                )}
                <Button size="sm" variant="secondary" icon={RefreshCw} loading={saving === 'approach'} onClick={() => save('GENERATE_APPROACH', {}, 'approach', 'Nova abordagem gerada.')}>
                  {o.suggestedApproach ? 'Gerar outra' : 'Gerar abordagem'}
                </Button>
              </div>
            </div>
            {o.suggestedApproach ? <div className={s.approach}>{o.suggestedApproach}</div> : <p className={s.muted}>Nenhuma abordagem gerada ainda.</p>}
          </section>

          {o.signals?.length > 0 && (
            <section aria-labelledby="sigs">
              <h2 id="sigs" className="eyebrow" style={{ margin: '8px 0 12px' }}>
                Sinais detectados
              </h2>
              <div className={s.cardsGrid}>
                {o.signals.map((sg) => (
                  <SignalCard key={sg.id} signal={sg} />
                ))}
              </div>
            </section>
          )}
        </div>

        <div className={s.stack}>
          <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="status">
            <h2 id="status" className="eyebrow" style={{ marginBottom: 12 }}>
              Status
            </h2>
            <Field label="Etapa do funil">
              {(a) => (
                <Select {...a} value={o.status} disabled={saving === 'status'} onChange={(e) => save('SET_OPPORTUNITY_STATUS', { status: e.target.value }, 'status', 'Status atualizado.')}>
                  {OPPORTUNITY_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {OPPORTUNITY_STATUS_LABELS[st]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div style={{ marginTop: 16 }}>
              <Field label="Notas">
                {(a) => <Textarea {...a} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Registre contatos, combinados e próximos passos." maxLength={10000} />}
              </Field>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <Button size="sm" variant="secondary" disabled={notes === (o.notes || '')} loading={saving === 'notes'} onClick={() => save('UPDATE_OPPORTUNITY_NOTES', { notes: notes || null }, 'notes', 'Notas salvas.')}>
                  Salvar notas
                </Button>
              </div>
            </div>
          </section>

          <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="contact">
            <h2 id="contact" className="eyebrow" style={{ marginBottom: 12 }}>
              Contato comercial público
            </h2>
            {o.contacts.length ? (
              <div className={s.stack}>
                {o.contacts.map((c) => (
                  <div key={c.id} className={s.contact}>
                    <strong style={{ fontWeight: 500 }}>
                      {c.name || c.role || 'Contato comercial'} {c.verified && <ShieldCheck size={13} style={{ color: 'var(--primary)', verticalAlign: -2 }} aria-label="verificado" />}
                    </strong>
                    {c.businessEmail && (
                      <a href={`mailto:${c.businessEmail}`}>
                        <Mail size={13} aria-hidden="true" /> {c.businessEmail}
                      </a>
                    )}
                    {c.companyPhone && (
                      <a href={`tel:${c.companyPhone.replace(/[^\d+]/g, '')}`}>
                        <Phone size={13} aria-hidden="true" /> {c.companyPhone}
                      </a>
                    )}
                    <span className={s.contactSource}>Fonte pública: {c.publicSource}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className={s.muted} style={{ fontSize: 13 }}>
                Nenhum contato comercial público encontrado.
              </p>
            )}
            <p className={s.muted} style={{ fontSize: 12, marginTop: 12 }}>
              Somente dados empresariais publicados pela própria empresa ou em registros públicos.
            </p>
          </section>

          <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="src">
            <h2 id="src" className="eyebrow" style={{ marginBottom: 12 }}>
              Fontes
            </h2>
            <ul className={s.sources}>
              {o.sources.map((src) => (
                <li key={src.id}>
                  <span className="eyebrow">{SOURCE_LABELS[src.type] || src.type}</span>
                  {src.url ? (
                    <a href={src.url} target="_blank" rel="noopener noreferrer nofollow">
                      {src.title}
                    </a>
                  ) : (
                    <strong>{src.title}</strong>
                  )}
                  {src.snippet && <p>{src.snippet}</p>}
                </li>
              ))}
            </ul>
          </section>

          <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="tl">
            <h2 id="tl" className="eyebrow" style={{ marginBottom: 14 }}>
              Linha do tempo
            </h2>
            <ol className={s.timeline}>
              {o.activityEvents.map((e) => (
                <li key={e.id} data-sev={e.severity}>
                  <time dateTime={e.createdAt}>{fmtDateTime(e.createdAt)}</time>
                  <strong>{e.title}</strong>
                  {e.source && <span className={s.muted}> · {e.source}</span>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
