import { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, CheckCheck, Copy, MapPin, Navigation, Package, Play, Send, ShieldCheck, Truck, Undo2, Unlock, X } from 'lucide-react';
import { SETTLEMENT_STATUS_LABELS, TRANSACTION_TYPE_LABELS, TRANSACTION_UI_STATE, formatCents } from '@autopix/shared';
import { BRLText, Badge, Button, DemoBadge, Dialog, ErrorState, Field, Input, SkeletonCard, Textarea, useApi, useBrand, useVisibleInterval } from '@autopix/ui';
import { useAction } from '../../lib/actions.js';
import { useToast } from '../../lib/toast.jsx';
import { fmtDateTime } from '../../lib/time.js';
import { PartnerNote } from './Pay.jsx';
import s from './app.module.css';

/** Role/state actions → UI. The server decides which ones are allowed. */
const ACTIONS = {
  CREATE_TRANSACTION_PIX: { label: 'GERAR PIX', icon: Copy, variant: 'primary' },
  START_SERVICE: { label: 'INICIAR SERVIÇO', icon: Play, variant: 'secondary' },
  REPORT_COMPLETION: { label: 'INFORMAR CONCLUSÃO', icon: Check, variant: 'primary' },
  REQUEST_RELEASE: { label: 'SOLICITAR LIBERAÇÃO', icon: Send, variant: 'secondary' },
  CONFIRM_COMPLETION: { label: 'CONFIRMAR CONCLUSÃO', icon: CheckCheck, variant: 'primary' },
  CONFIRM_DELIVERY: { label: 'CONFIRMAR ENTREGA', icon: Package, variant: 'primary' },
  RELEASE_PAYMENT: { label: 'LIBERAR PAGAMENTO', icon: Unlock, variant: 'primary' },
  OPEN_DISPUTE: { label: 'ABRIR DISPUTA', icon: AlertTriangle, variant: 'ghost', dialog: 'dispute' },
  REFUND_PAYMENT: { label: 'REEMBOLSAR', icon: Undo2, variant: 'danger', dialog: 'refund' },
  CANCEL_TRANSACTION: { label: 'CANCELAR', icon: X, variant: 'ghost' },
};
const SUCCESS = {
  CREATE_TRANSACTION_PIX: 'Pix gerado.',
  START_SERVICE: 'Início registrado.',
  REPORT_COMPLETION: 'Conclusão informada ao cliente.',
  REQUEST_RELEASE: 'Pedido enviado ao cliente.',
  CONFIRM_COMPLETION: 'Conclusão confirmada.',
  CONFIRM_DELIVERY: 'Entrega confirmada.',
  CANCEL_TRANSACTION: 'Negócio cancelado.',
};
const TRIP_STEPS = [
  ['EN_ROUTE_PICKUP', 'A caminho'],
  ['LOADED', 'Carregado'],
  ['AT_DESTINATION', 'No destino'],
  ['DELIVERED', 'Entregue'],
];
const TRIP_ORDER = ['NOT_STARTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADED', 'IN_TRANSIT', 'AT_DESTINATION', 'DELIVERED'];
const TRIP_LABELS = {
  DRIVER_EN_ROUTE_PICKUP: 'Motorista a caminho da coleta',
  DRIVER_ARRIVED_PICKUP: 'Motorista chegou à coleta',
  CARGO_LOADED: 'Carga carregada',
  TRIP_STARTED: 'Viagem iniciada',
  NEAR_DESTINATION: 'Próximo ao destino',
  DRIVER_ARRIVED_DESTINATION: 'Chegou ao destino',
  DELIVERY_CONFIRMED: 'Entrega confirmada pelo cliente',
};

function PixPanel({ payment }) {
  const toast = useToast();
  if (!payment?.pixCopyPaste || payment.status !== 'PENDING') return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payment.pixCopyPaste);
      toast.success('Código Pix copiado.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  };
  return (
    <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="pix-title">
      <h2 id="pix-title" className={s.panelTitle} style={{ marginBottom: 12 }}>
        Cobrança Pix {payment.isSandbox && <DemoBadge label="SANDBOX" />}
      </h2>
      <div className={s.pixBox}>
        {payment.pixQrCodeBase64 && <img src={`data:image/png;base64,${payment.pixQrCodeBase64}`} alt={`QR Code Pix de ${formatCents(payment.amountCents)}`} width={220} height={220} />}
        <label className="eyebrow" htmlFor="pix-code">
          Pix copia e cola
        </label>
        <input id="pix-code" className={`${s.code} mono`} readOnly value={payment.pixCopyPaste} onFocus={(e) => e.target.select()} />
        <Button icon={Copy} onClick={copy} block>
          COPIAR PIX
        </Button>
        <p className={s.muted} style={{ fontSize: 12 }}>
          Expira {fmtDateTime(payment.expiresAt)}. A confirmação vem do parceiro financeiro — não desta tela.
        </p>
      </div>
    </section>
  );
}

/** Carrier-side trip controls. Location is shared only after explicit consent. */
function TripPanel({ trip, role, onChange }) {
  const { run, busy } = useAction();
  const toast = useToast();
  const [sharing, setSharing] = useState(false);
  const watch = useRef(null);
  const last = useRef(0);
  const idx = TRIP_ORDER.indexOf(trip.tripStatus);

  useEffect(() => () => watch.current != null && navigator.geolocation?.clearWatch(watch.current), []);

  const toggleSharing = () => {
    if (sharing) {
      navigator.geolocation?.clearWatch(watch.current);
      watch.current = null;
      setSharing(false);
      return;
    }
    if (!navigator.geolocation) return toast.error('Geolocalização indisponível neste dispositivo.');
    watch.current = navigator.geolocation.watchPosition(
      async (pos) => {
        if (Date.now() - last.current < 30_000) return; // at most every 30s
        last.current = Date.now();
        const out = await run('RECORD_LOCATION', { matchId: trip.matchId, latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyM: pos.coords.accuracy }, { key: 'loc' });
        if (out?.result?.milestones?.length) onChange();
      },
      () => toast.error('Não foi possível obter a localização.'),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    setSharing(true);
  };

  const act = async (name, success) => {
    const out = await run(name, { matchId: trip.matchId }, { success });
    if (out) onChange();
  };

  return (
    <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="trip-title">
      <h2 id="trip-title" className={s.panelTitle} style={{ marginBottom: 12 }}>
        <Truck size={16} aria-hidden="true" /> {trip.origin} → {trip.destination}
      </h2>
      <ol className={s.tripSteps}>
        {TRIP_STEPS.map(([key, label]) => (
          <li key={key} data-done={idx >= TRIP_ORDER.indexOf(key)}>
            {label}
          </li>
        ))}
      </ol>
      {role === 'SELLER' && (
        <div className={s.txActions}>
          {!trip.trackingConsent ? (
            <Button variant="secondary" icon={MapPin} loading={busy === 'CONSENT_TRIP_TRACKING'} onClick={() => act('CONSENT_TRIP_TRACKING', 'Compartilhamento autorizado para esta viagem.')}>
              Autorizar localização nesta viagem
            </Button>
          ) : (
            <Button variant={sharing ? 'secondary' : 'primary'} icon={Navigation} onClick={toggleSharing} aria-pressed={sharing}>
              {sharing ? 'Parar de compartilhar' : 'Compartilhar localização'}
            </Button>
          )}
          {trip.tripStatus === 'NOT_STARTED' && (
            <Button variant="secondary" icon={Play} loading={busy === 'START_TRIP'} onClick={() => act('START_TRIP', 'Viagem registrada.')}>
              A caminho da coleta
            </Button>
          )}
          {['NOT_STARTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP'].includes(trip.tripStatus) && (
            <Button variant="secondary" icon={Package} loading={busy === 'MARK_CARGO_LOADED'} onClick={() => act('MARK_CARGO_LOADED', 'Carga carregada.')}>
              Carga carregada
            </Button>
          )}
        </div>
      )}
      <ul className={s.timeline} style={{ marginTop: 14 }}>
        {trip.events.map((e) => (
          <li key={e.id}>
            {TRIP_LABELS[e.type] || e.type} <time>{fmtDateTime(e.createdAt)}</time>
          </li>
        ))}
      </ul>
      <p className={s.muted} style={{ fontSize: 12, display: 'flex', gap: 6 }}>
        <ShieldCheck size={14} aria-hidden="true" /> A chegada ao destino avisa o cliente, mas nunca libera o pagamento.
        {role === 'BUYER' && ' A localização exata do motorista não é compartilhada.'}
      </p>
    </section>
  );
}

export default function TransactionDetail() {
  const { name } = useBrand();
  const { id } = useParams();
  const { stream } = useOutletContext();
  const { data, error, reload } = useApi(`/api/pay/transactions/${id}`);
  const { run, busy } = useAction();
  const [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [reply, setReply] = useState('');
  const t = data?.transaction;

  useEffect(() => {
    if (t) document.title = `${t.description} — Pagamentos`;
  }, [t]);
  useEffect(() => {
    if (['PAYMENT', 'SYSTEM'].includes(stream.latest?.type)) reload();
  }, [stream.latest, reload]);
  useVisibleInterval(reload, 5000, t?.status === 'AWAITING_PAYMENT');

  if (error) return <ErrorState title="Transação não encontrada." message={error.message} />;
  if (!t) return <SkeletonCard lines={6} />;

  const exec = async (name, input = {}) => {
    const out = await run(name, { id: t.id, ...input }, { success: SUCCESS[name] });
    if (out?.status === 'SUCCEEDED') reload();
    return out;
  };
  const openDispute = t.disputes?.find((d) => !['RESOLVED_BUYER', 'RESOLVED_SELLER', 'CANCELLED'].includes(d.status));
  const refundCents = Math.round(Number(String(refundAmount).replace(/\./g, '').replace(',', '.')) * 100) || 0;

  return (
    <>
      <Link to="/app/pay" className={s.backLink}>
        <ArrowLeft size={14} /> Pagamentos
      </Link>
      <header className={s.pageHead}>
        <div>
          <p className="eyebrow">
            {TRANSACTION_TYPE_LABELS[t.type]} · {data.role === 'BUYER' ? `fornecedor ${t.sellerName || ''}` : t.buyerCompanyName || t.buyerName || 'cliente'}
          </p>
          <h1 className={`${s.pageTitle} num`} style={{ marginTop: 6 }}>
            <BRLText>{formatCents(t.grossAmount)}</BRLText>
          </h1>
          <p className={s.pageSub}>{t.description}</p>
          {(TRANSACTION_UI_STATE[t.status] || {}).description && <p className={s.pageSub}>{TRANSACTION_UI_STATE[t.status].description}</p>}
        </div>
        <div className={s.pageActions}>
          {t.isSandbox && <DemoBadge label="SANDBOX" />}
          {t.protectedFlow && t.status !== 'PROTECTED' && <Badge tone="primary">Pagamento protegido</Badge>}
          <Badge tone={(TRANSACTION_UI_STATE[t.status] || {}).tone || 'neutral'}>{(TRANSACTION_UI_STATE[t.status] || {}).label || t.status}</Badge>
        </div>
      </header>

      <div className={s.subGrid}>
        <div className={s.stack}>
          {t.buyerConfirmedAt && ['PAID', 'READY_TO_RELEASE', 'RELEASED'].includes(t.status) && !openDispute && !t.payment?.refundedCents && (
            <section className={`${s.panel} ${s.panelPad}`}>
              <h2 className={s.panelTitle}>Serviço entregue e confirmado</h2>
              <p className={s.pageSub}>Compartilhe sua opinião e uma foto no Social. A publicação é opcional.</p>
              <Button to={`/app/social?transaction=${t.id}`} variant="secondary">Compartilhar no Social</Button>
            </section>
          )}
          <PixPanel payment={t.payment} />
          <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="values-title">
            <h2 id="values-title" className={s.panelTitle} style={{ marginBottom: 12 }}>
              Valores
            </h2>
            <dl className={s.money}>
              <div>
                <dt>Valor bruto</dt>
                <dd><BRLText>{formatCents(t.grossAmount)}</BRLText></dd>
              </div>
              {data.role !== 'BUYER' && (
                <>
                  <div>
                    <dt>Líquido do prestador</dt>
                    <dd className={s.revenue}><BRLText>{formatCents(t.sellerNetAmount)}</BRLText></dd>
                  </div>
                </>
              )}
              {t.payment?.refundedCents > 0 && (
                <div>
                  <dt>Reembolsado</dt>
                  <dd><BRLText>{formatCents(t.payment.refundedCents)}</BRLText></dd>
                </div>
              )}
              <div>
                <dt>Repasse</dt>
                <dd style={{ fontFamily: 'inherit' }}>{SETTLEMENT_STATUS_LABELS[t.settlementStatus] || t.settlementStatus}</dd>
              </div>
            </dl>
            <PartnerNote caps={data.provider} sandbox={t.isSandbox} />
          </section>
          {t.trip && <TripPanel trip={t.trip} role={data.role} onChange={reload} />}
        </div>

        <div className={s.stack}>
          <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="actions-title">
            <h2 id="actions-title" className={s.panelTitle} style={{ marginBottom: 12 }}>
              Ações
            </h2>
            {data.allowedActions.length === 0 ? (
              <p className={s.muted}>Nenhuma ação disponível neste estado.</p>
            ) : (
              <div className={s.txActions}>
                {data.allowedActions
                  .filter((a) => ACTIONS[a])
                  .map((a) => {
                    const def = ACTIONS[a];
                    return (
                      <Button key={a} variant={def.variant} icon={def.icon} loading={busy === a} onClick={() => (def.dialog ? setDialog(def.dialog) : exec(a))}>
                        {def.label}
                      </Button>
                    );
                  })}
              </div>
            )}
            <p className={s.muted} style={{ fontSize: 12, marginTop: 14, display: 'flex', gap: 6 }}>
              <ShieldCheck size={14} aria-hidden="true" /> Liberação e reembolso pedem sua senha no app. Nunca são executados por WhatsApp, GPS ou IA.
            </p>
          </section>

          {openDispute && (
            <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="dispute-title">
              <h2 id="dispute-title" className={s.panelTitle} style={{ marginBottom: 8 }}>
                Disputa em andamento
              </h2>
              <p className={s.notice}>
                <AlertTriangle size={15} aria-hidden="true" /> {openDispute.reason} — a liberação está congelada até a decisão da equipe {name}.
              </p>
              <ul className={s.timeline} style={{ marginTop: 12 }}>
                {(openDispute.metadata?.messages || []).map((m) => (
                  <li key={m.at}>
                    <strong>{m.role === 'BUYER' ? 'Cliente' : 'Prestador'}:</strong> {m.message} <time>{fmtDateTime(m.at)}</time>
                  </li>
                ))}
              </ul>
              <Field label="Sua manifestação">{(a) => <Textarea {...a} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} />}</Field>
              <div style={{ marginTop: 10 }}>
                <Button
                  variant="secondary"
                  disabled={reply.trim().length < 2}
                  loading={busy === 'RESPOND_DISPUTE'}
                  onClick={async () => {
                    const out = await run('RESPOND_DISPUTE', { id: openDispute.id, message: reply }, { success: 'Manifestação registrada.' });
                    if (out) {
                      setReply('');
                      reload();
                    }
                  }}
                >
                  Enviar
                </Button>
              </div>
            </section>
          )}

          <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="timeline-title">
            <h2 id="timeline-title" className={s.panelTitle} style={{ marginBottom: 12 }}>
              Linha do tempo
            </h2>
            <ul className={s.timeline}>
              {t.timeline.map((e) => (
                <li key={e.id} data-sev={['PAYMENT_RECEIVED', 'RELEASED', 'BUYER_CONFIRMED', 'REFUNDED'].includes(e.type) ? 'SUCCESS' : undefined}>
                  {e.title} <time>{fmtDateTime(e.createdAt)}</time>
                </li>
              ))}
            </ul>
            {t.refunds?.length > 0 && (
              <>
                <h3 className="eyebrow" style={{ margin: '8px 0' }}>
                  Reembolsos
                </h3>
                <ul className={s.timeline}>
                  {t.refunds.map((r) => (
                    <li key={r.id}>
                      <BRLText>{formatCents(r.amountCents)}</BRLText> · {{ REQUESTED: 'solicitado', PROCESSING: 'em processamento no parceiro', COMPLETED: 'concluído', FAILED: 'não realizado' }[r.status]} <time>{fmtDateTime(r.createdAt)}</time>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      </div>

      <Dialog
        open={dialog === 'dispute'}
        title="Abrir disputa"
        onClose={() => setDialog(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Voltar
            </Button>
            <Button
              variant="danger"
              disabled={reason.trim().length < 5}
              loading={busy === 'OPEN_DISPUTE'}
              onClick={async () => {
                await exec('OPEN_DISPUTE', { reason });
                setDialog(null);
              }}
            >
              Abrir disputa
            </Button>
          </>
        }
      >
        <p className={s.muted} style={{ fontSize: 13, marginBottom: 12 }}>
          A liberação fica congelada. As duas partes podem se manifestar e a decisão é sempre de uma pessoa da equipe {name}.
        </p>
        <Field label="Motivo">{(a) => <Textarea {...a} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}</Field>
      </Dialog>

      <Dialog
        open={dialog === 'refund'}
        title="Reembolsar"
        onClose={() => setDialog(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Voltar
            </Button>
            <Button
              variant="danger"
              loading={busy === 'REFUND_PAYMENT'}
              onClick={async () => {
                await exec('REFUND_PAYMENT', refundCents ? { amountCents: refundCents } : {});
                setDialog(null);
              }}
            >
              Continuar
            </Button>
          </>
        }
      >
        <Field label="Valor" optional hint={refundCents ? formatCents(refundCents) : 'Vazio = valor integral disponível'}>
          {(a) => <Input {...a} inputMode="decimal" prefix="R$" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value.replace(/[^\d.,]/g, ''))} />}
        </Field>
        <p className={s.muted} style={{ fontSize: 12, marginTop: 10 }}>
          O reembolso só aparece como concluído depois da confirmação do parceiro financeiro.
        </p>
      </Dialog>
    </>
  );
}

