import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BR_STATES, INDUSTRY_SUGGESTIONS, PRICING, emptyOperationalProfile, formatCents, formatCnpj, groupLabel, isValidCnpj, onlyDigits } from '@autopix/shared';
import { Field, Input, Select, TagInput, Textarea, post, useSession } from '@autopix/ui';
import OnboardingFlow from '../../pages/onboarding/OnboardingFlow.jsx';
import { ReadyView, failureOf } from '../../pages/onboarding/ReadyView.jsx';
import { buildSteps } from '../../pages/onboarding/steps.js';
import s from '../../pages/onboarding/onboarding.module.css';

// Cadastro da área de empresas: só empresa (CNPJ ou MEI), taxa única de cadastro pelo Pix.
// O motor é o mesmo da outra área (pages/onboarding/OnboardingFlow.jsx); aqui ficam as etapas,
// os campos e os textos do CNPJ. Não há escolha de tipo de conta: o host já impõe o tipo.

const STEPS = [
  { key: 'start', title: 'Vamos começar.', subtitle: 'Leva poucos minutos. O cadastro é salvo quando você gerar o Pix.' },
  { key: 'sells', title: 'O que sua empresa vende?', subtitle: 'Produtos e uma breve descrição do negócio.', fields: ['products', 'description'] },
  { key: 'services', title: 'Quais serviços presta?', subtitle: 'Usamos isso para encontrar demandas compatíveis.', fields: ['services'] },
  { key: 'customer', title: 'Quem é seu cliente ideal?', subtitle: 'E quais setores você prefere atender.', fields: ['idealCustomer', 'preferredIndustries'] },
  { key: 'rejected', title: 'Quais setores você não atende?', subtitle: 'O Tem CNPJ descarta automaticamente esses mercados.', fields: ['excludedIndustries'] },
  { key: 'where', title: 'Onde você atende?', subtitle: 'Cidade-base, regiões e raio de atendimento.', fields: ['city', 'state', 'serviceLocations', 'serviceRadiusKm'] },
  { key: 'ticket', title: 'Qual o ticket médio?', subtitle: 'E qual o menor negócio que vale a sua atenção.', fields: ['averageTicket', 'minimumDeal'] },
  { key: 'keywords', title: 'Palavras-chave', subtitle: 'Termos que indicam demanda pelo que você faz.', fields: ['keywords'] },
  { key: 'presence', title: 'Presença digital', subtitle: 'Ajuda os agentes a entender seu posicionamento.', fields: ['website', 'instagram', 'phone'] },
];

const GROUP_OF = { start: 'sobre', sells: 'fornece', services: 'fornece', where: 'onde', customer: 'clientes', rejected: 'clientes', ticket: 'clientes', keywords: 'clientes', presence: 'sobre' };

/** Etapas do cadastro de empresa: as acima, o tipo de operação, os módulos do perfil operacional e a revisão. */
export function stepsFor(profile = emptyOperationalProfile()) {
  return buildSteps({ accountType: 'COMPANY', base: STEPS, groupOf: GROUP_OF, withOperationStart: true, profile });
}

const ANALYSIS = ['Perfil comercial', 'Mercado', 'Segmentos', 'Região', 'Ticket', 'Sinais'];

export function validate(stepKey, { form, account, profile }) {
  const e = {};
  if (stepKey === 'start') {
    if (account.name.trim().length < 2) e.name = 'Informe seu nome';
    if (!/^\S+@\S+\.\S+$/.test(account.email.trim())) e.email = 'E-mail inválido';
    if (account.companyName.trim().length < 2) e.companyName = 'Informe o nome da empresa';
    if (!isValidCnpj(account.document)) e.document = 'CNPJ inválido';
  }
  if (stepKey === 'operacao') {
    if (!profile.types.length) e.types = 'Escolha pelo menos um tipo de operação';
    if (!profile.objectives.length) e.objectives = 'Escolha pelo menos um objetivo';
  }
  if (stepKey === 'sells' && !form.products.length && !form.description.trim()) e.products = 'Adicione pelo menos um produto ou uma descrição';
  if (stepKey === 'services' && !form.services.length && !form.products.length) e.services = 'Adicione pelo menos um serviço';
  if (stepKey === 'customer' && form.idealCustomer.trim().length < 3) e.idealCustomer = 'Descreva seu cliente ideal';
  if (stepKey === 'where' && !form.city.trim() && !form.serviceLocations.length) e.city = 'Informe sua cidade ou regiões atendidas';
  return e;
}

function MoneyInput({ value, onChange, ...rest }) {
  const display = value === '' || value == null ? '' : new Intl.NumberFormat('pt-BR').format(Number(onlyDigits(String(value)) || 0));
  return <Input {...rest} inputMode="numeric" prefix="R$" value={display} onChange={(e) => onChange(onlyDigits(e.target.value))} />;
}

export function StartFields({ account, setAccount, errors }) {
  return (
    <>
      <Field label="Seu nome" error={errors.name}>
        {(a) => <Input {...a} autoComplete="name" value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} />}
      </Field>
      <Field label="CNPJ (empresa ou MEI)" hint="Será o login da empresa: um login por CNPJ. Colaboradores entram com o próprio CPF." error={errors.document}>
        {(a) => (
          <Input
            {...a}
            inputMode="numeric"
            autoComplete="off"
            placeholder="00.000.000/0000-00"
            value={account.document}
            onChange={(e) => setAccount({ ...account, document: formatCnpj(e.target.value) })}
            maxLength={18}
          />
        )}
      </Field>
      <Field label="Nome da empresa" error={errors.companyName}>
        {(a) => <Input {...a} autoComplete="organization" value={account.companyName} onChange={(e) => setAccount({ ...account, companyName: e.target.value })} />}
      </Field>
      <Field label="E-mail" hint="Para ativar a conta e recuperar a senha." error={errors.email}>
        {(a) => <Input {...a} type="email" inputMode="email" autoComplete="email" value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} />}
      </Field>
    </>
  );
}

/** Corpo das etapas próprias do cadastro de empresa. */
function renderStep(current, { form, set, errors }) {
  switch (current.key) {
    case 'sells':
      return (
        <>
          <Field label="Produtos" hint="Pressione Enter para adicionar." error={errors.products}>
            {(a) => <TagInput {...a} value={form.products} onChange={set('products')} placeholder="Ex.: Peças usinadas, Estruturas metálicas" />}
          </Field>
          <Field label="Descrição da empresa" optional>
            {(a) => <Textarea {...a} value={form.description} onChange={set('description')} placeholder="O que você faz, para quem, e o que te diferencia." maxLength={2000} />}
          </Field>
        </>
      );
    case 'services':
      return (
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
      );
    case 'customer':
      return (
        <>
          <Field label="Cliente ideal" error={errors.idealCustomer}>
            {(a) => <Textarea {...a} value={form.idealCustomer} onChange={set('idealCustomer')} placeholder="Ex.: Indústrias de médio porte com produção contínua" maxLength={1000} />}
          </Field>
          <Field label="Setores preferidos" optional>
            {(a) => <TagInput {...a} value={form.preferredIndustries} onChange={set('preferredIndustries')} placeholder="Adicione setores" suggestions={INDUSTRY_SUGGESTIONS} />}
          </Field>
        </>
      );
    case 'rejected':
      return (
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
      );
    case 'where':
      return (
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
      );
    case 'ticket':
      return (
        <div className={s.row2}>
          <Field label="Ticket médio" hint="Valor típico de um contrato.">
            {(a) => <MoneyInput {...a} value={form.averageTicket} onChange={set('averageTicket')} />}
          </Field>
          <Field label="Menor negócio que vale a pena" hint="Abaixo disso, ignoramos.">
            {(a) => <MoneyInput {...a} value={form.minimumDeal} onChange={set('minimumDeal')} />}
          </Field>
        </div>
      );
    case 'keywords':
      return (
        <Field label="Palavras-chave" optional hint="Ex.: manutenção preventiva, ampliação de fábrica.">
          {(a) => <TagInput {...a} value={form.keywords} onChange={set('keywords')} placeholder="Adicione termos" max={40} />}
        </Field>
      );
    case 'presence':
      return (
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
      );
    default:
      return null;
  }
}

/** Daily cost of the fee over a year, rounded up to whole cents ("menos de R$ 0,01" for tiny fees). */
const perDay = (cents) => (Math.ceil(cents / 365) / 100).toFixed(2).replace('.', ',');

/** Tela final: a taxa única de cadastro pelo Pix (/checkout) ou, se a taxa for zero, o link de ativação. */
export function Ready({ account, form, onSave }) {
  const navigate = useNavigate();
  const { config } = useSession();
  const companyName = form.name || account.companyName;
  const subscription = config?.billing?.model === 'subscription';
  const commission = config?.billing?.commissionLabel || PRICING.commissionLabel;
  const feeCents = config?.billing?.companySignupFeeCents ?? PRICING.companySignupFeeCents;
  const pay = subscription || feeCents > 0;
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState({ error: null, taken: null });
  const [emailSent, setEmailSent] = useState(false);

  const fail = (err, fallback) => {
    setState(failureOf(err, fallback));
    setBusy(false);
  };

  // The account is created here, when the Pix is requested; the Pix then has one hour.
  const goToPix = async (overrides) => {
    setBusy(true);
    setState({ error: null, taken: null });
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
      fail(err, 'Não foi possível concluir agora. Tente novamente.');
    }
    return undefined;
  };

  let title = emailSent ? 'Confira seu e-mail para continuar.' : 'Confirme seu e-mail para ativar sua conta.';
  let text = emailSent
    ? 'Enviamos um link seguro para criar sua senha. Abra a mensagem para confirmar que este e-mail pertence a você.'
    : `Seu cadastro está pronto. Enviaremos um link para confirmar o e-mail e criar sua senha; depois, os agentes de ${companyName || 'sua empresa'} começam a trabalhar.`;
  let foot = `Sem mensalidade · ${commission} só sobre valores intermediados com sucesso`;
  if (subscription) {
    title = 'Seu Tem CNPJ está pronto para ser ativado.';
    text = `Os agentes de ${companyName || 'sua empresa'} começam a procurar oportunidades assim que o Pix for confirmado.`;
    foot = 'R$ 597,00/mês · Sem fidelidade · Cancele quando quiser';
  } else if (feeCents > 0) {
    title = 'Falta só a taxa única de cadastro.';
    text = `${formatCents(feeCents)}, uma vez só. Sem mensalidade e sem renovação: depois disso, o Tem CNPJ só fica com ${commission}, e apenas sobre os contratos concluídos e confirmados que a ${companyName || 'sua empresa'} fechar.`;
    foot = `Menos de R$ ${perDay(feeCents)} por dia no primeiro ano · nada de mensalidade depois`;
  }

  const cta = pay
    ? { label: subscription ? 'PAGAR COM PIX' : `PAGAR ${formatCents(feeCents)} COM PIX`, onClick: () => goToPix() }
    : { label: emailSent ? 'REENVIAR LINK DE ATIVAÇÃO' : 'ENVIAR LINK DE ATIVAÇÃO', onClick: () => finish() };

  return (
    <ReadyView
      title={title}
      text={text}
      foot={foot}
      cta={cta}
      busy={busy}
      error={state.error}
      taken={state.taken}
      retryLabel={pay ? 'Usar este e-mail e gerar o Pix' : 'Usar este e-mail'}
      emailPlaceholder="voce@empresa.com.br"
      documentLabel="CNPJ"
      onRetryEmail={(email) => (pay ? goToPix : finish)({ email })}
    />
  );
}

const FLOW = {
  accountType: 'COMPANY',
  steps: stepsFor,
  validate,
  StartFields,
  renderStep,
  Ready,
  analysis: ANALYSIS,
  groupTitle: groupLabel,
  startExtra: (account) => ({ companyName: account.companyName }),
};

export default function Onboarding() {
  return <OnboardingFlow flow={FLOW} />;
}
