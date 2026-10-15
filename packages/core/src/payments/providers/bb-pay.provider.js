import { PaymentProvider, NO_CAPABILITIES } from '../PaymentProvider.js';
import { FinancialError } from '../errors.js';
import { safeEqual } from '../../security/tokens.js';
import { unavailable } from '../../errors.js';
import { PAYMENTS_UNAVAILABLE_MESSAGE } from '../DisabledPaymentProvider.js';

/**
 * BB Pay (v2) — Banco do Brasil payment gateway, identified by a convênio.
 *
 * Webhook (Portal de Apoio ao Desenvolvedor BB, "Webhook BB Pay"): the bank
 * POSTs `{ codigoEvento, dadosEvento: { numeroConvenio, numeroSolicitacao,
 * numeroPagamento, valorOriginal, timestampPagamento, codigoTipoPagamento, … } }`
 * once a requested payment changes. codigoEvento: 1 pago, 2 devolvido,
 * 3 não autorizado, 4 contestado. It expects HTTP 200/201 and retries up to
 * 3 times otherwise.
 *
 * Authenticity: TLS ends at the PaaS edge, so the registered URL carries a
 * shared secret (?token=…) and the convênio must be ours. The amount is checked
 * against our own charge by PaymentService before anything is confirmed.
 *
 * Creating a payment request (solicitação) is not implemented until the BB Pay
 * v2 API reference is in hand: no charge is ever faked.
 */
export const BB_PAY_EVENT_STATUS = Object.freeze({ 1: 'CONFIRMED', 2: 'REFUNDED', 3: 'FAILED', 4: 'CONTESTED' });

const toCents = (v) => (v == null || v === '' ? null : Math.round(Number(v) * 100));

/** BB sends local Brasília time without an offset ("2022-02-23T13:02:55.00000"). */
function brTime(v) {
  if (!v) return null;
  const s = String(v);
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(/(\.\d{3})\d+$/, '$1')}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export class BbPayPaymentProvider extends PaymentProvider {
  name = 'bb_pay';
  label = 'Banco do Brasil · BB Pay';

  constructor({ bbPay }) {
    super();
    this.cfg = bbPay;
    this.isSandbox = bbPay.environment !== 'production';
  }

  getCapabilities() {
    const reasons = {};
    const webhookReady = Boolean(this.cfg.webhookSecret && this.cfg.convenio);
    if (!this.cfg.webhookSecret) reasons.pixWebhook = 'BB_WEBHOOK_SECRET ausente.';
    else if (!this.cfg.convenio) reasons.pixWebhook = 'BB_PAY_CONVENIO ausente.';
    reasons.pix = 'Criação de cobrança BB Pay aguardando a especificação da API (solicitação de pagamento).';
    for (const k of Object.keys(NO_CAPABILITIES)) if (k !== 'pixWebhook' && !reasons[k]) reasons[k] = 'Não disponível pelo BB Pay nesta versão.';
    return { capabilities: { ...NO_CAPABILITIES, pixWebhook: webhookReady }, reasons };
  }

  async createPixCharge() {
    throw unavailable(PAYMENTS_UNAVAILABLE_MESSAGE);
  }

  async getPaymentStatus() {
    throw unavailable(PAYMENTS_UNAVAILABLE_MESSAGE);
  }

  validateWebhook({ query = {}, headers = {} }) {
    const token = query.token || headers['x-autopix-webhook-token'];
    if (!this.cfg.webhookSecret || !token || !safeEqual(String(token), this.cfg.webhookSecret)) {
      throw new FinancialError('WEBHOOK_INVALID', { detail: 'bad or missing webhook token' });
    }
    return true;
  }

  async handleWebhook(req) {
    this.validateWebhook(req);
    const body = req.body || {};
    const d = body.dadosEvento;
    const status = BB_PAY_EVENT_STATUS[Number(body.codigoEvento)];
    if (!status || !d || d.numeroSolicitacao == null) {
      const err = new FinancialError('WEBHOOK_INVALID', { detail: 'malformed payload' });
      err.status = 400;
      throw err;
    }
    if (!this.cfg.convenio || String(d.numeroConvenio) !== String(this.cfg.convenio)) {
      throw new FinancialError('WEBHOOK_INVALID', { detail: 'convenio mismatch' });
    }
    return [
      {
        providerEventId: `bbpay:${d.numeroSolicitacao}:${d.numeroPagamento ?? '-'}:${body.codigoEvento}`,
        providerPaymentId: String(d.numeroSolicitacao),
        type: `bbpay.event.${body.codigoEvento}`,
        status,
        paidAt: status === 'CONFIRMED' ? brTime(d.timestampPagamento) : null,
        amountCents: toCents(d.valorOriginal),
        // Never the payer's name or document: only what reconciliation needs.
        payload: {
          codigoEvento: Number(body.codigoEvento),
          numeroPagamento: d.numeroPagamento ?? null,
          codigoEstadoPagamento: d.codigoEstadoPagamento ?? null,
          codigoTipoPagamento: d.codigoTipoPagamento ?? null,
          valorLiquidoRecebedor: d.valorLiquidoRecebedor ?? null,
          dataRepasse: d.dataRepasse ?? null,
          e2eId: d.e2eId ?? null,
        },
      },
    ];
  }
}
