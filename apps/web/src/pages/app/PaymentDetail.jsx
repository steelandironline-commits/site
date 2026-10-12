import { useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { AlertTriangle, Check, Copy, ShieldCheck, Undo2, Unlock } from 'lucide-react';
import { PAYMENT_STATUS_LABELS, PROTECTION_STATUS_LABELS, formatCents } from '@autopix/shared';
import { useApi, useVisibleInterval } from '../../lib/hooks.js';
import { useAction } from '../../lib/actions.js';
import { useToast } from '../../lib/toast.jsx';
import { fmtDateTime } from '../../lib/time.js';
import { Badge, Button, Dialog, ErrorState, Field, SkeletonCard, Textarea } from '../../components/ui/ui.jsx';
import { PROTECTION_TONE, STATUS_TONE } from './Payments.jsx';
import s from './app.module.css';

export default function PaymentDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { stream } = useOutletContext();
  const { data, error, reload, setData } = useApi(`/api/payments/${id}`);
  const { run, busy } = useAction();
  const [dispute, setDispute] = useState(false);
  const [reason, setReason] = useState('');
  const p = data?.payment;

  useEffect(() => {
    if (p) document.title = `${p.reference || 'Pagamento'} — AutoPix`;
  }, [p]);
  // Live: refresh when a payment event arrives; poll while pending.
  useEffect(() => {
    if (stream.latest?.type === 'PAYMENT') reload();
  }, [stream.latest, reload]);
  useVisibleInterval(reload, 5000, p?.status === 'PENDING');

  const act = async (action, input, success) => {
    const out = await run(action, { id, ...input }, { success });
    if (out?.status === 'SUCCEEDED' && out.result.payment) setData({ payment: out.result.payment });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(p.pixCopyPaste);
      toast.success('Código Pix copiado.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  };

  if (error) return <ErrorState title="Pagamento não encontrado." message={error.message} />;
  if (!p) return <SkeletonCard lines={5} />;
  const held = ['HELD', 'RELEASE_REQUESTED'].includes(p.protectionStatus);

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <p className="eyebrow">{p.kind === 'SUBSCRIPTION' ? 'Assinatura' : `Cobrança ${p.reference || ''}`}</p>
          <h1 className={`${s.pageTitle} num`} style={{ marginTop: 6 }}>
            {formatCents(p.amountCents)}
          </h1>
          <p className={s.pageSub}>{p.description}</p>
        </div>
        <div className={s.pageActions}>
          <Badge tone={STATUS_TONE[p.status]}>{PAYMENT_STATUS_LABELS[p.status]}</Badge>
          {p.protectionStatus !== 'NONE' && <Badge tone={PROTECTION_TONE[p.protectionStatus]}>{PROTECTION_STATUS_LABELS[p.protectionStatus]}</Badge>}
        </div>
      </header>

      <div className={s.subGrid}>
        <section className={`${s.panel} ${s.panelPad}`}>
          {p.status === 'PENDING' && p.pixCopyPaste ? (
            <div className={s.pixBox}>
              {p.pixQrCodeBase64 && <img src={`data:image/png;base64,${p.pixQrCodeBase64}`} alt={`QR Code Pix de ${formatCents(p.amountCents)}`} width={220} height={220} />}
              <label className="eyebrow" htmlFor="pix-code">
                Pix copia e cola
              </label>
              <input id="pix-code" className={`${s.code} mono`} readOnly value={p.pixCopyPaste} onFocus={(e) => e.target.select()} />
              <Button icon={Copy} onClick={copy} block>
                COPIAR PIX
              </Button>
              <p className={s.muted} style={{ fontSize: 12 }}>
                Expira {fmtDateTime(p.expiresAt)} · envie este código ao pagador.
              </p>
            </div>
          ) : (
            <dl className={s.kv}>
              <div>
                <dt>Pago em</dt>
                <dd>{fmtDateTime(p.paidAt)}</dd>
              </div>
              <div>
                <dt>Proteção</dt>
                <dd>{PROTECTION_STATUS_LABELS[p.protectionStatus]}</dd>
              </div>
              <div>
                <dt>Liberado em</dt>
                <dd>{fmtDateTime(p.releasedAt)}</dd>
              </div>
              <div>
                <dt>Provedor</dt>
                <dd>{p.provider}</dd>
              </div>
            </dl>
          )}
          {p.disputeReason && (
            <p className={s.notice} style={{ marginTop: 14 }}>
              <AlertTriangle size={15} aria-hidden="true" /> Disputa: {p.disputeReason}
            </p>
          )}
        </section>

        {p.kind === 'CHARGE' && (
          <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="actions-title">
            <h2 id="actions-title" className={s.panelTitle} style={{ marginBottom: 12 }}>
              Ações
            </h2>
            <div className={s.stack}>
              {p.protectionStatus === 'HELD' && (
                <Button variant="secondary" icon={Check} loading={busy === 'REQUEST_PAYMENT_RELEASE'} onClick={() => act('REQUEST_PAYMENT_RELEASE', {}, 'Liberação solicitada.')}>
                  Serviço concluído — solicitar liberação
                </Button>
              )}
              {held && (
                <Button icon={Unlock} loading={busy === 'RELEASE_PAYMENT'} onClick={() => act('RELEASE_PAYMENT', {}, 'Pagamento liberado.')}>
                  Liberar para minha chave Pix
                </Button>
              )}
              {held && (
                <Button variant="ghost" icon={AlertTriangle} onClick={() => setDispute(true)}>
                  Abrir disputa
                </Button>
              )}
              {p.status === 'CONFIRMED' && ['HELD', 'RELEASE_REQUESTED', 'DISPUTED'].includes(p.protectionStatus) && (
                <Button variant="danger" icon={Undo2} loading={busy === 'REFUND_PAYMENT'} onClick={() => act('REFUND_PAYMENT', {}, 'Estorno solicitado.')}>
                  Estornar
                </Button>
              )}
              {!held && p.status !== 'CONFIRMED' && <p className={s.muted}>Nenhuma ação disponível neste estado.</p>}
            </div>
            <p className={s.muted} style={{ fontSize: 12, marginTop: 14, display: 'flex', gap: 6 }}>
              <ShieldCheck size={14} aria-hidden="true" /> Liberação e estorno pedem sua senha nesta tela — nunca são feitos só por WhatsApp.
            </p>
          </section>
        )}
      </div>

      <Dialog
        open={dispute}
        title="Abrir disputa"
        onClose={() => setDispute(false)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDispute(false)}>
              Voltar
            </Button>
            <Button
              variant="danger"
              disabled={reason.trim().length < 5}
              loading={busy === 'OPEN_DISPUTE'}
              onClick={async () => {
                await act('OPEN_DISPUTE', { reason }, 'Disputa aberta.');
                setDispute(false);
              }}
            >
              Abrir disputa
            </Button>
          </>
        }
      >
        <Field label="Motivo">{(a) => <Textarea {...a} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}</Field>
      </Dialog>
    </>
  );
}
