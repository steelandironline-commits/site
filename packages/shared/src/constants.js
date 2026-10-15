// Product-wide constants shared by web, api and worker.

/**
 * TemPix's commission on each contract closed between the parties, by contract
 * value. The rate steps down one tier each time the value grows by an order of
 * magnitude. Bounds are inclusive, in cents. Edit here only (CommissionService
 * reads this table; nothing else hardcodes the rate).
 */
export const COMMISSION_TIERS = Object.freeze([
  { maxCents: 1_000_000, rateBps: 500, label: 'até R$ 10.000' },
  { maxCents: 10_000_000, rateBps: 400, label: 'de R$ 10.000,01 a R$ 100.000' },
  { maxCents: 100_000_000, rateBps: 300, label: 'de R$ 100.000,01 a R$ 1.000.000' },
  { maxCents: Infinity, rateBps: 200, label: 'acima de R$ 1.000.000' },
]);

/** Commission rate (basis points) for a contract of `grossCents`. */
export function commissionRateBps(grossCents) {
  return COMMISSION_TIERS.find((t) => grossCents <= t.maxCents).rateBps;
}

/**
 * How TemPix earns: no subscription. A commission on every contract closed
 * between the parties (cargas, rotas, obras, serviços, vagas), by value tier.
 */
export const PRICING = Object.freeze({
  model: 'commission',
  commissionTiers: COMMISSION_TIERS,
  commissionLabel: '5% a 2%, conforme o valor do contrato',
  /** One-time signup fee for companies (CNPJ). Professionals sign up free. */
  companySignupFeeCents: 20000,
  person: [
    'Cadastro grátis; para ir à entrevista, só R$ 1,00',
    'Receba vagas, serviços e fretes da sua região',
    'Pagamento assegurado até a conclusão',
    'Receba por Pix direto na sua conta',
    'Avisos no WhatsApp e no celular',
  ],
  company: [
    'Taxa única de cadastro: paga uma vez, sem mensalidade',
    'Login pelo CNPJ (MEI também) e acesso para colaboradores',
    'Clientes, cargas e profissionais para a sua empresa',
    'Pagamento assegurado até a conclusão',
    'Cobrança e recebimento por Pix',
    'Rotas, entregas e contratações no painel',
    'Alertas no WhatsApp e painel no celular',
  ],
});

/** Plan code stored on the account-access record in the commission model. */
export const COMMISSION_PLAN_CODE = 'COMMISSION';

export const ACCOUNT_TYPES = ['COMPANY', 'PERSON'];
export const ACCOUNT_TYPE_LABELS = { COMPANY: 'Empresa', PERSON: 'Profissional' };

export const PLAN = Object.freeze({
  code: 'AUTOPIX',
  name: 'TemPix',
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
    name: 'Agente Radar',
    title: 'AGENTE RADAR',
    description: 'Procura empresas e oportunidades compatíveis com o seu perfil.',
  },
  {
    key: 'RESEARCH',
    name: 'Agente de Pesquisa',
    title: 'AGENTE DE PESQUISA',
    description: 'Pesquisa as empresas encontradas em fontes públicas.',
  },
  {
    key: 'SIGNAL',
    name: 'Agente de Sinais',
    title: 'AGENTE DE SINAIS',
    description: 'Detecta sinais comerciais: expansão, obras, compras, contratações.',
  },
  {
    key: 'SCORING',
    name: 'Agente de Pontuação',
    title: 'AGENTE DE PONTUAÇÃO',
    description: 'Calcula a compatibilidade comercial de cada oportunidade.',
  },
  {
    key: 'SALES',
    name: 'Inteligência Comercial',
    title: 'INTELIGÊNCIA COMERCIAL',
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
