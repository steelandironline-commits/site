import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { emptyOperationalProfile, formatCpf, groupLabel, isValidCpf } from '@autopix/shared';
import { Field, Input, TagInput, Textarea, post } from '@autopix/ui';
import OnboardingFlow from '../../pages/onboarding/OnboardingFlow.jsx';
import { ReadyView, failureOf } from '../../pages/onboarding/ReadyView.jsx';
import { buildSteps } from '../../pages/onboarding/steps.js';
import { PersonWhereFields } from './PersonWhereFields.jsx';

// Cadastro da área de pessoas: só pessoa física (CPF), grátis, sem cobrança e sem Pix. Termina no
// link de ativação por e-mail, nunca em pagamento. O motor é o mesmo da outra área
// (pages/onboarding/OnboardingFlow.jsx); aqui ficam as etapas, os campos e os textos do CPF.

/** Profissionais: um cadastro curto e grátis. */
const STEPS = [
  { key: 'start', title: 'Vamos começar.', subtitle: 'Profissional se cadastra grátis. Leva menos de um minuto.' },
  { key: 'work', title: 'Qual é o seu trabalho?', subtitle: 'Profissão e serviços que você faz. Assim chegam vagas e serviços certos para você.', fields: ['services', 'description'] },
  { key: 'where', title: 'Onde você mora?', subtitle: 'Seu CEP e até quantos km você aceita ir para o trabalho.', fields: ['postalCode', 'city', 'state', 'serviceRadiusKm'] },
  // Asked last, after the profession and the region.
  { key: 'contact', title: 'Como falar com você?', subtitle: 'Opcional. Usado só para avisos de vagas e serviços.', fields: ['phone'], sortGroup: 'onde' },
];

const GROUP_OF = { start: 'sobre', work: 'fornece', where: 'onde', contact: 'sobre' };

/** Etapas do cadastro de pessoa: as acima, os módulos do perfil operacional que se aplicam e a revisão. */
export function stepsFor(profile = emptyOperationalProfile()) {
  return buildSteps({ accountType: 'PERSON', base: STEPS, groupOf: GROUP_OF, withOperationStart: false, profile });
}

const ANALYSIS = ['Perfil profissional', 'Região', 'Vagas', 'Serviços'];

/** Nomes das seções para quem trabalha por conta própria; as demais usam o nome do catálogo. */
const GROUP_LABELS = { sobre: 'Sobre você', estrutura: 'Seus certificados', onde: 'Onde você mora' };
const groupTitle = (group) => GROUP_LABELS[group] || groupLabel(group);

export function validate(stepKey, { form, account }) {
  const e = {};
  if (stepKey === 'start') {
    if (account.name.trim().length < 2) e.name = 'Informe seu nome';
    if (!/^\S+@\S+\.\S+$/.test(account.email.trim())) e.email = 'E-mail inválido';
    if (!isValidCpf(account.document)) e.document = 'CPF inválido';
  }
  if (stepKey === 'work' && !form.services.length) e.services = 'Adicione sua profissão ou um serviço';
  if (stepKey === 'where' && !/^\d{8}$/.test(String(form.postalCode || ''))) e.postalCode = 'Informe o CEP com 8 números';
  return e;
}

export function StartFields({ account, setAccount, errors }) {
  return (
    <>
      <Field label="Seu nome" error={errors.name}>
        {(a) => <Input {...a} autoComplete="name" value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} />}
      </Field>
      <Field label="CPF" hint="Será o seu login." error={errors.document}>
        {(a) => (
          <Input
            {...a}
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            value={account.document}
            onChange={(e) => setAccount({ ...account, document: formatCpf(e.target.value) })}
            maxLength={14}
          />
        )}
      </Field>
      <Field label="E-mail" hint="Para ativar a conta e recuperar a senha." error={errors.email}>
        {(a) => <Input {...a} type="email" inputMode="email" autoComplete="email" value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} />}
      </Field>
    </>
  );
}

/** Corpo das etapas próprias do cadastro de pessoa. */
function renderStep(current, { form, set, errors }) {
  switch (current.key) {
    case 'work':
      return (
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
      );
    case 'where':
      return <PersonWhereFields form={form} set={set} errors={errors} />;
    case 'contact':
      return (
        <Field label="WhatsApp" optional hint="Só para avisos de vagas e serviços.">
          {(a) => <Input {...a} type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} placeholder="(47) 99999-0000" />}
        </Field>
      );
    default:
      return null;
  }
}

/** Tela final: cadastro grátis. Cria a conta e manda o link de ativação por e-mail; nunca cobra. */
export function Ready({ onSave }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState({ error: null, taken: null });
  const [emailSent, setEmailSent] = useState(false);

  // Free accounts receive a single-use activation link at their email address.
  const finish = async (overrides) => {
    setBusy(true);
    setState({ error: null, taken: null });
    try {
      await onSave(overrides);
      const res = await post('/api/onboarding/finish');
      if (res.alreadyActive) return navigate('/login', { replace: true });
      if (res.emailVerificationRequired) {
        setEmailSent(true);
        setBusy(false);
        return undefined;
      }
      if (res.token) navigate(`/activate/${res.token}`, { replace: true });
    } catch (err) {
      setState(failureOf(err, 'Não foi possível concluir agora. Tente novamente.'));
      setBusy(false);
    }
    return undefined;
  };

  return (
    <ReadyView
      title={emailSent ? 'Confira seu e-mail para continuar.' : 'Confirme seu e-mail para ativar sua conta.'}
      text={
        emailSent
          ? 'Enviamos um link seguro para criar sua senha. Abra a mensagem para confirmar que este e-mail pertence a você.'
          : 'Seu cadastro está pronto. Enviaremos um link para confirmar o e-mail e criar sua senha; depois, vagas e serviços da sua região começam a chegar.'
      }
      foot="Cadastro grátis · sem mensalidade"
      cta={{ label: emailSent ? 'REENVIAR LINK DE ATIVAÇÃO' : 'ENVIAR LINK DE ATIVAÇÃO', onClick: () => finish() }}
      busy={busy}
      error={state.error}
      taken={state.taken}
      retryLabel="Usar este e-mail"
      emailPlaceholder="voce@email.com.br"
      documentLabel="CPF"
      onRetryEmail={(email) => finish({ email })}
    />
  );
}

const FLOW = {
  accountType: 'PERSON',
  steps: stepsFor,
  validate,
  StartFields,
  renderStep,
  Ready,
  analysis: ANALYSIS,
  groupTitle,
};

export default function Onboarding() {
  return <OnboardingFlow flow={FLOW} />;
}
