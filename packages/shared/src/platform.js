// Platform vocabulary shared by every client (web/PWA, WhatsApp, native).

export const DOMAIN_EVENTS = {
  OPPORTUNITY_CREATED: { category: 'OPPORTUNITIES', title: 'Nova oportunidade' },
  OPPORTUNITY_HIGH_PRIORITY: { category: 'OPPORTUNITIES', title: 'Oportunidade de alta prioridade' },
  OPPORTUNITY_UPDATED: { category: 'OPPORTUNITIES', title: 'Oportunidade atualizada', silent: true },
  FREIGHT_REQUEST_CREATED: { category: 'FREIGHT', title: 'Busca de carga criada', silent: true },
  FREIGHT_MATCH_CREATED: { category: 'FREIGHT', title: 'Nova carga compatível' },
  RETURN_LOAD_FOUND: { category: 'FREIGHT', title: 'Carga de retorno encontrada' },
  FREIGHT_MATCH_UPDATED: { category: 'FREIGHT', title: 'Carga atualizada', silent: true },
  DRIVER_ARRIVED: { category: 'FREIGHT', title: 'Motorista chegou' },
  WORKFORCE_DEMAND_CREATED: { category: 'WORKFORCE', title: 'Demanda de equipe criada', silent: true },
  WORKFORCE_MATCH_CREATED: { category: 'WORKFORCE', title: 'Profissional compatível' },
  WORKFORCE_MATCH_UPDATED: { category: 'WORKFORCE', title: 'Profissional atualizado', silent: true },
  SERVICE_COMPLETED: { category: 'PAYMENTS', title: 'Serviço concluído' },
  PAYMENT_CREATED: { category: 'PAYMENTS', title: 'Pix gerado' },
  PAYMENT_RECEIVED: { category: 'PAYMENTS', title: 'Pagamento recebido' },
  PAYMENT_PROTECTED: { category: 'PAYMENTS', title: 'Pagamento protegido' },
  PAYMENT_RELEASE_REQUESTED: { category: 'PAYMENTS', title: 'Liberação solicitada' },
  PAYMENT_RELEASED: { category: 'PAYMENTS', title: 'Pagamento liberado' },
  PAYMENT_REFUNDED: { category: 'PAYMENTS', title: 'Pagamento estornado' },
  PAYMENT_DISPUTED: { category: 'PAYMENTS', title: 'Disputa aberta' },
  AGENT_ERROR: { category: 'AGENTS', title: 'Erro em agente' },
  AGENTS_PAUSED: { category: 'AGENTS', title: 'Agentes pausados', silent: true },
  AGENTS_STARTED: { category: 'AGENTS', title: 'Agentes iniciados', silent: true },
  WHATSAPP_LINKED: { category: 'SYSTEM', title: 'WhatsApp conectado' },
  SENSITIVE_ACTION_REQUESTED: { category: 'SYSTEM', title: 'Confirmação necessária' },
};

export const NOTIFICATION_CHANNELS = ['IN_APP', 'WHATSAPP', 'EMAIL', 'PUSH'];
export const NOTIFICATION_CHANNEL_LABELS = { IN_APP: 'No app', WHATSAPP: 'WhatsApp', EMAIL: 'E-mail', PUSH: 'Push' };
export const NOTIFICATION_CATEGORIES = ['OPPORTUNITIES', 'FREIGHT', 'WORKFORCE', 'PAYMENTS', 'SYSTEM', 'AGENTS'];
export const NOTIFICATION_CATEGORY_LABELS = {
  OPPORTUNITIES: 'Oportunidades',
  FREIGHT: 'Cargas',
  WORKFORCE: 'Equipes',
  PAYMENTS: 'Pagamentos',
  SYSTEM: 'Sistema',
  AGENTS: 'Agentes',
};

/** Defaults when the user never touched a preference. */
export function defaultPreference(channel, category) {
  if (channel === 'IN_APP') return true;
  if (channel === 'PUSH') return category !== 'AGENTS';
  if (channel === 'WHATSAPP') return ['OPPORTUNITIES', 'FREIGHT', 'WORKFORCE', 'PAYMENTS'].includes(category);
  if (channel === 'EMAIL') return ['PAYMENTS', 'SYSTEM'].includes(category);
  return false;
}

/** WhatsApp decision buttons → ActionEngine actions (per entity kind). */
export const WHATSAPP_DECISIONS = {
  ANALISAR: { opportunity: 'ANALYZE_OPPORTUNITY' },
  ABORDAR: { opportunity: 'CONTACT_OPPORTUNITY' },
  DESCARTAR: { opportunity: 'ARCHIVE_OPPORTUNITY', freight: 'REJECT_FREIGHT_MATCH', workforce: 'REJECT_PROFESSIONAL' },
  'TENHO INTERESSE': { opportunity: 'MARK_OPPORTUNITY_INTERESTED', freight: 'ACCEPT_FREIGHT_MATCH' },
  'VER ROTA': { freight: null },
  CONVIDAR: { workforce: 'INVITE_PROFESSIONAL' },
  RECUSAR: { freight: 'REJECT_FREIGHT_MATCH', workforce: 'REJECT_PROFESSIONAL' },
  'ABRIR AUTOPIX': {},
};

/** App-safe deep links (no tokens). */
export const deepLinks = {
  opportunity: (id) => `/app/opportunities/${id}`,
  freightMatch: (id) => `/app/freight/matches/${id}`,
  workforceMatch: (id) => `/app/workforce/matches/${id}`,
  payment: (id) => `/app/payments/${id}`,
  challenge: (id) => `/app/confirm/${id}`,
};

export const PROTECTION_STATUS_LABELS = {
  NONE: '—',
  HELD: 'Protegido',
  RELEASE_REQUESTED: 'Liberação solicitada',
  RELEASED: 'Liberado',
  DISPUTED: 'Em disputa',
  REFUNDED: 'Estornado',
};
