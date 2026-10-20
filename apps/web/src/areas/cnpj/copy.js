// Textos da área de empresas para as telas que as duas áreas dividem (as telas pedem a cópia por
// props; nenhuma tem texto de área no próprio arquivo). Só vocabulário de empresa.
// A cópia da outra área está em ../cpf/copy.js e nunca entra neste build.
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY_LABELS, formatDocument } from '@autopix/shared';
import { opportunityLink } from '../../lib/opportunityLink.js';
import { AREA_NAME } from '@autopix/areas/brand/cnpj';

export const COPY = {
  login: {
    subtitle: 'Acompanhe as oportunidades que seus agentes encontraram.',
    identifier: {
      label: 'CNPJ',
      // O dono da empresa entra com o CNPJ; o colaborador, com o próprio CPF (ele é da empresa, não tem conta de pessoa).
      hint: 'A empresa entra com o CNPJ. Colaboradores entram com o próprio CPF.',
      placeholder: '00.000.000/0000-00',
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
    emptyNote: 'Depois que o cliente confirmar a conclusão de um serviço pela tela de Pagamentos, você poderá compartilhar sua opinião e uma foto. Também vale para contratos do seu histórico.',
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

/** Página inicial da área de empresas: só o cadastro de empresa, uma vez, sem mensalidade. */
export const LANDING = {
  title: `${AREA_NAME} — Tem cliente, tem carga, tem serviço`,
  priceLead: (fee) =>
    `Sua empresa paga só um cadastro, uma única vez. Depois, o ${AREA_NAME} só ganha quando você ganha: ${fee} dos valores intermediados com sucesso.`,
  finalSub: 'Empresa paga só o cadastro, uma vez · sem mensalidade',
  finalSlogan: { lead: 'Tem cliente, tem carga, tem serviço. ', accent: 'Tem CNPJ.' },
  footerLine: `${AREA_NAME}. Tem cliente, tem carga, tem serviço.`,
  disclaimer: 'Tem CNPJ não tem vínculo com a Receita Federal.',
  products: { payment: 'Pagamentos', maritime: 'Marítimo' },
};

/** Frases de telas que as duas áreas dividem e que citam o módulo de pagamentos (a tela recebe esta cópia). */
export const PAGES = {
  intermediation: { payments: { before: 'Os pagamentos seguem pela tela de ', label: 'Pagamentos', after: '.' } },
  workforce: {
    hiringFeeNote: ' A taxa é aplicada na tela de Pagamentos após a conclusão confirmada.',
    feeRule: 'Informe o salário mensal acordado. A taxa de 2% será aplicada ao valor intermediado com sucesso pela tela de Pagamentos. Registrar o acordo não gera cobrança.',
  },
};
