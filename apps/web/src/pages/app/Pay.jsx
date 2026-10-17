import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { ArrowRight, Clock, Hourglass, Landmark, Plus, QrCode, ShieldCheck, Wallet } from 'lucide-react';
import { SETTLEMENT_STATUS_LABELS, TRANSACTION_TYPE_LABELS, TRANSACTION_UI_STATE, formatCents } from '@autopix/shared';
import { useApi } from '../../lib/hooks.js';
import { useAction } from '../../lib/actions.js';
import { api } from '../../lib/api.js';
import { fmtDateTime } from '../../lib/time.js';
import { BRLText } from '../../components/brand/BRLIcon.jsx';
import { LogoMark } from '../../components/brand/Logo.jsx';
import { MetricCard } from '../../components/cards/Cards.jsx';
import { Badge, Button, DemoBadge, EmptyState, ErrorState, Field, Input, Select, SkeletonCard } from '../../components/ui/ui.jsx';
import s from './app.module.css';

const TABS = [
  ['all', 'Visão Geral'],
  ['charges', 'Cobranças'],
  ['payments', 'Pagamentos'],
  ['receivable', 'A Receber'],
  ['toRelease', 'A Liberar'],
  ['history', 'Histórico'],
  ['settings', 'Configurações'],
];

const parseMoney = (v) => Math.round(Number(String(v).replace(/\./g, '').replace(',', '.')) * 100) || 0;

/** Partner/sandbox strip shown on every Pagamentos screen. */
export function PartnerNote({ caps, sandbox }) {
  const disabled = caps?.provider === 'none';
  return (
    <p className={s.payNote}>
      <ShieldCheck size={14} aria-hidden="true" />
      <span>
        {disabled
          ? 'Pagamentos temporariamente indisponíveis. Nenhuma cobrança será criada até o gateway ser reativado.'
          : `Pagamentos processados por instituições financeiras parceiras.${caps?.label ? ` Processado pelo parceiro financeiro: ${caps.label}.` : ''}`}
      </span>
      {sandbox && <DemoBadge label="SANDBOX" />}
    </p>
  );
}

function NewCharge({ onCreated, reference, caps }) {
  const { run, busy } = useAction();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [type, setType] = useState('SERVICE');
  const [quote, setQuote] = useState(null);
  const fixedByReference = reference?.referenceType === 'freightMatch';
  const cents = parseMoney(amount);

  // Live commission preview (server-side rule; display only).
  useEffect(() => {
    if (fixedByReference || cents < 100) return setQuote(null);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api(`/api/pay/commission/quote?grossCents=${cents}&type=${type}`, { signal: ctrl.signal })
        .then((d) => setQuote(d.quote))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [cents, type, fixedByReference]);

  const submit = async (e) => {
    e.preventDefault();
    const created = await run(
      'CREATE_TRANSACTION',
      {
        ...(fixedByReference ? reference : { type, grossCents: cents }),
        description: description || null,
        buyerEmail: buyerEmail || null,
        buyerName: buyerName || null,
      },
      { key: 'create' },
    );
    const t = created?.result?.transaction;
    if (!t) return;
    await run('CREATE_TRANSACTION_PIX', { id: t.id }, { success: 'Cobrança TemPix criada.', key: 'create' });
    onCreated(t);
  };

  return (
    <form className={`${s.panel} ${s.panelPad}`} onSubmit={submit} noValidate>
      <h2 className={s.panelTitle} style={{ marginBottom: 14 }}>
        Nova cobrança
      </h2>
      <div className={s.formGrid}>
        {fixedByReference ? (
          <p className={s.notice}>Valor definido pelo frete aceito — calculado no servidor.</p>
        ) : (
          <>
            <Field label="Tipo">
              {(a) => (
                <Select {...a} value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="SERVICE">Serviço</option>
                  <option value="SALES">Venda</option>
                  <option value="WORKFORCE">Mão de obra</option>
                </Select>
              )}
            </Field>
            <Field label="Valor" hint={cents ? formatCents(cents) : 'Ex.: 1400 ou 1.400,50'}>
              {(a) => <Input {...a} inputMode="decimal" prefix="R$" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} />}
            </Field>
          </>
        )}
        <Field label="Descrição" optional>
          {(a) => <Input {...a} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={140} />}
        </Field>
        <Field label="E-mail do cliente" optional hint={caps?.protectedPayment?.enabled ? 'Cliente cadastrado no TemPix habilita o pagamento protegido.' : 'O cliente acompanha a cobrança se tiver conta no TemPix.'}>
          {(a) => <Input {...a} type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} maxLength={254} />}
        </Field>
        <Field label="Nome do cliente" optional>
          {(a) => <Input {...a} value={buyerName} onChange={(e) => setBuyerName(e.target.value)} maxLength={120} />}
        </Field>
      </div>
      {quote && (
        <dl className={s.money} style={{ marginTop: 14 }} aria-live="polite">
          <div>
            <dt>Valor bruto</dt>
            <dd className="num"><BRLText>{formatCents(quote.grossCents)}</BRLText></dd>
          </div>
          <div>
            <dt>Você recebe</dt>
            <dd className={`num ${s.revenue}`}><BRLText>{formatCents(quote.sellerNetCents)}</BRLText></dd>
          </div>
        </dl>
      )}
      <div style={{ marginTop: 14 }}>
        <Button type="submit" icon={QrCode} loading={busy === 'create'} disabled={!fixedByReference && cents < 100}>
          Gerar cobrança Pix
        </Button>
      </div>
    </form>
  );
}

function TxRow({ t }) {
  return (
    <Link to={`/app/pay/transactions/${t.id}`} className={s.rowLink}>
      <span className={s.rowIcon} aria-hidden="true">
        {t.role === 'BUYER' ? <Wallet size={16} /> : <QrCode size={16} />}
      </span>
      <span className={s.rowMain}>
        <strong className="num"><BRLText>{formatCents(t.grossAmount)}</BRLText></strong>
        <span>
          {TRANSACTION_TYPE_LABELS[t.type]} · {t.description} · {t.role === 'BUYER' ? 'você paga' : t.buyerName || 'cliente'} · {fmtDateTime(t.createdAt)}
        </span>
      </span>
      <span className={s.rowBadges}>
        {t.isSandbox && <DemoBadge label="SANDBOX" />}
        <Badge tone={(TRANSACTION_UI_STATE[t.status] || {}).tone || 'neutral'}>{(TRANSACTION_UI_STATE[t.status] || {}).label || t.status}</Badge>
      </span>
    </Link>
  );
}

function PaySettings({ caps }) {
  const { run, busy } = useAction();
  const [pixKey, setPixKey] = useState('');
  const [pixKeyType, setPixKeyType] = useState('CNPJ');
  if (!caps) return <SkeletonCard lines={4} />;
  const LABELS = { pix: 'Cobrança Pix', pixWebhook: 'Confirmação automática (webhook)', paymentStatus: 'Consulta de status', refund: 'Reembolso', partialRefund: 'Reembolso parcial', split: 'Divisão (split)', payout: 'Repasse ao prestador', bbPayRedirect: 'BB Pay (checkout do banco)', recurringPix: 'Pix Automático', protectedFlow: 'Pagamento protegido' };
  return (
    <div className={s.subGrid}>
      <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="caps-title">
        <h2 id="caps-title" className={s.panelTitle} style={{ marginBottom: 12 }}>
          Parceiro financeiro: {caps.label}
        </h2>
        <ul className={s.capList}>
          {Object.entries(LABELS).map(([k, label]) => (
            <li key={k}>
              <Badge tone={caps.capabilities[k] ? 'revenue' : 'neutral'} dot>
                {caps.capabilities[k] ? 'Ativo' : 'Indisponível'}
              </Badge>
              <span>
                <strong>{label}</strong>
                {!caps.capabilities[k] && caps.reasons?.[k] && <small>{caps.reasons[k]}</small>}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <form
        className={`${s.panel} ${s.panelPad}`}
        onSubmit={(e) => {
          e.preventDefault();
          run('CHANGE_BANK_DETAILS', { pixKey, pixKeyType });
        }}
      >
        <h2 className={s.panelTitle} style={{ marginBottom: 12 }}>
          Chave Pix de recebimento
        </h2>
        <p className={s.muted} style={{ fontSize: 13, marginBottom: 14 }}>
          Usada apenas quando o parceiro financeiro executa repasses. A alteração pede sua senha.
        </p>
        <div className={s.formGrid}>
          <Field label="Tipo">
            {(a) => (
              <Select {...a} value={pixKeyType} onChange={(e) => setPixKeyType(e.target.value)}>
                {['CNPJ', 'CPF', 'EMAIL', 'PHONE', 'EVP'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Chave">{(a) => <Input {...a} value={pixKey} onChange={(e) => setPixKey(e.target.value)} maxLength={140} />}</Field>
        </div>
        <div style={{ marginTop: 14 }}>
          <Button type="submit" variant="secondary" icon={Landmark} loading={busy === 'CHANGE_BANK_DETAILS'} disabled={pixKey.trim().length < 5}>
            Alterar chave
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function Pay() {
  const navigate = useNavigate();
  const { stream } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'all';
  const reference = params.get('referenceType') ? { referenceType: params.get('referenceType'), referenceId: params.get('referenceId') } : null;
  const [showNew, setShowNew] = useState(params.get('new') === '1');
  const summary = useApi('/api/pay/summary');
  const caps = useApi('/api/pay/capabilities');
  const list = useApi(tab === 'settings' ? null : `/api/pay/transactions?view=${tab}`);

  useEffect(() => {
    document.title = 'Pagamentos — TemPix';
  }, []);
  useEffect(() => {
    if (stream.latest?.type === 'PAYMENT') {
      summary.reload();
      list.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.latest]);

  const m = summary.data?.summary;
  const items = list.data?.items;
  const emptyText = useMemo(
    () =>
      ({
        payments: 'Nenhuma cobrança recebida de fornecedores.',
        toRelease: 'Nada aguardando liberação.',
        history: 'Sem histórico ainda.',
      })[tab] || 'Crie uma cobrança aqui ou pelo WhatsApp: “gere um Pix de 1400”.',
    [tab],
  );

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitleBrand}>
            <LogoMark size={26} /> Pagamentos
          </h1>
          <p className={s.pageSub}>Cobranças, recebimentos e pagamentos dos seus negócios.</p>
        </div>
        <Button icon={Plus} onClick={() => setShowNew((v) => !v)} aria-expanded={showNew}>
          Nova cobrança
        </Button>
      </header>

      <div className={s.metrics}>
        <MetricCard index={0} label="Recebido" value={m?.receivedCents ?? 0} format={formatCents} loading={!m} icon={Wallet} tone="revenue" />
        <MetricCard index={1} label="A liberar" value={m?.toReleaseCents ?? 0} format={formatCents} loading={!m} icon={Hourglass} tone="primary" />
        <MetricCard index={2} label="Em processamento" value={m?.processingCents ?? 0} format={formatCents} loading={!m} icon={Clock} />
      </div>
      <PartnerNote caps={caps.data} sandbox={summary.data?.sandbox} />

      {showNew && (
        <div className={s.section}>
          <NewCharge reference={reference} caps={caps.data} onCreated={(t) => navigate(`/app/pay/transactions/${t.id}`)} />
        </div>
      )}

      <nav className={`${s.filters} ${s.section}`} aria-label="Seções de Pagamentos">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" className={`${s.chip} ${tab === k ? s.chipActive : ''}`} aria-pressed={tab === k} onClick={() => setParams(k === 'all' ? {} : { tab: k })}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'settings' ? (
        <PaySettings caps={caps.data} />
      ) : list.error ? (
        <ErrorState title="Não foi possível carregar." message={list.error.message} onRetry={list.reload} />
      ) : !items ? (
        <SkeletonCard lines={3} />
      ) : items.length === 0 ? (
        <EmptyState title="Nada por aqui" message={emptyText} />
      ) : (
        <div className={s.list}>
          {items.map((t) => (
            <TxRow key={t.id} t={t} />
          ))}
        </div>
      )}
      {tab === 'all' && items?.length > 0 && (
        <p className={s.muted} style={{ fontSize: 12, marginTop: 12 }}>
          Repasse sem split/payout do parceiro: “{SETTLEMENT_STATUS_LABELS.PENDING_PROVIDER_CAPABILITY}”. <Link to="/app/pay?tab=settings">Ver capacidades <ArrowRight size={12} /></Link>
        </p>
      )}
    </>
  );
}

