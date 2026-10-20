import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import {
  BUSINESS_OBJECTIVES,
  DOCUMENTS_FIELD,
  OPERATION_TYPES,
  capabilitySummary,
  emptyOperationalProfile,
  operationalProfileSchema,
  profileCompleteness,
} from '@autopix/shared';
import { Button, Logo, LogoMark, post, put, safeStorage, useBrand, useSession } from '@autopix/ui';
import { OperationFields } from './operations/OperationFields.jsx';
import { CapabilityList, CompletenessMeter } from './operations/ProfileOverview.jsx';
import { emptyForm, toPayload } from './steps.js';
import s from './onboarding.module.css';

const ease = [0.22, 1, 0.36, 1];
const DRAFT_KEY = 'autopix:onboarding-draft';

/** Landing CTAs can preselect operation types / objectives (?operacao=…&objetivo=…). */
function withPresets(profile, params) {
  const pick = (key, catalog) => (params.get(key) || '').split(',').filter((id) => catalog.some((x) => x.id === id));
  return {
    ...profile,
    types: [...new Set([...profile.types, ...pick('operacao', OPERATION_TYPES)])],
    objectives: [...new Set([...profile.objectives, ...pick('objetivo', BUSINESS_OBJECTIVES)])],
  };
}

function Analysis({ onDone, items }) {
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (done >= items.length) {
      const t = setTimeout(onDone, 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setDone((d) => d + 1), 520);
    return () => clearTimeout(t);
  }, [done, onDone]);
  return (
    <motion.div className={s.analysis} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status" aria-live="polite">
      <LogoMark size={56} animated />
      <h1 className={s.analysisTitle}>Entendendo seu mercado...</h1>
      <ul className={s.analysisList}>
        {items.map((label, i) => (
          <motion.li
            key={label}
            className={i < done ? s.aDone : i === done ? s.aActive : ''}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <span className={s.aMark} aria-hidden="true">
              {i < done ? <Check size={12} /> : null}
            </span>
            {label}
            <span className={s.aBar} aria-hidden="true">
              <motion.span initial={{ width: 0 }} animate={{ width: i < done ? '100%' : i === done ? '60%' : 0 }} transition={{ duration: 0.5 }} />
            </span>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
}

/**
 * Motor do cadastro, igual para as duas áreas: cabeçalho, progresso, passos animados, análise e
 * criação da conta. Tudo o que é de uma área vem do `flow` que a entrada dela monta (etapas, campos
 * do primeiro passo, validação, tela final e textos); este arquivo não cita empresa nem pessoa.
 *
 *   accountType   COMPANY ou PERSON: o tipo que o host impõe
 *   steps(profile)            lista de etapas (veja steps.js)
 *   validate(key, { form, account, profile })   erros da etapa
 *   StartFields   campos do primeiro passo ({ account, setAccount, errors })
 *   renderStep(current, { form, set, errors, account })   corpo das etapas próprias da área
 *   Ready         tela final ({ account, form, onSave })
 *   analysis      itens da tela de análise
 *   groupTitle(group)   nome da seção
 *   startExtra(account) campos a mais no POST /api/onboarding/start
 */
export default function OnboardingFlow({ flow }) {
  const { accountType, steps: stepsOf, validate, StartFields, renderStep, Ready, analysis, groupTitle, startExtra } = flow;
  const navigate = useNavigate();
  const { name: brandName } = useBrand();
  const { refresh, me, loading: sessionLoading } = useSession();
  const storage = useMemo(() => safeStorage(), []);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [params] = useSearchParams();
  const [account, setAccount] = useState({ accountType, name: '', email: '', companyName: '', document: '' });
  const [profile, setProfile] = useState(() => withPresets(emptyOperationalProfile(), params));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [booting, setBooting] = useState(true);
  const [checking, setChecking] = useState(false);
  const [phase, setPhase] = useState('form'); // form | analysis | ready
  const headingRef = useRef(null);

  // Every visit starts from zero. Nothing is kept in the browser or on the server
  // before the account is created, so a half-finished form never comes back; an old draft is discarded.
  useEffect(() => {
    document.title = `Cadastre-se no ${brandName}`;
    if (sessionLoading) return;
    if (me?.scope === 'FULL' && me.user.status === 'ACTIVE') {
      navigate('/app', { replace: true });
      return;
    }
    try {
      storage?.removeItem(DRAFT_KEY);
    } catch {
      /* storage unavailable */
    }
    setBooting(false);
    // Runs once the session is known; later session refreshes must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading]);

  useEffect(() => {
    if (!booting) headingRef.current?.focus({ preventScroll: true });
  }, [step, booting]);

  const steps = useMemo(() => stepsOf(profile), [stepsOf, profile]);
  const current = steps[step];
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  /**
   * Creates the account on the server. It runs only when the person asks for the
   * next move (the Pix, or the activation link for free accounts): until then nothing is saved.
   */
  const persistSignup = useCallback(async (overrides = {}) => {
    const parsed = operationalProfileSchema.safeParse(profile);
    if (!parsed.success) throw new Error('Revise os campos das etapas anteriores.');
    let data = { operationalProfile: parsed.data };
    for (const st of steps) {
      if (st.key !== 'start') data = { ...data, ...toPayload(form, st.fields.filter((f) => f !== 'operationalProfile')) };
    }
    await post('/api/onboarding/start', {
      accountType: account.accountType,
      name: account.name,
      email: overrides.email ?? account.email,
      document: account.document,
      ...(startExtra ? startExtra(account) : {}),
    });
    if (overrides.email) setAccount((a) => ({ ...a, email: overrides.email }));
    await put('/api/onboarding/step', { step: steps.length, data, complete: true });
    await refresh();
  }, [account, form, profile, steps, refresh, startExtra]);

  const next = useCallback(async () => {
    const v = validate(current.key, { form, account, profile });
    setErrors(v);
    setError(null);
    if (Object.keys(v).length) return;
    // First step: an e-mail or document that already has an account is refused right away.
    if (current.key === 'start') {
      setChecking(true);
      try {
        const res = await post('/api/onboarding/check', { accountType: account.accountType, email: account.email, document: account.document });
        if (!res.available) return setErrors(res.taken);
      } catch (err) {
        // Offline or rate limited: say so; the final step checks again anyway.
        if (err.status !== 0) return setError(err.message);
      } finally {
        setChecking(false);
      }
    }
    // The last step only opens the review; the account is created when the person asks for it.
    if (step === steps.length - 1) return setPhase('analysis');
    setDir(1);
    setStep((st) => st + 1);
  }, [current, form, account, profile, step, steps, validate]);

  const back = () => {
    setErrors({});
    setError(null);
    setDir(-1);
    setStep((st) => Math.max(0, st - 1));
  };

  const onSubmit = (e) => {
    e.preventDefault();
    next();
  };

  const progress = ((step + (phase !== 'form' ? 1 : 0)) / steps.length) * 100;

  return (
    <div className={s.page}>
      <header className={s.top}>
        <Link to="/" aria-label={`${brandName} — início`}>
          <Logo />
        </Link>
        <span className={s.counter}>
          {phase === 'form' ? `${String(step + 1).padStart(2, '0')} / ${String(steps.length).padStart(2, '0')}` : 'Concluído'}
        </span>
      </header>
      <div className={s.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-label="Progresso do cadastro">
        <motion.span animate={{ width: `${progress}%` }} transition={{ duration: 0.5, ease }} />
      </div>

      <main className={s.main}>
        <AnimatePresence mode="wait" custom={dir}>
          {phase === 'analysis' && <Analysis key="analysis" items={analysis} onDone={() => setPhase('ready')} />}
          {phase === 'ready' && <Ready key="ready" account={account} form={form} onSave={persistSignup} />}
          {phase === 'form' && !booting && (
            <motion.form
              key={current.key}
              className={s.card}
              onSubmit={onSubmit}
              noValidate
              custom={dir}
              initial={{ opacity: 0, x: dir * 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -24 }}
              transition={{ duration: 0.3, ease }}
            >
              <p className="eyebrow">
                Etapa {step + 1}
                {current.group ? ` · ${groupTitle(current.group)}` : ''}
              </p>
              <h1 className={s.title} ref={headingRef} tabIndex={-1}>
                {current.title}
              </h1>
              <p className={s.subtitle}>{current.subtitle}</p>
              {error && (
                <p className={s.formError} role="alert">
                  {error}
                </p>
              )}

              <div className={s.fields}>
                {current.key === 'start' && <StartFields account={account} setAccount={setAccount} errors={errors} />}

                {current.module && (
                  <OperationFields fields={current.module.fields} profile={profile} onChange={setProfile} accountType={accountType} errors={errors} />
                )}

                {current.key === 'review' && (
                  <>
                    <CompletenessMeter value={profileCompleteness(profile, { accountType, company: form })} />
                    <OperationFields fields={[DOCUMENTS_FIELD]} profile={profile} onChange={setProfile} accountType={accountType} />
                    <CapabilityList lines={capabilitySummary(profile, form)} />
                  </>
                )}

                {renderStep(current, { form, set, errors, account })}
              </div>

              <footer className={s.actions}>
                {step > 0 ? (
                  <Button variant="ghost" icon={ArrowLeft} onClick={back}>
                    Voltar
                  </Button>
                ) : (
                  <span />
                )}
                <Button type="submit" iconRight={ArrowRight} size="lg" loading={checking}>
                  {step === steps.length - 1 ? 'CONCLUIR' : 'CONTINUAR'}
                </Button>
              </footer>
              {step === 0 && (
                <p className={s.legal}>
                  Já tem conta? <Link to="/login">Entrar</Link>
                </p>
              )}
            </motion.form>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
