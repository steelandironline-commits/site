import { useEffect, useState } from 'react';
import { AlertTriangle, Check, QrCode, ShieldCheck } from 'lucide-react';
import { COMMISSION_PLAN_CODE, PLAN, PRICING, SUBSCRIPTION_STATUS_LABELS, formatCents } from '@autopix/shared';
import { executeAction } from '../../lib/actions.js';
import { BRLText, Badge, Button, Dialog, EmptyState, ErrorState, SkeletonCard, useApi, useSession } from '@autopix/ui';
import { useToast } from '../../lib/toast.jsx';
import { fmtDate } from '../../lib/time.js';
import { PaymentCard } from '../../components/cards/Cards.jsx';
import s from './app.module.css';

const TONE = { ACTIVE: 'primary', PENDING: 'amber', PAST_DUE: 'amber', CANCELED: 'danger', EXPIRED: 'neutral' };

/**
 * Plano. `features` é a lista do que a conta recebe e `gold` o destaque do cartão; cada entrada passa os
 * seus (a tela não sabe se a conta é de empresa ou de pessoa).
 */
export default function Subscription({ features, gold = false }) {
  const toast = useToast();
  const { refresh } = useSession();
  const sub = useApi('/api/subscription');
  const payments = useApi('/api/payments');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Plano — TemPix';
  }, []);

  const act = async (action, message) => {
    setBusy(true);
    try {
      const { result } = await executeAction(action);
      sub.setData(result);
      toast.success(message);
      setConfirm(false);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const data = sub.data?.subscription;
  if (data?.plan === COMMISSION_PLAN_CODE) return <CommissionPlan features={features} gold={gold} />;

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Assinatura</h1>
          <p className={s.pageSub}>Plano único, pago via Pix. Sem fidelidade.</p>
        </div>
      </header>

      {sub.error ? (
        <ErrorState title="Não foi possível carregar a assinatura." message={sub.error.message} onRetry={sub.reload} />
      ) : !sub.data ? (
        <SkeletonCard lines={5} />
      ) : (
        <div className={s.subGrid}>
          <section className={s.planCard} aria-labelledby="plan">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h2 id="plan" className="mono" style={{ letterSpacing: '0.2em', fontSize: 16 }}>
                TEMPIX
              </h2>
              {data && (
                <Badge tone={TONE[data.status]} dot pulse={data.status === 'ACTIVE'}>
                  {SUBSCRIPTION_STATUS_LABELS[data.status]}
                </Badge>
              )}
            </div>
            <p className={`${s.planPrice} num`}>
              <BRLText>{formatCents(data?.priceCents ?? PLAN.priceCents)}</BRLText> <span>/mês</span>
            </p>
            <dl className={s.kv} style={{ marginTop: 18 }}>
              <div>
                <dt>Período atual</dt>
                <dd>{data?.currentPeriodStart ? `${fmtDate(data.currentPeriodStart)} – ${fmtDate(data.currentPeriodEnd)}` : '—'}</dd>
              </div>
              <div>
                <dt>Dias restantes</dt>
                <dd className="num">{data?.daysLeft ?? '—'}</dd>
              </div>
              <div>
                <dt>Ativa desde</dt>
                <dd>{fmtDate(data?.activatedAt)}</dd>
              </div>
              <div>
                <dt>Pagamento</dt>
                <dd>Pix · {data?.provider}</dd>
              </div>
            </dl>

            {data?.cancelAtPeriodEnd && (
              <div className={s.notice} style={{ marginTop: 16 }}>
                <AlertTriangle size={15} aria-hidden="true" />
                <span>Cancelamento agendado. Seu TemPix continua ativo até {fmtDate(data.currentPeriodEnd)}.</span>
              </div>
            )}
            {data && ['PAST_DUE', 'CANCELED', 'EXPIRED'].includes(data.status) && (
              <div className={s.notice} style={{ marginTop: 16 }}>
                <AlertTriangle size={15} aria-hidden="true" />
                <span>Seus agentes estão pausados. Pague um novo Pix para retomar as buscas.</span>
              </div>
            )}

            <ul className={s.reasons} style={{ marginTop: 18 }}>
              {PLAN.features.slice(0, 5).map((f) => (
                <li key={f}>
                  <Check size={14} aria-hidden="true" /> {f}
                </li>
              ))}
            </ul>

            <div className={s.pageActions} style={{ marginTop: 22 }}>
              {data?.canRenew && (
                <Button to="/checkout" icon={QrCode}>
                  {data.status === 'ACTIVE' ? 'Renovar com Pix' : 'Reativar com Pix'}
                </Button>
              )}
              {data?.status === 'ACTIVE' && !data.cancelAtPeriodEnd && (
                <Button variant="danger" onClick={() => setConfirm(true)}>
                  Cancelar assinatura
                </Button>
              )}
              {data?.status === 'ACTIVE' && data.cancelAtPeriodEnd && (
                <Button variant="secondary" loading={busy} onClick={() => act('RESUME_SUBSCRIPTION', 'Cancelamento revertido.')}>
                  Manter assinatura
                </Button>
              )}
            </div>
          </section>

          <section aria-labelledby="hist">
            <div className={s.sectionHead}>
              <h2 id="hist" className="eyebrow">
                Histórico de pagamentos
              </h2>
            </div>
            {payments.error ? (
              <ErrorState compact title="Não foi possível carregar os pagamentos." message={payments.error.message} onRetry={payments.reload} />
            ) : !payments.data ? (
              <SkeletonCard lines={2} />
            ) : payments.data.items.length === 0 ? (
              <EmptyState title="Nenhum pagamento" />
            ) : (
              <div className={s.list}>
                {payments.data.items.map((p) => (
                  <PaymentCard key={p.id} payment={p} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <Dialog
        open={confirm}
        title="Cancelar assinatura?"
        onClose={() => setConfirm(false)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Voltar
            </Button>
            <Button variant="danger" loading={busy} onClick={() => act('CANCEL_SUBSCRIPTION', 'Cancelamento agendado.')}>
              Confirmar cancelamento
            </Button>
          </>
        }
      >
        Seu TemPix continua ativo até {fmtDate(data?.currentPeriodEnd)}. Depois disso, os agentes são pausados e nenhuma nova cobrança é gerada.
      </Dialog>
    </>
  );
}

/** TemPix has no subscription: signup is free and the fee is a share of each contract. */
function CommissionPlan({ features, gold }) {
  const fee = PRICING.commissionLabel;
  return (
    <>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Plano</h1>
          <p className={s.pageSub}>Sem mensalidade. Você só paga quando fecha negócio.</p>
        </div>
      </header>
      <div className={s.subGrid}>
        <section className={`${s.planCard} ${gold ? `${s.planGold} gold-icons` : ''}`} aria-labelledby="plan">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <h2 id="plan" className="mono" style={{ letterSpacing: '0.2em', fontSize: 16 }}>
              TEMPIX
            </h2>
            <Badge tone="primary" dot pulse>
              Ativo
            </Badge>
          </div>
          <p className={`${s.planPrice} num`}>
            {fee}
            <span> por contrato fechado</span>
          </p>
          <p className={s.pageSub}>
            Taxa fixa sobre o valor de cada contrato entre as partes: cargas, rotas, obras, serviços e vagas. Cadastro e uso do painel não
            têm mensalidade.
          </p>
          <ul className={s.reasons} style={{ marginTop: 18 }}>
            {features.map((f) => (
              <li key={f}>
                <Check size={14} aria-hidden="true" /> {f}
              </li>
            ))}
          </ul>
        </section>
        <section className={s.planCard} aria-labelledby="assured">
          <h2 id="assured" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
            <ShieldCheck size={18} aria-hidden="true" /> Pagamento assegurado até a conclusão
          </h2>
          <p className={s.pageSub}>
            Em obras, serviços, rotas e transportes, o valor do contrato fica protegido na instituição de pagamento parceira e só é liberado
            quando a conclusão é confirmada. Chegada por GPS ou mensagem de WhatsApp sozinhas não liberam dinheiro.
          </p>
          <p className={s.pageSub}>
            <BRLText>Exemplo: contrato de R$ 10.000,00 → taxa TemPix de R$ 500,00 ({fee}) e R$ 9.500,00 para quem executou.</BRLText>
          </p>
        </section>
      </div>
    </>
  );
}
