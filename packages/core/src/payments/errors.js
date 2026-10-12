import { AppError } from '../errors.js';

/**
 * Internal financial error codes. Customer-facing messages are pt-BR and
 * never contain provider/bank raw errors; technical detail goes to logs.
 */
export const FINANCIAL_ERRORS = {
  PROVIDER_AUTH_FAILED: { status: 503, message: 'O parceiro financeiro está indisponível no momento. Tente novamente em instantes.' },
  PIX_CREATE_FAILED: { status: 503, message: 'Não foi possível gerar o Pix. Tente novamente em instantes.' },
  PIX_NOT_FOUND: { status: 404, message: 'Cobrança Pix não encontrada.' },
  WEBHOOK_INVALID: { status: 401, message: 'Notificação inválida.' },
  PAYMENT_ALREADY_PROCESSED: { status: 409, message: 'Este pagamento já foi processado.' },
  SPLIT_NOT_SUPPORTED: { status: 409, message: 'A divisão automática de valores não está habilitada com o parceiro financeiro.' },
  PAYOUT_NOT_SUPPORTED: { status: 409, message: 'Repasses não estão habilitados com o parceiro financeiro.' },
  PROTECTED_FLOW_NOT_SUPPORTED: { status: 409, message: 'O pagamento protegido não está habilitado com o parceiro financeiro.' },
  REFUND_FAILED: { status: 503, message: 'Não foi possível solicitar o reembolso agora.' },
  RATE_LIMITED: { status: 503, message: 'Muitas solicitações ao parceiro financeiro. Tente novamente em instantes.' },
  PROVIDER_UNAVAILABLE: { status: 503, message: 'O parceiro financeiro está indisponível no momento. Tente novamente em instantes.' },
  PROVIDER_CAPABILITY_NOT_AVAILABLE: { status: 409, message: 'Esta operação não está habilitada com o parceiro financeiro.' },
  AMOUNT_MISMATCH: { status: 409, message: 'O valor recebido não confere com a cobrança. O caso foi enviado para revisão.' },
};

export class FinancialError extends AppError {
  /**
   * @param {keyof FINANCIAL_ERRORS} code
   * @param {object} [opts] { detail (technical, logs only), retryable, providerStatus, capability }
   */
  constructor(code, opts = {}) {
    const def = FINANCIAL_ERRORS[code] || FINANCIAL_ERRORS.PROVIDER_UNAVAILABLE;
    super(def.status, code, def.message);
    this.name = 'FinancialError';
    this.detail = opts.detail;
    this.retryable = Boolean(opts.retryable);
    this.providerStatus = opts.providerStatus;
    this.capability = opts.capability;
  }
}

export const capabilityError = (capability, detail) =>
  new FinancialError('PROVIDER_CAPABILITY_NOT_AVAILABLE', { capability, detail });

/**
 * Exponential backoff for operations that are SAFE to repeat: reads, token
 * requests, and writes keyed by an idempotency key (e.g. BACEN `PUT /cob/{txid}`).
 * Never use for non-idempotent money movement.
 */
export async function withRetry(fn, { retries = 3, baseMs = 200, maxMs = 3000, shouldRetry = (e) => e?.retryable, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      const delay = Math.min(maxMs, baseMs * 2 ** attempt) * (0.75 + Math.random() * 0.5);
      attempt += 1;
      await sleep(delay);
    }
  }
}
