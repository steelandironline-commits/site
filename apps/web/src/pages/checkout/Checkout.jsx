import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, Clock, Copy, FlaskConical, Lock, QrCode, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import { PLAN, PRICING, formatCents } from '@autopix/shared';
import { api, post } from '../../lib/api.js';
import { useSession } from '../../lib/session.jsx';
import { useVisibleInterval } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.jsx';
import { Logo, LogoMark } from '../../components/brand/Logo.jsx';
import { Button, DemoBadge, ErrorState, Skeleton } from '../../components/ui/ui.jsx';
import s from './checkout.module.css';

const ease = [0.22, 1, 0.36, 1];

function useCountdown(target) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!target) return null;
  const ms = Math.max(0, new Date(target).getTime() - now);
  const m = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return { ms, label: `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export default function Checkout() {
  const navigate = useNavigate();
  const toast = useToast();
  const { me, config, loading: sessionLoading, refresh } = useSession();
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [phase, setPhase] = useState('pending'); // pending | confirmed | activating | email-sent
  const [simulating, setSimulating] = useState(false);
  const activating = useRef(false);
  const countdown = useCountdown(payment?.expiresAt);
  const isRenewal = me?.scope === 'FULL';

  useEffect(() => {
    document.title = 'Pagamento Pix — TemPix';
  }, []);

  const createCharge = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const { payment: p } = await post('/api/payments/pix');
      setPayment(p);
      setPhase(p.status === 'CONFIRMED' ? 'confirmed' : 'pending');
    } catch (err) {
      if (err.status === 409 && isRenewal) {
        toast.info(err.message);
        navigate('/app/subscription', { replace: true });
        return;
      }
      setError(err);
    } finally {
      setCreating(false);
    }
  }, [isRenewal, navigate, toast]);

  // Entry: require an onboarding (or full) session; resume an existing charge.
  useEffect(() => {
    if (sessionLoading) return;
    if (!me) {
      navigate('/onboarding', { replace: true });
      return;
    }
    (async () => {
      try {
        const st = me.scope === 'ONBOARDING' ? await api('/api/onboarding') : null;
        if (st && !st.company.onboardingCompletedAt) {
          navigate('/onboarding', { replace: true });
          return;
        }
        if (st?.latestPayment?.status === 'CONFIRMED') {
          const { payment: p } = await api(`/api/payments/${st.latestPayment.id}`);
          setPayment(p);
          setPhase('confirmed');
          return;
        }
      } catch (err) {
        setError(err);
        return;
      }
      // No payment provider configured: say so instead of failing a charge.
      if (config?.paymentProvider === 'none') return;
      createCharge();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading]);

  // Poll the payment state (webhook → DB). Pauses when the tab is hidden.
  useVisibleInterval(
    async () => {
      if (!payment) return;
      try {
        const { payment: p } = await api(`/api/payments/${payment.id}`);
        setPayment(p);
        if (p.status === 'CONFIRMED') setPhase((ph) => (ph === 'pending' ? 'confirmed' : ph));
      } catch {
        /* transient: keep polling */
      }
    },
    3000,
    Boolean(payment) && payment?.status === 'PENDING',
  );

  // After confirmation: hand off to activation.
  useEffect(() => {
    if (phase !== 'confirmed' || activating.current || !payment) return undefined;
    activating.current = true;
    const t = setTimeout(async () => {
      setPhase('activating');
      try {
        const res = await post(`/api/payments/${payment.id}/activation`);
        if (res.alreadyActive || isRenewal) {
          await refresh();
          navigate(isRenewal ? '/app/subscription' : '/login', { replace: true });
          return;
        }
        if (res.emailVerificationRequired) {
          setPhase('email-sent');
          return;
        }
        if (res.token) navigate(`/activate/${res.token}`, { replace: true });
      } catch (err) {
        activating.current = false;
        setError(err);
      }
    }, 1600);
    return () => clearTimeout(t);
  }, [phase, payment, navigate, isRenewal, refresh]);

  const onCopy = async () => {
    if (!payment?.pixCopyPaste) return;
    const ok = await copyText(payment.pixCopyPaste);
    setCopied(ok);
    if (ok) {
      toast.success('Código Pix copiado.');
      setTimeout(() => setCopied(false), 2500);
    } else toast.error('Não foi possível copiar. Selecione o código manualmente.');
  };

  const simulate = async () => {
    setSimulating(true);
    try {
      await post(`/api/payments/${payment.id}/simulate`);
      const { payment: p } = await api(`/api/payments/${payment.id}`);
      setPayment(p);
      if (p.status === 'CONFIRMED') setPhase('confirmed');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSimulating(false);
    }
  };

  const expired = payment?.status === 'EXPIRED' || (payment?.status === 'PENDING' && countdown?.ms === 0);
  const confirmed = phase !== 'pending';
  // Commission model: a one-time company signup fee instead of a monthly plan.
  const oneTime = config?.billing?.model !== 'subscription';
  const priceCents = oneTime ? (config?.billing?.companySignupFeeCents ?? PRICING.companySignupFeeCents) : PLAN.priceCents;
  const unavailable = !payment && (config?.paymentProvider === 'none' || Boolean(error));

  return (
    <div className={s.page}>
      <header className={s.top}>
        <Link to={isRenewal ? '/app/subscription' : '/onboarding'} className={s.back} aria-label="Voltar">
          <ArrowLeft size={16} /> <span>Voltar</span>
        </Link>
        <Logo />
        <span className={s.secure}>
          <Lock size={13} aria-hidden="true" /> Seguro
        </span>
      </header>

      <main className={s.grid}>
        {/* Summary (left on desktop, below on mobile) */}
        <section className={`${s.summary} ${oneTime ? `${s.summaryGold} gold-icons` : ''}`} aria-labelledby="summary-title">
          <p className="eyebrow">{oneTime ? 'Taxa de cadastro · empresa' : 'Assinatura'}</p>
          <h1 id="summary-title" className={s.planName}>
            TEMPIX
          </h1>
          <p className={`${s.planPrice} num`}>
            {formatCents(priceCents)}
            <span>{oneTime ? ' uma vez só' : '/mês'}</span>
          </p>
          <ul className={s.features}>
            {(oneTime ? PRICING.company : PLAN.features.slice(0, 6)).map((f) => (
              <li key={f}>
                <Check size={14} aria-hidden="true" /> {f}
              </li>
            ))}
          </ul>
          <dl className={s.lines}>
            <div>
              <dt>Plano</dt>
              <dd>{oneTime ? 'TemPix · empresa' : 'TemPix · mensal'}</dd>
            </div>
            <div>
              <dt>{oneTime ? 'Mensalidade' : 'Período'}</dt>
              <dd>{oneTime ? 'Nenhuma, nunca' : '30 dias a partir da confirmação'}</dd>
            </div>
            <div>
              <dt>{oneTime ? 'Depois' : 'Fidelidade'}</dt>
              <dd>{oneTime ? `${PRICING.commissionLabel} só sobre contratos fechados` : 'Nenhuma'}</dd>
            </div>
            <div className={s.total}>
              <dt>Total hoje</dt>
              <dd className="num">{formatCents(priceCents)}</dd>
            </div>
          </dl>
          {me?.user && (
            <p className={s.account}>
              Conta: <strong>{me.user.email}</strong>
            </p>
          )}
          <p className={s.trust}>
            <ShieldCheck size={14} aria-hidden="true" /> A ativação só acontece após a confirmação do provedor de pagamento. Você cria sua própria senha
            em seguida.
          </p>
        </section>

        {/* Pix panel */}
        <section className={s.pix} aria-labelledby="pix-title" aria-live="polite">
          <AnimatePresence mode="wait">
            {!confirmed ? (
              <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.3 }}>
                <div className={s.pixHead}>
                  <h2 id="pix-title" className={s.pixTitle}>
                    <QrCode size={18} aria-hidden="true" /> Pague com Pix
                  </h2>
                  <span className={`${s.status} ${expired || unavailable ? s.statusExpired : ''}`}>
                    <span className={s.statusDot} aria-hidden="true" />
                    {expired ? 'COBRANÇA EXPIRADA' : unavailable ? 'PIX INDISPONÍVEL' : 'AGUARDANDO PAGAMENTO'}
                  </span>
                  {payment?.isSandbox && <DemoBadge label="SANDBOX" />}
                </div>

                {config?.paymentProvider === 'none' && !payment ? (
                  <ErrorState
                    title="Pix em liberação"
                    message="Estamos concluindo a conexão com a instituição de pagamento. Seu cadastro ficou salvo: volte a esta página para pagar assim que o Pix for liberado. Nenhuma cobrança foi gerada."
                  />
                ) : error && !payment ? (
                  <ErrorState title="Não foi possível gerar o Pix" message={error.message} onRetry={createCharge} />
                ) : (
                  <>
                    <p className={`${s.amount} num`}>{payment ? formatCents(payment.amountCents) : <Skeleton w={140} h={30} />}</p>

                    <div className={s.qrWrap}>
                      {payment?.pixQrCodeBase64 && !expired ? (
                        <motion.img
                          initial={{ opacity: 0, scale: 0.97 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className={s.qr}
                          src={`data:image/png;base64,${payment.pixQrCodeBase64}`}
                          alt={`QR Code Pix para pagamento de ${formatCents(payment.amountCents)}`}
                          width={260}
                          height={260}
                        />
                      ) : expired ? (
                        <div className={s.qrExpired}>
                          <Clock size={22} aria-hidden="true" />
                          <p>Este código expirou.</p>
                          <Button size="sm" icon={RefreshCw} onClick={createCharge} loading={creating}>
                            Gerar novo Pix
                          </Button>
                        </div>
                      ) : (
                        <Skeleton w={260} h={260} r={12} />
                      )}
                      {payment && !expired && countdown && (
                        <p className={`${s.expires} mono`}>
                          <Clock size={12} aria-hidden="true" /> expira em {countdown.label}
                        </p>
                      )}
                    </div>

                    <div className={s.copyBlock}>
                      <label htmlFor="pix-code" className="eyebrow">
                        Pix copia e cola
                      </label>
                      <div className={s.copyRow}>
                        <input id="pix-code" className={`${s.code} mono`} readOnly value={payment?.pixCopyPaste || ''} onFocus={(e) => e.target.select()} />
                      </div>
                      <Button size="lg" block icon={copied ? Check : Copy} onClick={onCopy} disabled={!payment || expired}>
                        {copied ? 'COPIADO' : 'COPIAR PIX'}
                      </Button>
                    </div>

                    <ol className={s.howto}>
                      <li>
                        <Smartphone size={14} aria-hidden="true" /> Abra o app do seu banco e escolha Pix.
                      </li>
                      <li>
                        <QrCode size={14} aria-hidden="true" /> Escaneie o QR Code ou cole o código.
                      </li>
                      <li>
                        <Check size={14} aria-hidden="true" /> A confirmação aparece aqui automaticamente.
                      </li>
                    </ol>

                    {config?.simulationAvailable && payment?.provider === 'mock' && !expired && (
                      <div className={s.devBox}>
                        <p>
                          <FlaskConical size={14} aria-hidden="true" /> <strong>Ambiente de desenvolvimento.</strong> Provedor mock: este Pix não é pagável. Simule a
                          confirmação enviando um webhook assinado.
                        </p>
                        <Button size="sm" variant="outline" onClick={simulate} loading={simulating}>
                          Simular confirmação do pagamento
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            ) : (
              phase === 'email-sent' ? (
                <motion.div key="email-sent" className={s.confirmed} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45, ease }}>
                  <motion.span className={s.check} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
                    <Check size={30} />
                  </motion.span>
                  <h2 className={s.confirmedTitle}>LINK DE ATIVAÇÃO ENVIADO</h2>
                  <p>Confira sua caixa de entrada e spam. O link confirma seu e-mail e permite criar a senha.</p>
                  <Button to="/login" style={{ marginTop: 18 }}>IR PARA ENTRAR</Button>
                </motion.div>
              ) : (
              <motion.div key="confirmed" className={s.confirmed} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45, ease }}>
                <motion.span
                  className={s.check}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                >
                  <Check size={30} />
                </motion.span>
                <h2 className={s.confirmedTitle}>PAGAMENTO CONFIRMADO</h2>
                <p className={`${s.amount} num`}>{formatCents(payment?.amountCents || priceCents)}</p>
                <AnimatePresence>
                  {phase === 'activating' && (
                    <motion.div className={s.activating} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                      <LogoMark size={22} animated />
                      <span>Ativando seu TemPix...</span>
                    </motion.div>
                  )}
                </AnimatePresence>
                {error && <ErrorState compact title="Não foi possível continuar" message={error.message} onRetry={() => setPhase('confirmed')} />}
              </motion.div>
            ))}
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
}
