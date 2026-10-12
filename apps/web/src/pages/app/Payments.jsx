import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, QrCode } from 'lucide-react';
import { PAYMENT_STATUS_LABELS, PROTECTION_STATUS_LABELS, formatCents, onlyDigits } from '@autopix/shared';
import { useApi } from '../../lib/hooks.js';
import { useAction } from '../../lib/actions.js';
import { fmtDateTime } from '../../lib/time.js';
import { Badge, Button, EmptyState, ErrorState, Field, Input, SkeletonCard } from '../../components/ui/ui.jsx';
import s from './app.module.css';

export const PROTECTION_TONE = { NONE: 'neutral', HELD: 'primary', RELEASE_REQUESTED: 'amber', RELEASED: 'revenue', DISPUTED: 'danger', REFUNDED: 'neutral' };
export const STATUS_TONE = { CONFIRMED: 'revenue', PENDING: 'amber', FAILED: 'danger', EXPIRED: 'neutral', REFUNDED: 'info', CANCELED: 'neutral' };

function NewPix({ onCreated, related }) {
  const { run, busy } = useAction();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [payerName, setPayerName] = useState('');
  const [payerDocument, setPayerDocument] = useState('');
  const cents = Math.round(Number(String(amount).replace(/\./g, '').replace(',', '.')) * 100) || 0;

  const submit = async (e) => {
    e.preventDefault();
    const out = await run(
      'CREATE_PIX',
      {
        amountCents: cents,
        description: description || null,
        payerName: payerName || null,
        payerDocument: payerDocument ? onlyDigits(payerDocument) : null,
        ...(related || {}),
      },
      { success: 'Pix gerado.' },
    );
    if (out?.result?.payment) onCreated(out.result.payment);
  };

  return (
    <form className={`${s.panel} ${s.panelPad}`} onSubmit={submit} noValidate>
      <h2 className={s.panelTitle} style={{ marginBottom: 14 }}>
        Gerar cobrança Pix
      </h2>
      <div className={s.formGrid}>
        <Field label="Valor" hint={cents ? formatCents(cents) : 'Ex.: 1400 ou 1.400,50'}>
          {(a) => <Input {...a} inputMode="decimal" prefix="R$" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} />}
        </Field>
        <Field label="Descrição" optional>
          {(a) => <Input {...a} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={140} />}
        </Field>
        <Field label="Nome do pagador" optional>
          {(a) => <Input {...a} value={payerName} onChange={(e) => setPayerName(e.target.value)} maxLength={120} />}
        </Field>
        <Field label="CPF/CNPJ do pagador" optional>
          {(a) => <Input {...a} inputMode="numeric" value={payerDocument} onChange={(e) => setPayerDocument(e.target.value)} maxLength={20} />}
        </Field>
      </div>
      <p className={s.muted} style={{ fontSize: 12, marginTop: 12 }}>
        O valor fica protegido após o pagamento e é liberado para sua chave Pix somente com confirmação de segurança.
      </p>
      <div style={{ marginTop: 14 }}>
        <Button type="submit" icon={QrCode} loading={busy === 'CREATE_PIX'} disabled={cents < 100}>
          Gerar Pix
        </Button>
      </div>
    </form>
  );
}

export default function Payments() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [showNew, setShowNew] = useState(params.get('new') === '1');
  const { data, error, reload } = useApi('/api/payments?kind=CHARGE');
  const related = params.get('relatedType') ? { relatedType: params.get('relatedType'), relatedId: params.get('relatedId') } : null;

  useEffect(() => {
    document.title = 'Pagamentos — AutoPix';
  }, []);

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Pagamentos</h1>
          <p className={s.pageSub}>Cobranças Pix protegidas. A assinatura fica em Assinatura.</p>
        </div>
        <Button icon={Plus} onClick={() => setShowNew((v) => !v)} aria-expanded={showNew}>
          Novo Pix
        </Button>
      </header>

      {showNew && (
        <div style={{ marginBottom: 16 }}>
          <NewPix related={related} onCreated={(p) => navigate(`/app/payments/${p.id}`)} />
        </div>
      )}

      {error ? (
        <ErrorState title="Não foi possível carregar os pagamentos." message={error.message} onRetry={reload} />
      ) : !data ? (
        <SkeletonCard lines={3} />
      ) : data.items.length === 0 ? (
        <EmptyState title="Nenhuma cobrança ainda" message="Gere um Pix aqui ou pelo WhatsApp: “gere um Pix de 1400”." />
      ) : (
        <div className={s.list}>
          {data.items.map((p) => (
            <Link key={p.id} to={`/app/payments/${p.id}`} className={s.rowLink}>
              <span className={s.rowIcon} aria-hidden="true">
                <QrCode size={16} />
              </span>
              <span className={s.rowMain}>
                <strong className="num">{formatCents(p.amountCents)}</strong>
                <span>
                  {p.reference} · {p.description || 'Cobrança'} · {fmtDateTime(p.createdAt)}
                </span>
              </span>
              <span className={s.rowBadges}>
                <Badge tone={STATUS_TONE[p.status]}>{PAYMENT_STATUS_LABELS[p.status]}</Badge>
                {p.protectionStatus !== 'NONE' && <Badge tone={PROTECTION_TONE[p.protectionStatus]}>{PROTECTION_STATUS_LABELS[p.protectionStatus]}</Badge>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
