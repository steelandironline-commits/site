import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Lock } from 'lucide-react';
import {
  BR_STATES,
  BUSINESS_OBJECTIVES,
  DOCUMENTS_FIELD,
  INDUSTRY_SUGGESTIONS,
  OPERATION_START,
  OPERATION_TYPES,
  PRICING,
  capabilitySummary,
  emptyOperationalProfile,
  formatCents,
  groupLabel,
  isValidCnpj,
  isValidCpf,
  modulesFor,
  onlyDigits,
  operationalProfileSchema,
  profileCompleteness,
} from '@autopix/shared';
import { post, put } from '../../lib/api.js';
import { useSession } from '../../lib/session.jsx';
import { safeStorage } from '../../lib/hooks.js';
import { Logo, LogoMark } from '../../components/brand/Logo.jsx';
import { BRLText } from '../../components/brand/BRLIcon.jsx';
import { Button, Field, Input, Select, TagInput, Textarea } from '../../components/ui/ui.jsx';
import { AccountStartFields } from './AccountStartFields.jsx';
import { PersonWhereFields } from './PersonWhereFields.jsx';
import { OperationFields } from './operations/OperationFields.jsx';
import { CapabilityList, CompletenessMeter } from './operations/ProfileOverview.jsx';
import { OPS_COPY } from './operations/copy.js';
import s from './onboarding.module.css';

const ease = [0.22, 1, 0.36, 1];
const DRAFT_KEY = 'autopix:onboarding-draft';

/**
 * Steps. `fields` lists what is sent to PUT /api/onboarding/step.
 * Step 0 creates the pending account (POST /api/onboarding/start).
 */
const STEPS = [
  { key: 'start', title: 'Vamos começar.', subtitle: 'Leva poucos minutos. O cadastro é salvo quando você gerar o Pix.' },
  { key: 'sells', title: 'O que sua empresa vende?', subtitle: 'Produtos e uma breve descrição do negócio.', fields: ['products', 'description'] },
  { key: 'services', title: 'Quais serviços presta?', subtitle: 'Usamos isso para encontrar demandas compatíveis.', fields: ['services'] },
  { key: 'customer', title: 'Quem é seu cliente ideal?', subtitle: 'E quais setores você prefere atender.', fields: ['idealCustomer', 'preferredIndustries'] },
  { key: 'rejected', title: 'Quais setores você não atende?', subtitle: 'O TemPix descarta automaticamente esses mercados.', fields: ['excludedIndustries'] },
  { key: 'where', title: 'Onde você atende?', subtitle: 'Cidade-base, regiões e raio de atendimento.', fields: ['city', 'state', 'serviceLocations', 'serviceRadiusKm'] },
  { key: 'ticket', title: 'Qual o ticket médio?', subtitle: 'E qual o menor negócio que vale a sua atenção.', fields: ['averageTicket', 'minimumDeal'] },
  { key: 'keywords', title: 'Palavras-chave', subtitle: 'Termos que indicam demanda pelo que você faz.', fields: ['keywords'] },
  { key: 'presence', title: 'Presença digital', subtitle: 'Ajuda os agentes a entender seu posicionamento.', fields: ['website', 'instagram', 'phone'] },
];

/** Professionals (pessoa física): a short, free signup. */
const PERSON_STEPS = [
  { key: 'start', title: 'Vamos começar.', subtitle: 'Profissional se cadastra grátis. Leva menos de um minuto.' },
  { key: 'work', title: 'Qual é o seu trabalho?', subtitle: 'Profissão e serviços que você faz. Assim chegam vagas e serviços certos para você.', fields: ['services', 'description'] },
  { key: 'where', title: 'Onde você mora?', subtitle: 'Seu CEP e até quantos km você aceita ir para o trabalho.', fields: ['postalCode', 'city', 'state', 'serviceRadiusKm'] },
  // Asked last, after the profession and the region.
  { key: 'contact', title: 'Como falar com você?', subtitle: 'Opcional. Usado só para avisos de vagas e serviços.', fields: ['phone'], sortGroup: 'onde' },
];
/**
 * The signup is the base steps above plus the operational profile: the
 * "tipo de operação" step (companies only: a pessoa física is a worker and goes
 * straight to the profession), every engine module that applies (modulesFor)
 * and a final review. Steps are ordered by the
 * progressive sections (o que faz → fornece → compra → equipamentos →
 * estrutura → onde → clientes → revisão).
 */
const GROUP_OF = { start: 'sobre', sells: 'fornece', services: 'fornece', work: 'fornece', where: 'onde', customer: 'clientes', rejected: 'clientes', ticket: 'clientes', keywords: 'clientes', presence: 'sobre', contact: 'sobre' };
const GROUP_ORDER = ['sobre', 'faz', 'fornece', 'compra', 'equipamentos', 'estrutura', 'onde', 'clientes', 'revisao'];
const MODULE_ORDER = { mercado: 35 };
const OP_FIELDS = ['operationalProfile'];

export function stepsFor(type, profile = emptyOperationalProfile()) {
  const accountType = type || 'COMPANY';
  const rank = (group, within) => GROUP_ORDER.indexOf(group) * 1000 + within;
  const base = (type === 'PERSON' ? PERSON_STEPS : STEPS).map((st, i) => ({ ...st, group: GROUP_OF[st.key], sort: st.key === 'start' ? -1 : rank(st.sortGroup || GROUP_OF[st.key], st.sortGroup ? 900 : i * 10) }));
  const start = { key: 'operacao', group: 'faz', title: OPERATION_START.title, subtitle: OPERATION_START.subtitle, module: OPERATION_START, fields: OP_FIELDS, sort: rank('faz', 0) };
  const modules = modulesFor(profile, accountType).map((m, i) => ({
    key: `op:${m.id}`,
    group: m.group,
    title: m.title,
    subtitle: m.subtitle,
    module: m,
    fields: OP_FIELDS,
    sort: rank(m.group, MODULE_ORDER[m.id] ?? 500 + i),
  }));
  const review = { key: 'review', group: 'revisao', title: OPS_COPY.reviewTitle, subtitle: OPS_COPY.reviewSubtitle, fields: OP_FIELDS, sort: rank('revisao', 900) };
  const operation = type === 'PERSON' ? [] : [start];
  return [...base, ...operation, ...modules, review].sort((a, b) => a.sort - b.sort);
}

/** Landing CTAs can preselect operation types / objectives (?operacao=…&objetivo=…). */
function withPresets(profile, params) {
  const pick = (key, catalog) => (params.get(key) || '').split(',').filter((id) => catalog.some((x) => x.id === id));
  return {
    ...profile,
    types: [...new Set([...profile.types, ...pick('operacao', OPERATION_TYPES)])],
    objectives: [...new Set([...profile.objectives, ...pick('objetivo', BUSINESS_OBJECTIVES)])],
  };
}

const EMPTY = {
  name: '',
  cnpj: '',
  website: '',
  instagram: '',
  phone: '',
  city: '',
  state: '',
  postalCode: '',
  serviceLocations: [],
  serviceRadiusKm: 100,
  description: '',
  products: [],
  services: [],
  idealCustomer: '',
  averageTicket: '',
  minimumDeal: '',
  preferredIndustries: [],
  excludedIndustries: [],
  keywords: [],
};

const ANALYSIS = ['Perfil comercial', 'Mercado', 'Segmentos', 'Região', 'Ticket', 'Sinais'];
const PERSON_ANALYSIS = ['Perfil profissional', 'Região', 'Vagas', 'Serviços', 'Fretes'];
/** Section names for pessoa física: the company wording does not apply to a worker. */
const PERSON_GROUP_LABELS = { sobre: 'Sobre você', estrutura: 'Seus certificados', onde: 'Onde você mora' };
const groupTitle = (group, accountType) => (accountType === 'PERSON' && PERSON_GROUP_LABELS[group]) || groupLabel(group);

function toPayload(form, fields) {
  const out = {};
  for (const f of fields) {
    let v = form[f];
    if (['averageTicket', 'minimumDeal', 'serviceRadiusKm'].includes(f)) v = v === '' || v === null ? null : Number(onlyDigits(String(v)) || 0);
    else if (typeof v === 'string') v = v.trim() === '' ? null : v.trim();
    if (f === 'name' && !v) continue;
    out[f] = v;
  }
  return out;
}

function validate(stepKey, form, account, profile = emptyOperationalProfile()) {
  const e = {};
  if (stepKey === 'start') {
    if (!account.accountType) e.accountType = 'Escolha profissional ou empresa';
    if (account.name.trim().length < 2) e.name = 'Informe seu nome';
    if (!/^\S+@\S+\.\S+$/.test(account.email.trim())) e.email = 'E-mail inválido';
    if (account.accountType === 'COMPANY' && account.companyName.trim().length < 2) e.companyName = 'Informe o nome da empresa';
    if (account.accountType === 'COMPANY' && !isValidCnpj(account.document)) e.document = 'CNPJ inválido';
    if (account.accountType === 'PERSON' && !isValidCpf(account.document)) e.document = 'CPF inválido';
  }
  if (stepKey === 'operacao') {
    if (!profile.types.length) e.types = 'Escolha pelo menos um tipo de operação';
    if (!profile.objectives.length) e.objectives = 'Escolha pelo menos um objetivo';
  }
  if (stepKey === 'work' && !form.services.length) e.services = 'Adicione sua profissão ou um serviço';
  if (stepKey === 'sells' && !form.products.length && !form.description.trim()) e.products = 'Adicione pelo menos um produto ou uma descrição';
  if (stepKey === 'services' && !form.services.length && !form.products.length) e.services = 'Adicione pelo menos um serviço';
  if (stepKey === 'customer' && form.idealCustomer.trim().length < 3) e.idealCustomer = 'Descreva seu cliente ideal';
  if (stepKey === 'where' && account.accountType === 'PERSON' && !/^\d{8}$/.test(String(form.postalCode || ''))) e.postalCode = 'Informe o CEP com 8 números';
  if (stepKey === 'where' && account.accountType !== 'PERSON' && !form.city.trim() && !form.serviceLocations.length) e.city = 'Informe sua cidade ou regiões atendidas';
  return e;
}

function MoneyInput({ value, onChange, ...rest }) {
  const display = value === '' || value == null ? '' : new Intl.NumberFormat('pt-BR').format(Number(onlyDigits(String(value)) || 0));
  return <Input {...rest} inputMode="numeric" prefix="R$" value={display} onChange={(e) => onChange(onlyDigits(e.target.value))} />;
}

/* -------------------------------------------------------------- finish */
function Analysis({ onDone, items = ANALYSIS }) {
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

/** Daily cost of the fee over a year, rounded up to whole cents ("menos de R$ 0,01" for tiny fees). */
const perDay = (cents) => (Math.ceil(cents / 365) / 100).toFixed(2).replace('.', ',');

function Ready({ companyName, accountType, onSave }) {
  const navigate = useNavigate();
  const { config } = useSession();
  const subscription = config?.billing?.model === 'subscription';
  const commission = config?.billing?.commissionLabel || PRICING.commissionLabel;
  const feeCents = accountType === 'COMPANY' ? (config?.billing?.companySignupFeeCents ?? PRICING.companySignupFeeCents) : 0;
  const pay = subscription || feeCents > 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [emailSent, setEmailSent] = useState(false);
  // Set when the server refuses the e-mail or document: which one, so it can be fixed here.
  const [taken, setTaken] = useState(null);
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState(null);

  const fail = (err, fallback) => {
    setError(err.message || fallback);
    setTaken(err.status === 409 ? err.details?.field || null : null);
    setBusy(false);
  };

  // The account is created here, when the Pix is requested; the Pix then has one hour.
  const goToPix = async (overrides) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(overrides);
      navigate('/checkout');
    } catch (err) {
      fail(err, 'Não foi possível gerar o Pix agora. Tente novamente.');
    }
  };

  // Free accounts receive a single-use activation link at their email address.
  const finish = async (overrides) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(overrides);
      const res = await post('/api/onboarding/finish');
      if (res.alreadyActive) return navigate('/login', { replace: true });
      if (res.emailVerificationRequired) {
        setEmailSent(true);
        setBusy(false);
        return;
      }
      if (res.token) navigate(`/activate/${res.token}`, { replace: true });
    } catch (err) {
      fail(err, 'Não foi possível concluir agora. Tente novamente.');
    }
  };

  // The e-mail already has an account: sign up with another one without starting over.
  const retryWithEmail = (e) => {
    e.preventDefault();
    const email = newEmail.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setEmailError('E-mail inválido');
    setEmailError(null);
    setTaken(null);
    (pay ? goToPix : finish)({ email });
  };

  let title = emailSent ? 'Confira seu e-mail para continuar.' : 'Confirme seu e-mail para ativar sua conta.';
  let text = emailSent
    ? 'Enviamos um link seguro para criar sua senha. Abra a mensagem para confirmar que este e-mail pertence a você.'
    : `Seu cadastro está pronto. Enviaremos um link para confirmar o e-mail e criar sua senha; depois, os agentes de ${companyName || 'sua empresa'} começam a trabalhar.`;
  let foot = `Sem mensalidade · ${commission} só sobre valores intermediados com sucesso`;
  if (accountType === 'PERSON') {
    if (!emailSent) text = 'Seu cadastro está pronto. Enviaremos um link para confirmar o e-mail e criar sua senha; depois, vagas, serviços e fretes da sua região começam a chegar.';
    foot = `Grátis para profissionais · ${commission} só sobre valores intermediados com sucesso`;
  }
  if (subscription) {
    title = 'Seu TemPix está pronto para ser ativado.';
    text = `Os agentes de ${companyName || 'sua empresa'} começam a procurar oportunidades assim que o Pix for confirmado.`;
    foot = 'R$ 597,00/mês · Sem fidelidade · Cancele quando quiser';
  } else if (feeCents > 0) {
    title = 'Falta só a taxa única de cadastro.';
    text = `${formatCents(feeCents)}, uma vez só. Sem mensalidade e sem renovação: depois disso, o TemPix só fica com ${commission}, e apenas sobre os contratos concluídos e confirmados que a ${companyName || 'sua empresa'} fechar.`;
    foot = `Menos de R$ ${perDay(feeCents)} por dia no primeiro ano · nada de mensalidade depois`;
  }

  return (
    <motion.div className={s.ready} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
      <span className={s.readyIcon}>
        <Check size={26} />
      </span>
      <h1 className={s.readyTitle}>{title}</h1>
      <p className={s.readyText}><BRLText>{text}</BRLText></p>
      {pay ? (
        <Button size="lg" iconRight={ArrowRight} onClick={() => goToPix()} loading={busy}>
          {subscription ? 'PAGAR COM PIX' : `PAGAR ${formatCents(feeCents)} COM PIX`}
        </Button>
      ) : (
        <Button size="lg" iconRight={ArrowRight} onClick={() => finish()} loading={busy}>
          {emailSent ? 'REENVIAR LINK DE ATIVAÇÃO' : 'ENVIAR LINK DE ATIVAÇÃO'}
        </Button>
      )}
      {error && (
        <p className={s.readySafe} role="alert">
          <BRLText>{error}</BRLText>
        </p>
      )}
      {taken === 'email' && (
        <form className={s.readyFix} onSubmit={retryWithEmail} noValidate>
          <Field label="Outro e-mail" error={emailError}>
            {(a) => (
              <Input {...a} type="email" inputMode="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="voce@empresa.com.br" />
            )}
          </Field>
          <Button type="submit" variant="secondary" loading={busy} disabled={!newEmail.trim()}>
            {pay ? 'Usar este e-mail e gerar o Pix' : 'Usar este e-mail'}
          </Button>
          <Link to="/login" className={s.readyLink}>
            Já tenho conta: entrar
          </Link>
        </form>
      )}
      {taken === 'document' && (
        <Link to="/login" className={s.readyLink}>
          Entrar com o {accountType === 'PERSON' ? 'CPF' : 'CNPJ'}
        </Link>
      )}
      <p className={s.readySafe}>
        <Lock size={13} aria-hidden="true" /> <BRLText>{foot}</BRLText>
      </p>
    </motion.div>
  );
}

/* ---------------------------------------------------------------- page */
export default function Onboarding() {
  const navigate = useNavigate();
  const { refresh, me, config, loading: sessionLoading } = useSession();
  const storage = useMemo(() => safeStorage(), []);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [form, setForm] = useState(EMPTY);
  const [params] = useSearchParams();
  const preset = { profissional: 'PERSON', empresa: 'COMPANY' }[params.get('tipo')] || '';
  const [account, setAccount] = useState({ accountType: preset, name: '', email: '', companyName: '', document: '' });
  const [profile, setProfile] = useState(() => withPresets(emptyOperationalProfile(), params));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [booting, setBooting] = useState(true);
  const [checking, setChecking] = useState(false);
  const [phase, setPhase] = useState('form'); // form | analysis | ready
  const headingRef = useRef(null);

  // Every visit starts from zero. Nothing is kept in the browser or on the server
  // before the Pix, so a half-finished form never comes back; an old draft is discarded.
  useEffect(() => {
    document.title = 'Cadastre-se no TemPix';
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

  const steps = useMemo(() => stepsFor(account.accountType, profile), [account.accountType, profile]);
  const current = steps[step];
  const feeLabel = formatCents(config?.billing?.companySignupFeeCents ?? PRICING.companySignupFeeCents);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  /**
   * Creates the account on the server. It runs only when the person asks for the
   * Pix (or the activation link, for free accounts): until then nothing is saved,
   * and the signup has one hour from here.
   */
  const persistSignup = useCallback(async (overrides = {}) => {
    const parsed = operationalProfileSchema.safeParse(profile);
    if (!parsed.success) throw new Error('Revise os campos das etapas anteriores.');
    let data = { operationalProfile: parsed.data };
    for (const st of steps) {
      if (st.key !== 'start') data = { ...data, ...toPayload(form, st.fields.filter((f) => f !== 'operationalProfile')) };
    }
    const company = account.accountType === 'COMPANY';
    await post('/api/onboarding/start', {
      accountType: account.accountType,
      name: account.name,
      email: overrides.email ?? account.email,
      document: account.document,
      ...(company ? { companyName: account.companyName } : {}),
    });
    if (overrides.email) setAccount((a) => ({ ...a, email: overrides.email }));
    await put('/api/onboarding/step', { step: steps.length, data, complete: true });
    await refresh();
  }, [account, form, profile, steps, refresh]);

  const next = useCallback(async () => {
    const v = validate(current.key, form, account, profile);
    setErrors(v);
    setError(null);
    if (Object.keys(v).length) return;
    // First step: an e-mail or CNPJ/CPF that already has an account is refused right away.
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
    // The last step only opens the review; the account is created when the person asks for the Pix.
    if (step === steps.length - 1) return setPhase('analysis');
    setDir(1);
    setStep((st) => st + 1);
  }, [current, form, account, profile, step, steps]);

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
        <Link to="/" aria-label="TemPix — início">
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
          {phase === 'analysis' && (
            <Analysis key="analysis" items={account.accountType === 'PERSON' ? PERSON_ANALYSIS : ANALYSIS} onDone={() => setPhase('ready')} />
          )}
          {phase === 'ready' && <Ready key="ready" accountType={account.accountType} companyName={form.name || account.companyName} onSave={persistSignup} />}
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
                {current.group ? ` · ${groupTitle(current.group, account.accountType)}` : ''}
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
                {current.key === 'start' && (
                  <AccountStartFields account={account} setAccount={setAccount} errors={errors} feeLabel={feeLabel} />
                )}

                {current.module && (
                  <OperationFields fields={current.module.fields} profile={profile} onChange={setProfile} accountType={account.accountType || 'COMPANY'} errors={errors} />
                )}

                {current.key === 'review' && (
                  <>
                    <CompletenessMeter value={profileCompleteness(profile, { accountType: account.accountType, company: form })} />
                    <OperationFields fields={[DOCUMENTS_FIELD]} profile={profile} onChange={setProfile} accountType={account.accountType || 'COMPANY'} />
                    <CapabilityList lines={capabilitySummary(profile, form)} />
                  </>
                )}

                {current.key === 'work' && (
                  <>
                    <Field label="Profissão e serviços" hint="Pressione Enter para adicionar." error={errors.services}>
                      {(a) => (
                        <TagInput
                          {...a}
                          value={form.services}
                          onChange={set('services')}
                          placeholder="Ex.: Eletricista, Motorista"
                          suggestions={['Eletricista', 'Pedreiro', 'Motorista', 'Pintor', 'Encanador', 'Soldador', 'Ajudante geral', 'Operador de empilhadeira']}
                        />
                      )}
                    </Field>
                    <Field label="Sobre você" optional>
                      {(a) => <Textarea {...a} value={form.description} onChange={set('description')} placeholder="Experiência, certificações, ferramentas próprias." maxLength={2000} />}
                    </Field>
                  </>
                )}

                {current.key === 'contact' && (
                  <Field label="WhatsApp" optional hint="Só para avisos de vagas e serviços.">
                    {(a) => <Input {...a} type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} placeholder="(47) 99999-0000" />}
                  </Field>
                )}

                {current.key === 'sells' && (
                  <>
                    <Field label="Produtos" hint="Pressione Enter para adicionar." error={errors.products}>
                      {(a) => <TagInput {...a} value={form.products} onChange={set('products')} placeholder="Ex.: Peças usinadas, Estruturas metálicas" />}
                    </Field>
                    <Field label="Descrição da empresa" optional>
                      {(a) => <Textarea {...a} value={form.description} onChange={set('description')} placeholder="O que você faz, para quem, e o que te diferencia." maxLength={2000} />}
                    </Field>
                  </>
                )}

                {current.key === 'services' && (
                  <Field label="Serviços" hint="Pressione Enter para adicionar." error={errors.services}>
                    {(a) => (
                      <TagInput
                        {...a}
                        value={form.services}
                        onChange={set('services')}
                        placeholder="Ex.: Usinagem, Manutenção industrial"
                        suggestions={['Manutenção', 'Instalação', 'Consultoria', 'Reforma', 'Projetos', 'Fabricação sob medida']}
                      />
                    )}
                  </Field>
                )}

                {current.key === 'customer' && (
                  <>
                    <Field label="Cliente ideal" error={errors.idealCustomer}>
                      {(a) => <Textarea {...a} value={form.idealCustomer} onChange={set('idealCustomer')} placeholder="Ex.: Indústrias de médio porte com produção contínua" maxLength={1000} />}
                    </Field>
                    <Field label="Setores preferidos" optional>
                      {(a) => <TagInput {...a} value={form.preferredIndustries} onChange={set('preferredIndustries')} placeholder="Adicione setores" suggestions={INDUSTRY_SUGGESTIONS} />}
                    </Field>
                  </>
                )}

                {current.key === 'rejected' && (
                  <Field label="Setores rejeitados" optional hint="Nenhuma oportunidade desses setores será criada.">
                    {(a) => (
                      <TagInput
                        {...a}
                        value={form.excludedIndustries}
                        onChange={set('excludedIndustries')}
                        placeholder="Adicione setores"
                        suggestions={INDUSTRY_SUGGESTIONS.filter((i) => !form.preferredIndustries.includes(i))}
                      />
                    )}
                  </Field>
                )}

                {current.key === 'where' && account.accountType === 'PERSON' && <PersonWhereFields form={form} set={set} errors={errors} />}

                {current.key === 'where' && account.accountType !== 'PERSON' && (
                  <>
                    <div className={s.row2}>
                      <Field label="Cidade-base" error={errors.city}>
                        {(a) => <Input {...a} autoComplete="address-level2" value={form.city} onChange={set('city')} />}
                      </Field>
                      <Field label="UF">
                        {(a) => (
                          <Select {...a} value={form.state} onChange={set('state')}>
                            <option value="">—</option>
                            {BR_STATES.map((uf) => (
                              <option key={uf} value={uf}>
                                {uf}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                    </div>
                    <Field label="Regiões atendidas" optional hint='Ex.: "Joinville - SC", "Grande Curitiba".'>
                      {(a) => <TagInput {...a} value={form.serviceLocations} onChange={set('serviceLocations')} placeholder="Adicione cidades ou regiões" />}
                    </Field>
                    <Field label={`Raio de atendimento: ${form.serviceRadiusKm || 0} km`}>
                      {(a) => (
                        <input
                          {...a}
                          type="range"
                          min={0}
                          max={1500}
                          step={10}
                          className={s.range}
                          value={form.serviceRadiusKm || 0}
                          onChange={(e) => set('serviceRadiusKm')(Number(e.target.value))}
                        />
                      )}
                    </Field>
                  </>
                )}

                {current.key === 'ticket' && (
                  <div className={s.row2}>
                    <Field label="Ticket médio" hint="Valor típico de um contrato.">
                      {(a) => <MoneyInput {...a} value={form.averageTicket} onChange={set('averageTicket')} />}
                    </Field>
                    <Field label="Menor negócio que vale a pena" hint="Abaixo disso, ignoramos.">
                      {(a) => <MoneyInput {...a} value={form.minimumDeal} onChange={set('minimumDeal')} />}
                    </Field>
                  </div>
                )}

                {current.key === 'keywords' && (
                  <Field label="Palavras-chave" optional hint="Ex.: manutenção preventiva, ampliação de fábrica.">
                    {(a) => <TagInput {...a} value={form.keywords} onChange={set('keywords')} placeholder="Adicione termos" max={40} />}
                  </Field>
                )}

                {current.key === 'presence' && (
                  <>
                    <Field label="Website" optional error={errors.website}>
                      {(a) => <Input {...a} inputMode="url" autoComplete="url" value={form.website} onChange={set('website')} placeholder="suaempresa.com.br" />}
                    </Field>
                    <div className={s.row2}>
                      <Field label="Instagram" optional>
                        {(a) => <Input {...a} value={form.instagram} onChange={set('instagram')} placeholder="@suaempresa" />}
                      </Field>
                      <Field label="Telefone" optional>
                        {(a) => <Input {...a} type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} placeholder="(11) 4000-0000" />}
                      </Field>
                    </div>
                  </>
                )}
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

