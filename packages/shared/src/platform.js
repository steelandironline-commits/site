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
  WORKFORCE_HIRE_AGREED: { category: 'WORKFORCE', title: 'Contratação registrada', silent: true },
  WORKFORCE_MATCH_UPDATED: { category: 'WORKFORCE', title: 'Profissional atualizado', silent: true },
  SERVICE_STARTED: { category: 'PAYMENTS', title: 'Serviço iniciado', silent: true },
  SERVICE_COMPLETED: { category: 'PAYMENTS', title: 'Prestador informou conclusão' },
  SERVICE_CONFIRMED: { category: 'PAYMENTS', title: 'Cliente confirmou a conclusão' },
  TRANSACTION_CREATED: { category: 'PAYMENTS', title: 'Negócio criado', silent: true },
  PAYMENT_CREATED: { category: 'PAYMENTS', title: 'Cobrança TemPix criada' },
  PAYMENT_RECEIVED: { category: 'PAYMENTS', title: 'Pix recebido' },
  PAYMENT_EXPIRED: { category: 'PAYMENTS', title: 'Pix expirado' },
  PAYMENT_CANCELLED: { category: 'PAYMENTS', title: 'Cobrança cancelada' },
  PAYMENT_REFUNDED: { category: 'PAYMENTS', title: 'Reembolso concluído' },
  REFUND_REQUESTED: { category: 'PAYMENTS', title: 'Reembolso solicitado', silent: true },
  REFUND_COMPLETED: { category: 'PAYMENTS', title: 'Reembolso concluído', silent: true },
  PAYOUT_CREATED: { category: 'PAYMENTS', title: 'Repasse solicitado ao parceiro financeiro' },
  PAYOUT_CONFIRMED: { category: 'PAYMENTS', title: 'Repasse confirmado' },
  SPLIT_PROCESSED: { category: 'PAYMENTS', title: 'Divisão do pagamento processada' },
  PROTECTED_PAYMENT_CREATED: { category: 'PAYMENTS', title: 'Pagamento protegido' },
  PROTECTED_PAYMENT_RELEASE_REQUESTED: { category: 'PAYMENTS', title: 'Pagamento pronto para liberação' },
  PROTECTED_PAYMENT_RELEASED: { category: 'PAYMENTS', title: 'Pagamento liberado' },
  PROTECTED_PAYMENT_DISPUTED: { category: 'PAYMENTS', title: 'Disputa aberta' },
  DISPUTE_OPENED: { category: 'PAYMENTS', title: 'Disputa aberta' },
  DISPUTE_UPDATED: { category: 'PAYMENTS', title: 'Disputa atualizada', silent: true },
  DISPUTE_RESOLVED: { category: 'PAYMENTS', title: 'Disputa resolvida' },
  RECONCILIATION_ISSUE: { category: 'SYSTEM', title: 'Divergência financeira', silent: true },
  DRIVER_EN_ROUTE_PICKUP: { category: 'FREIGHT', title: 'Motorista a caminho da coleta' },
  DRIVER_ARRIVED_PICKUP: { category: 'FREIGHT', title: 'Motorista chegou à coleta' },
  CARGO_LOADED: { category: 'FREIGHT', title: 'Carga carregada' },
  TRIP_STARTED: { category: 'FREIGHT', title: 'Viagem iniciada', silent: true },
  NEAR_DESTINATION: { category: 'FREIGHT', title: 'Transporte próximo ao destino' },
  DRIVER_ARRIVED_DESTINATION: { category: 'FREIGHT', title: 'O transporte chegou ao destino' },
  DELIVERY_CONFIRMED: { category: 'FREIGHT', title: 'Entrega confirmada' },
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
  'ABRIR TEMPIX': {},
  // Buttons sent before the rename to TemPix still carry the old label.
  'ABRIR AUTOPIX': {},
};

/** App-safe deep links (no tokens). */
export const deepLinks = {
  opportunity: (id) => `/app/opportunities/${id}`,
  freightMatch: (id) => `/app/freight/matches/${id}`,
  workforceMatch: (id) => `/app/workforce/matches/${id}`,
  payment: (id) => `/app/payments/${id}`,
  transaction: (id) => `/app/pay/transactions/${id}`,
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

/** TemPix Pay transaction statuses (pt-BR). */
export const TRANSACTION_STATUS_LABELS = {
  DRAFT: 'Rascunho',
  AWAITING_PAYMENT: 'Aguardando pagamento',
  PAID: 'Pago',
  PROTECTED: 'Pagamento protegido',
  READY_TO_RELEASE: 'Pronto para liberação',
  RELEASED: 'Liberado',
  REFUNDED: 'Reembolsado',
  DISPUTED: 'Em disputa',
  CANCELLED: 'Cancelado',
};

/**
 * How a transaction appears on the Pagamentos screens: four customer states
 * (Pago, Aguardando conclusão, Em disputa, Liberado) plus the two real endings.
 * The internal status stays as it is; only the words change.
 */
export const TRANSACTION_UI_STATE = {
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
  AWAITING_PAYMENT: { label: 'Aguardando pagamento', tone: 'amber' },
  PAID: { label: 'Pago', tone: 'revenue' },
  READY_TO_RELEASE: { label: 'Pago', tone: 'amber', detail: 'Conclusão confirmada. Liberação em andamento.' },
  PROTECTED: { label: 'Aguardando conclusão', tone: 'primary' },
  DISPUTED: { label: 'Em disputa', tone: 'danger' },
  RELEASED: { label: 'Liberado', tone: 'revenue' },
  REFUNDED: { label: 'Reembolsado', tone: 'info' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
};

/** Name of the TemPix fee, as the customer reads it: intermediation, with its rate. */
export const commissionLabel = (bps) => `Comissão de intermediação TemPix${bps != null ? ` (${(bps / 100).toLocaleString('pt-BR')}%)` : ''}`;

export const TRANSACTION_TYPE_LABELS = { SALES: 'Venda', FREIGHT: 'Frete', WORKFORCE: 'Mão de obra', SERVICE: 'Serviço', SUBSCRIPTION: 'Assinatura' };

export const SETTLEMENT_STATUS_LABELS = {
  NOT_APPLICABLE: '—',
  HELD_BY_PROVIDER: 'Retido pelo parceiro financeiro',
  SPLIT_PENDING: 'Divisão pendente',
  SPLIT_PROCESSING: 'Divisão em processamento',
  PAYOUT_PENDING: 'Repasse pendente',
  PAYOUT_PROCESSING: 'Repasse em processamento',
  PAYOUT_COMPLETED: 'Repasse concluído',
  PENDING_PROVIDER_CAPABILITY: 'Repasse manual pendente (parceiro sem split/repasse)',
  RELEASING: 'Liberando…',
  RELEASE_FAILED: 'Falha na liberação',
  REFUNDED: 'Reembolsado',
};

/** Checkout states exposed to clients. */
export const CHECKOUT_STATES = ['CREATED', 'WAITING_PAYMENT', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED', 'ERROR'];
export function checkoutState(payment) {
  if (!payment) return 'CREATED';
  switch (payment.status) {
    case 'PENDING':
      return payment.pixCopyPaste ? 'WAITING_PAYMENT' : 'CREATED';
    case 'CONFIRMED':
      return 'PAID';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'CANCELED':
      return 'CANCELLED';
    case 'REFUNDED':
      return 'REFUNDED';
    case 'FAILED':
      // Paid from an account other than the company's CNPJ: refused and given back.
      return String(payment.failureCode || '').startsWith('PAYER_MISMATCH') ? 'PAYER_MISMATCH' : 'ERROR';
    default:
      return 'ERROR';
  }
}

