// Product-wide constants shared by web, api and worker.

export const PLAN = Object.freeze({
  code: 'AUTOPIX',
  name: 'AutoPix',
  priceCents: 59700,
  currency: 'BRL',
  intervalDays: 30,
  features: [
    'Monitoramento comercial',
    'Oportunidades',
    'Pesquisa empresarial',
    'Detecção de sinais',
    'Opportunity Score',
    'Painel comercial',
    'Atividades em tempo real',
    'Sugestões de abordagem',
    'Histórico',
    'Atualizações',
  ],
});

export const OPPORTUNITY_STATUSES = [
  'NEW',
  'RESEARCHING',
  'CONTACTED',
  'INTERESTED',
  'PROPOSAL',
  'WON',
  'LOST',
  'ARCHIVED',
];

export const OPPORTUNITY_STATUS_LABELS = {
  NEW: 'Nova',
  RESEARCHING: 'Em análise',
  CONTACTED: 'Em contato',
  INTERESTED: 'Interessado',
  PROPOSAL: 'Proposta',
  WON: 'Ganha',
  LOST: 'Perdida',
  ARCHIVED: 'Arquivada',
};

export const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'];
export const PRIORITY_LABELS = { HIGH: 'Alta', MEDIUM: 'Média', LOW: 'Baixa' };

export const ACTIVITY_TYPES = ['SEARCH', 'RESEARCH', 'SIGNAL', 'OPPORTUNITY', 'AGENT', 'SYSTEM', 'PAYMENT'];
export const ACTIVITY_TYPE_LABELS = {
  SEARCH: 'Busca',
  RESEARCH: 'Pesquisa',
  SIGNAL: 'Sinais',
  OPPORTUNITY: 'Oportunidades',
  AGENT: 'Agentes',
  SYSTEM: 'Sistema',
  PAYMENT: 'Pagamento',
};

export const SEVERITIES = ['INFO', 'SUCCESS', 'WARNING', 'ERROR'];

export const SIGNAL_TYPES = ['EXPANSION', 'HIRING', 'CONSTRUCTION', 'PURCHASE', 'NEW_PROJECT', 'DEMAND'];
export const SIGNAL_TYPE_LABELS = {
  EXPANSION: 'Expansão',
  HIRING: 'Contratações',
  CONSTRUCTION: 'Obras',
  PURCHASE: 'Compras',
  NEW_PROJECT: 'Novo projeto',
  DEMAND: 'Demanda',
};

export const AGENTS = [
  {
    key: 'RADAR',
    name: 'Radar Agent',
    title: 'RADAR AGENT',
    description: 'Procura empresas e oportunidades compatíveis com o seu perfil.',
  },
  {
    key: 'RESEARCH',
    name: 'Research Agent',
    title: 'RESEARCH AGENT',
    description: 'Pesquisa as empresas encontradas em fontes públicas.',
  },
  {
    key: 'SIGNAL',
    name: 'Signal Agent',
    title: 'SIGNAL AGENT',
    description: 'Detecta sinais comerciais: expansão, obras, compras, contratações.',
  },
  {
    key: 'SCORING',
    name: 'Scoring Agent',
    title: 'SCORING AGENT',
    description: 'Calcula a compatibilidade comercial de cada oportunidade.',
  },
  {
    key: 'SALES',
    name: 'Sales Intelligence',
    title: 'SALES INTELLIGENCE',
    description: 'Cria recomendações de abordagem comercial.',
  },
];

export const AGENT_STATUSES = ['ACTIVE', 'IDLE', 'RUNNING', 'ERROR', 'PAUSED'];

export const SUBSCRIPTION_STATUS_LABELS = {
  PENDING: 'Aguardando pagamento',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Renovação pendente',
  CANCELED: 'Cancelada',
  EXPIRED: 'Expirada',
};

export const PAYMENT_STATUS_LABELS = {
  PENDING: 'Aguardando pagamento',
  CONFIRMED: 'Pagamento confirmado',
  FAILED: 'Pagamento falhou',
  EXPIRED: 'Cobrança expirada',
  REFUNDED: 'Reembolsado',
  CANCELED: 'Cancelado',
};

export const BR_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export const INDUSTRY_SUGGESTIONS = [
  'Indústria',
  'Metalurgia',
  'Construção civil',
  'Logística',
  'Agronegócio',
  'Alimentos e bebidas',
  'Varejo',
  'Saúde',
  'Educação',
  'Tecnologia',
  'Energia',
  'Mineração',
  'Automotivo',
  'Hotelaria',
  'Condomínios',
  'Setor público',
];
