import { useEffect } from 'react';
import { Navigate, useOutletContext, useParams } from 'react-router-dom';
import { Copy } from 'lucide-react';
import { PAYMENT_STATUS_LABELS, formatCents } from '@autopix/shared';
import { BRLText, Badge, Button, DemoBadge, ErrorState, SkeletonCard } from '@autopix/ui';
import { useApi, useVisibleInterval } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.jsx';
import { fmtDateTime } from '../../lib/time.js';
import { PartnerNote } from './Pay.jsx';
import s from './app.module.css';

export const STATUS_TONE = { CONFIRMED: 'revenue', PENDING: 'amber', FAILED: 'danger', EXPIRED: 'neutral', REFUNDED: 'info', CANCELED: 'neutral' };

/**
 * Single payment (subscription or legacy link). TemPix Pay charges live on
 * their transaction page, where every money action is available.
 */
export default function PaymentDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { stream } = useOutletContext();
  const { data, error, reload } = useApi(`/api/payments/${id}`);
  const p = data?.payment;

  useEffect(() => {
    if (p) document.title = `${p.reference || 'Pagamento'} — TemPix`;
  }, [p]);
  useEffect(() => {
    if (stream.latest?.type === 'PAYMENT') reload();
  }, [stream.latest, reload]);
  useVisibleInterval(reload, 5000, p?.status === 'PENDING');

  if (error) return <ErrorState title="Pagamento não encontrado." message={error.message} />;
  if (!p) return <SkeletonCard lines={5} />;
  if (p.transactionId) return <Navigate to={`/app/pay/transactions/${p.transactionId}`} replace />;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(p.pixCopyPaste);
      toast.success('Código Pix copiado.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  };

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <p className="eyebrow">{p.kind === 'SUBSCRIPTION' ? 'Assinatura' : `Cobrança ${p.reference || ''}`}</p>
          <h1 className={`${s.pageTitle} num`} style={{ marginTop: 6 }}>
            <BRLText>{formatCents(p.amountCents)}</BRLText>
          </h1>
          <p className={s.pageSub}>{p.description}</p>
        </div>
        <div className={s.pageActions}>
          {p.isSandbox && <DemoBadge label="SANDBOX" />}
          <Badge tone={STATUS_TONE[p.status]}>{PAYMENT_STATUS_LABELS[p.status]}</Badge>
        </div>
      </header>
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
              Expira {fmtDateTime(p.expiresAt)}.
            </p>
          </div>
        ) : (
          <dl className={s.kv}>
            <div>
              <dt>Pago em</dt>
              <dd>{fmtDateTime(p.paidAt)}</dd>
            </div>
            <div>
              <dt>Reembolsado</dt>
              <dd>{p.refundedCents ? <BRLText>{formatCents(p.refundedCents)}</BRLText> : '—'}</dd>
            </div>
            <div>
              <dt>Criado em</dt>
              <dd>{fmtDateTime(p.createdAt)}</dd>
            </div>
          </dl>
        )}
        <PartnerNote sandbox={false} />
      </section>
    </>
  );
}
