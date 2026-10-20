// Textos do build legado (src/App.jsx e src/main.jsx), que convive com os builds de área até o go-live.
// Reproduz, palavra por palavra, o que as telas sempre disseram: uma só cópia para as duas contas,
// com o vocabulário de empresa e de pessoa juntos. Os builds de área têm a sua em areas/<área>/copy.js.
// Este arquivo sai junto com o build legado. Teste: test/copy.test.js compara o formato das três cópias.
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY_LABELS, formatDocument } from '@autopix/shared';
import { opportunityLink } from '../lib/opportunityLink.js';

export const COPY = {
  login: {
    subtitle: 'Acompanhe as oportunidades que seus agentes encontraram.',
    identifier: {
      label: 'CPF ou CNPJ',
      hint: 'Empresas e MEI entram com o CNPJ. Pessoa física e colaboradores, com o CPF.',
      placeholder: '000.000.000-00 ou 00.000.000/0000-00',
      mask: formatDocument,
    },
  },
  activate: {
    invalidHelp: 'Links de verificação são de uso único e expiram em 48 horas. Se você esperava esta mensagem, volte ao cadastro ou ao checkout para reenviar o link.',
  },
  layout: {
    offline: 'Seus agentes continuam trabalhando no servidor. Reconecte para ver as novidades.',
  },
  activity: {
    subtitle: 'Tudo o que seus agentes fizeram, em ordem cronológica.',
    empty: 'Os eventos aparecem aqui assim que os agentes começam a trabalhar.',
    filters: [
      { key: '', label: 'All' },
      { key: 'SEARCH', label: 'Search' },
      { key: 'RESEARCH', label: 'Research' },
      { key: 'SIGNAL', label: 'Signals' },
      { key: 'OPPORTUNITY', label: 'Opportunities' },
      { key: 'AGENT', label: 'Agents' },
      { key: 'SYSTEM', label: 'System' },
    ],
    eventLink: opportunityLink,
  },
  social: {
    emptyNote: 'Depois que o cliente confirmar a conclusão de um serviço no TemPix Pay, você poderá compartilhar sua opinião e uma foto. Também vale para contratos do seu histórico.',
    emptyAction: { to: '/app/pay', label: 'Ver meus contratos' },
  },
  confirm: {
    afterConfirm: (result) => (result?.payment?.id ? `/app/payments/${result.payment.id}` : '/app'),
  },
  operations: {
    subtitle: 'O que sua empresa faz, possui, fornece e compra. É isso que decide quais oportunidades chegam até você.',
  },
  settings: {
    whatsapp: {
      verified: 'Receba oportunidades com botões (ANALISAR, ABORDAR, DESCARTAR) e envie comandos como “gere um Pix de 1400”. Ações financeiras sempre pedem confirmação no app.',
    },
    notificationCategories: NOTIFICATION_CATEGORIES.map((key) => ({ key, label: NOTIFICATION_CATEGORY_LABELS[key] })),
    environment: {
      demo: 'Modo demonstração ativo: empresas e oportunidades são fictícias (domínios .example).',
      production: 'Modo produção: somente atividades e oportunidades reais, registradas pelos agentes.',
    },
  },
};

/** Página inicial: o preço fala dos dois cadastros. */
export const LANDING = {
  title: 'TemPix — Tem emprego, tem rota, tem serviço',
  priceLead: (fee) =>
    `Profissional entra grátis. Empresa paga só um cadastro, uma única vez. Depois, o TemPix só ganha quando você ganha: ${fee} dos valores intermediados com sucesso.`,
  finalSub: 'Profissional entra grátis · empresa paga só o cadastro, uma vez · sem mensalidade',
  finalSlogan: { lead: 'Tem emprego, tem rota, tem serviço. ', accent: 'TemPix.' },
  footerLine: 'TemPix. Tem emprego, tem rota, tem serviço.',
  disclaimer: null,
  products: { payment: 'TemPix Pay', maritime: 'TemPix Marítimo' },
};

/** Frases das telas compartilhadas que citam o módulo de pagamentos: o legado mantém o texto de sempre. */
export const PAGES = {
  intermediation: { payments: { before: 'Pagamentos seguem pelo ', label: 'TemPix Pay', after: '.' } },
  workforce: {
    hiringFeeNote: ' A taxa é aplicada no TemPix Pay após a conclusão confirmada.',
    feeRule: 'Informe o salário mensal acordado. A taxa de 2% será aplicada ao valor intermediado com sucesso pelo TemPix Pay. Registrar o acordo não gera cobrança.',
  },
};
