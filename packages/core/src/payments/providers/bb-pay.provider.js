import tls from 'node:tls';
import QRCode from 'qrcode';
import { PaymentProvider, NO_CAPABILITIES } from '../PaymentProvider.js';
import { FinancialError, withRetry } from '../errors.js';
import { BancoDoBrasilAuthService } from './banco-do-brasil.auth.js';
import { createMtlsFetch, networkReason } from './http.js';
import { safeEqual } from '../../security/tokens.js';
import { logger } from '../../logger.js';

/**
 * BB Pay (v2) — Banco do Brasil payment gateway, identified by a convênio.
 * Reference: Portal de Apoio ao Desenvolvedor BB, API "BB Pay" v2
 * (apoio.developers.bb.com.br/apis/41?versaoApi=2), topics "Especificações e
 * testes" and "Webhook".
 *
 *  - POST {base}/solicitacoes creates a payment request; with formasPagamento
 *    PIX the response carries informacoesPix.textoQrCode (copia e cola).
 *  - GET {base}/solicitacoes?numeroConvenio&codigoConciliacaoSolicitacao lists
 *    it back with codigoEstadoSolicitacao (0 aguardando, 1 paga, 800 expirada,
 *    850 abandonada, 900 excluída).
 *  - Webhook `{ codigoEvento, dadosEvento }`: 1 pago, 2 devolvido,
 *    3 não autorizado, 4 contestado.
 *
 * Hosts are mTLS (checkout.mtls.api[.hm].bb.com.br): a client certificate is
 * required. OAuth is BB's client_credentials, app key as gw-dev-app-key.
 *
 * Our providerPaymentId is `${numeroSolicitacao}:${codigoConciliacao}`: the
 * webhook carries both, and the conciliation code is what the documented GET
 * filters on, so status can always be re-read from the bank.
 */
export const BB_PAY_EVENT_STATUS = Object.freeze({ 1: 'CONFIRMED', 2: 'REFUNDED', 3: 'FAILED', 4: 'CONTESTED' });
const REQUEST_STATUS = Object.freeze({ 0: 'PENDING', 1: 'CONFIRMED', 800: 'EXPIRED', 850: 'EXPIRED', 900: 'CANCELED' });

const toCents = (v) => (v == null || v === '' ? null : Math.round(Number(v) * 100));

/** Our reference sent to BB (alphanumeric, derived from our payment id). */
export const conciliationFor = (paymentId) => `TP${String(paymentId).replace(/[^a-zA-Z0-9]/g, '')}`.slice(0, 40);

export const providerIdFor = (numeroSolicitacao, conciliacao) => `${numeroSolicitacao}:${conciliacao}`;

function splitProviderId(id) {
  const [numero, conciliacao] = String(id).split(':');
  return { numero, conciliacao };
}

/** BB sends Brasília local time without an offset ("2022-02-23T13:02:55.00000"). */
function brTime(v) {
  if (!v) return null;
  const s = String(v);
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(/(\.\d{3})\d+$/, '$1')}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Deadline sent to BB, in UTC as in the BB Pay OpenAPI example ("2030-01-10T03:00:00Z"). */
export function bbTimestamp(date) {
  return `${new Date(date).toISOString().slice(0, 19)}Z`;
}

export class BbPayPaymentProvider extends PaymentProvider {
  name = 'bb_pay';
  label = 'Banco do Brasil · BB Pay';

  constructor({ bbPay, fetchImpl, now = () => Date.now(), sleep } = {}) {
    super();
    this.cfg = bbPay;
    this.isSandbox = bbPay.environment !== 'production';
    // Non-secret setup summary, so a misconfiguration shows in the logs at boot.
    if (!fetchImpl) {
      logger.info('bb pay configured', {
        environment: bbPay.environment,
        api: hostOf(bbPay.apiBaseUrl),
        oauth: hostOf(bbPay.oauthUrl),
        mtls: bbPay.mtls ? (bbPay.mtls.pfxBase64 ? 'pfx' : 'pem') : 'missing',
        certificate: bbPay.mtls ? checkIdentity(bbPay.mtls) : null,
        // The convênio number is an identifier (it comes in every webhook), not a secret.
        convenio: bbPay.convenio || null,
        scopes: bbPay.scopes || '(padrão do app)',
      });
    }
    this.fetch = fetchImpl || (bbPay.mtls ? createMtlsFetch(bbPay.mtls) : globalThis.fetch);
    this.now = now;
    this.sleep = sleep;
    this.auth = new BancoDoBrasilAuthService({
      clientId: bbPay.clientId,
      clientSecret: bbPay.clientSecret,
      oauthUrl: bbPay.oauthUrl,
      scopes: bbPay.scopes,
      fetchImpl: this.fetch,
      now,
      sleep,
    });
    // Returns (devoluções) use their own token: if the app has no permission for
    // them yet, creating and reading Pix keeps working.
    this.refundAuth = new BancoDoBrasilAuthService({
      clientId: bbPay.clientId,
      clientSecret: bbPay.clientSecret,
      oauthUrl: bbPay.oauthUrl,
      scopes: bbPay.refundScopes || 'checkout.devolucoes-requisicao',
      fetchImpl: this.fetch,
      now,
      sleep,
    });
  }

  /** What is missing to talk to the BB Pay API (empty when ready). */
  get missing() {
    const c = this.cfg;
    return [
      !c.convenio && 'BB_PAY_CONVENIO',
      !c.clientId && 'BB_CLIENT_ID',
      !c.clientSecret && 'BB_CLIENT_SECRET',
      !c.appKey && 'BB_DEVELOPER_APPLICATION_KEY',
      !c.mtls && 'BB_MTLS_PFX_BASE64 + BB_MTLS_PFX_PASSPHRASE (ou BB_MTLS_CERT_BASE64/BB_MTLS_KEY_BASE64)',
    ].filter(Boolean);
  }

  get apiReady() {
    return this.missing.length === 0;
  }

  getCapabilities() {
    const reasons = {};
    const webhookReady = Boolean(this.cfg.webhookSecret && this.cfg.convenio);
    if (!this.cfg.webhookSecret) reasons.pixWebhook = 'BB_WEBHOOK_SECRET ausente.';
    else if (!this.cfg.convenio) reasons.pixWebhook = 'BB_PAY_CONVENIO ausente.';
    if (!this.apiReady) {
      const why = `Credenciais BB Pay incompletas: ${this.missing.join(', ')}.`;
      reasons.pix = why;
      reasons.paymentStatus = why;
    }
    for (const k of Object.keys(NO_CAPABILITIES)) {
      if (!['pix', 'pixWebhook', 'paymentStatus', 'payerIdentity'].includes(k) && !reasons[k]) reasons[k] = 'Não disponível pelo BB Pay nesta versão.';
    }
    return {
      // The payment webhook carries the payer's CPF/CNPJ (tipoDocumentoPagador / numeroDocumentoPagador).
      capabilities: { ...NO_CAPABILITIES, pix: this.apiReady, paymentStatus: this.apiReady, pixWebhook: webhookReady, payerIdentity: webhookReady },
      reasons,
    };
  }

  // ------------------------------------------------------------------ http

  async #call(method, path, { query = {}, body, retry = true, auth = this.auth } = {}) {
    if (!this.apiReady) throw new FinancialError('PROVIDER_AUTH_FAILED', { detail: `missing: ${this.missing.join(', ')}` });
    const qs = new URLSearchParams({ ...query, [this.cfg.appKeyParam]: this.cfg.appKey }).toString();
    const url = `${this.cfg.apiBaseUrl}${path}?${qs}`;
    const exec = async () => {
      const token = await auth.getToken();
      let res;
      try {
        res = await this.fetch(url, {
          method,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(15_000),
        });
      } catch (err) {
        throw new FinancialError('PROVIDER_UNAVAILABLE', { detail: `${method} ${path}: ${networkReason(err)}`, retryable: true });
      }
      if (res.status === 401) {
        auth.invalidate();
        throw new FinancialError('PROVIDER_AUTH_FAILED', { providerStatus: 401, retryable: true });
      }
      if (res.status === 429) throw new FinancialError('RATE_LIMITED', { providerStatus: 429, retryable: true });
      if (res.status >= 500) throw new FinancialError('PROVIDER_UNAVAILABLE', { providerStatus: res.status, retryable: true });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Safe metadata only: status and the bank's error codes, never the request body.
        const erro = data?.erros?.[0] || data?.errors?.[0] || data;
        logger.warn('bb pay api rejected request', { method, path, status: res.status, codigo: erro?.codigo ?? erro?.code, mensagem: erro?.mensagem ?? erro?.message ?? erro?.detail });
        throw new FinancialError('PIX_CREATE_FAILED', { providerStatus: res.status, detail: erro?.mensagem || erro?.message || erro?.detail });
      }
      return data;
    };
    return retry ? withRetry(exec, { retries: 3, sleep: this.sleep }) : exec();
  }

  // ------------------------------------------------------------------- Pix

  async createPixCharge({ paymentId, amountCents, description, expiresAt }) {
    const conciliacao = conciliationFor(paymentId);
    const deadline = expiresAt ? new Date(expiresAt) : new Date(this.now() + 60 * 60 * 1000);
    // BB Pay v2 OpenAPI: request data goes inside "geral"; payment methods alongside it.
    const body = {
      geral: {
        numeroConvenio: Number(this.cfg.convenio),
        pagamentoUnico: true,
        timestampLimiteSolicitacao: bbTimestamp(deadline),
        valorSolicitacao: Number((amountCents / 100).toFixed(2)),
        codigoConciliacaoSolicitacao: conciliacao,
        descricaoSolicitacao: String(description || 'TemPix').slice(0, 140),
      },
      formasPagamento: [{ codigoTipoPagamento: 'PIX', quantidadeParcelas: 1 }],
    };
    let res;
    try {
      // Not idempotent at the bank: never retried. A failure marks our charge
      // FAILED; a request that did reach BB expires at its own deadline unpaid.
      res = await this.#call('POST', '/solicitacoes', { body, retry: false });
    } catch (err) {
      throw new FinancialError('PIX_CREATE_FAILED', { detail: [err.code, err.detail].filter(Boolean).join(': '), providerStatus: err.providerStatus });
    }
    let copyPaste = res?.informacoesPix?.textoQrCode;
    // The request exists at the bank but the Pix text may not come in the creation
    // response: read the request back (GET /solicitacoes/{numero}) a few times.
    for (let i = 0; res?.numeroSolicitacao && !copyPaste && i < 3; i++) {
      if (i) await (this.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))))(800);
      const full = await this.#call('GET', `/solicitacoes/${encodeURIComponent(res.numeroSolicitacao)}`, { query: { numeroConvenio: this.cfg.convenio } }).catch(() => null);
      copyPaste = full?.informacoesPix?.textoQrCode;
      if (full?.urlSolicitacao && !res.urlSolicitacao) res.urlSolicitacao = full.urlSolicitacao;
      if (full?.informacoesPix?.txId) res.informacoesPix = { ...res.informacoesPix, txId: full.informacoesPix.txId };
    }
    if (!res?.numeroSolicitacao || !copyPaste) {
      // Shape only (field names and presence), never values.
      logger.warn('bb pay response without pix', {
        keys: Object.keys(res || {}),
        numeroSolicitacao: Boolean(res?.numeroSolicitacao),
        informacoesPix: res?.informacoesPix ? Object.keys(res.informacoesPix) : null,
        urlSolicitacao: Boolean(res?.urlSolicitacao),
      });
      throw new FinancialError('PIX_CREATE_FAILED', { detail: 'BB Pay response without numeroSolicitacao or textoQrCode' });
    }
    const png = await QRCode.toDataURL(copyPaste, { margin: 1, width: 320, errorCorrectionLevel: 'M' });
    return {
      providerPaymentId: providerIdFor(res.numeroSolicitacao, conciliacao),
      status: 'PENDING',
      qrCodeBase64: png.replace(/^data:image\/png;base64,/, ''),
      copyPaste,
      expiresAt: deadline,
      metadata: {
        txid: res.informacoesPix?.txId ?? null,
        numeroSolicitacao: res.numeroSolicitacao,
        urlSolicitacao: res.urlSolicitacao ?? null,
        environment: this.cfg.environment,
      },
    };
  }

  /** Reads the request back from the bank (authoritative state). */
  async getPaymentStatus(providerPaymentId) {
    const { numero, conciliacao } = splitProviderId(providerPaymentId);
    if (!numero || !conciliacao) throw new FinancialError('PIX_NOT_FOUND', { detail: 'unknown BB Pay reference' });
    const data = await this.#call('GET', '/solicitacoes', { query: { numeroConvenio: this.cfg.convenio, codigoConciliacaoSolicitacao: conciliacao } });
    const item = (data?.listaSolicitacoes || []).find((s) => String(s.numeroSolicitacao) === String(numero));
    if (!item) throw new FinancialError('PIX_NOT_FOUND', { detail: 'BB Pay request not found' });
    const status = REQUEST_STATUS[Number(item.codigoEstadoSolicitacao)] || 'PENDING';
    return {
      status,
      paidAt: null,
      amountCents: status === 'CONFIRMED' ? toCents(item.valorSolicitacao) : null,
      raw: { codigoEstadoSolicitacao: item.codigoEstadoSolicitacao },
    };
  }

  /**
   * Gives a received payment back to whoever paid it (POST /devolucoes).
   * Used when a signup fee comes from an account other than the company's CNPJ.
   */
  async returnPayment({ numeroPagamento, amountCents, reason }) {
    if (!numeroPagamento) throw new FinancialError('REFUND_FAILED', { detail: 'numeroPagamento ausente' });
    const res = await this.#call('POST', '/devolucoes', {
      auth: this.refundAuth,
      retry: false,
      body: {
        numeroPagamento: Number(numeroPagamento),
        numeroConvenio: Number(this.cfg.convenio),
        valorDevolucao: Number((amountCents / 100).toFixed(2)),
        textoMotivoDevolucao: String(reason || 'Pagamento devolvido').slice(0, 140),
      },
    });
    return { providerRefundId: res?.numeroPagamentoSolicitacao != null ? String(res.numeroPagamentoSolicitacao) : null };
  }

  // --------------------------------------------------------------- webhook

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
    const providerPaymentId = providerIdFor(d.numeroSolicitacao, d.codigoConciliacaoSolicitacao ?? '');
    // A payment is confirmed only when the bank itself says the request is paid:
    // a forged notification with a leaked token cannot open an account.
    if (status === 'CONFIRMED' && this.apiReady) {
      const bank = await this.getPaymentStatus(providerPaymentId).catch((err) => {
        if (err.retryable) throw err; // 5xx → the bank retries the webhook
        throw new FinancialError('WEBHOOK_INVALID', { detail: `not confirmed by BB Pay: ${err.code}` });
      });
      if (bank.status !== 'CONFIRMED') throw new FinancialError('WEBHOOK_INVALID', { detail: `BB Pay request state ${bank.raw.codigoEstadoSolicitacao}` });
    }
    return [
      {
        providerEventId: `bbpay:${d.numeroSolicitacao}:${d.numeroPagamento ?? '-'}:${body.codigoEvento}`,
        providerPaymentId,
        type: `bbpay.event.${body.codigoEvento}`,
        status,
        paidAt: status === 'CONFIRMED' ? brTime(d.timestampPagamento) : null,
        amountCents: toCents(d.valorOriginal),
        // Who paid, only to check it against the account's CNPJ: never stored (not in payload).
        payer: payerOf(d),
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

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** Opens the client certificate once (wrong password, damaged base64, unsupported .pfx) without any network call. */
function checkIdentity(m) {
  try {
    tls.createSecureContext(m.pfxBase64 ? { pfx: Buffer.from(m.pfxBase64, 'base64'), passphrase: m.passphrase || '' } : { cert: Buffer.from(m.certBase64, 'base64'), key: Buffer.from(m.keyBase64, 'base64') });
    return 'ok';
  } catch (err) {
    return `inválido: ${String(err.message).slice(0, 120)}`;
  }
}

/** The payer's document from a BB Pay event, zero-padded (the bank sends it as a number). */
function payerOf(d) {
  if (d?.numeroDocumentoPagador == null || d.numeroDocumentoPagador === '') return null;
  const type = Number(d.tipoDocumentoPagador) === 2 ? 'CNPJ' : Number(d.tipoDocumentoPagador) === 1 ? 'CPF' : null;
  if (!type) return null;
  const digits = String(d.numeroDocumentoPagador).replace(/\D/g, '');
  return { type, document: digits.padStart(type === 'CNPJ' ? 14 : 11, '0') };
}
