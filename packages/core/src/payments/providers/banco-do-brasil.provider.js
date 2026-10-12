import QRCode from 'qrcode';
import { PaymentProvider, NO_CAPABILITIES } from '../PaymentProvider.js';
import { FinancialError, capabilityError, withRetry } from '../errors.js';
import { BancoDoBrasilAuthService } from './banco-do-brasil.auth.js';
import { createMtlsFetch } from './http.js';
import { safeEqual } from '../../security/tokens.js';
import { logger } from '../../logger.js';

const COB_STATUS = {
  ATIVA: 'PENDING',
  CONCLUIDA: 'CONFIRMED',
  REMOVIDA_PELO_USUARIO_RECEBEDOR: 'CANCELED',
  REMOVIDA_PELO_PSP: 'CANCELED',
};
const REFUND_STATUS = { EM_PROCESSAMENTO: 'PROCESSING', DEVOLVIDO: 'COMPLETED', NAO_REALIZADO: 'FAILED' };

const toCents = (v) => (v == null ? null : Math.round(Number(v) * 100));
const toValor = (cents) => (cents / 100).toFixed(2);

/** BACEN txid: [a-zA-Z0-9]{26,35}. Deterministic per payment → idempotent PUT /cob/{txid}. */
export function txidFor(paymentId) {
  return `AP${String(paymentId).replace(/[^a-zA-Z0-9]/g, '')}`.padEnd(26, '0').slice(0, 35);
}

/** Refund id (BACEN devolução id): [a-zA-Z0-9]{1,35}, derived from our idempotency key. */
export function refundIdFor(idempotencyKey) {
  return `RF${String(idempotencyKey).replace(/[^a-zA-Z0-9]/g, '')}`.slice(0, 35);
}

/**
 * BancoDoBrasilPaymentProvider — Pix through Banco do Brasil's Pix API
 * (BACEN standard: /cob, /pix/{e2eid}/devolucao, webhook {pix:[…]}).
 *
 * AutoPix controls the experience; Banco do Brasil controls the money.
 * Capabilities beyond the BACEN Pix standard (split, payout, BB Pay
 * redirect, protected flows) depend on specific BB contracts. They are
 * reported as unavailable until such an integration exists — enabling the
 * env flag alone never turns them on.
 */
export class BancoDoBrasilPaymentProvider extends PaymentProvider {
  name = 'banco_do_brasil';
  label = 'Banco do Brasil';

  constructor({ bb, fetchImpl, now = () => Date.now(), sleep } = {}) {
    super();
    this.bb = bb;
    this.isSandbox = bb.environment !== 'production';
    this.fetch = fetchImpl || (bb.mtls ? createMtlsFetch(bb.mtls) : globalThis.fetch);
    this.now = now;
    this.sleep = sleep;
    this.auth = new BancoDoBrasilAuthService({
      clientId: bb.clientId,
      clientSecret: bb.clientSecret,
      oauthUrl: bb.oauthUrl,
      scopes: bb.scopes,
      fetchImpl: this.fetch,
      now,
      sleep,
    });
  }

  // ------------------------------------------------------------ capabilities

  get credentialsReady() {
    const b = this.bb;
    return Boolean(b.clientId && b.clientSecret && b.appKey && b.pixKey);
  }

  getCapabilities() {
    const ready = this.credentialsReady;
    const reasons = {};
    const pending = (flag, label) =>
      flag ? `${label} habilitado por configuração, mas a integração com o contrato BB correspondente ainda não foi implementada.` : `${label} não contratado/habilitado.`;
    reasons.split = pending(this.bb.flags.split, 'Split');
    reasons.payout = pending(this.bb.flags.payout, 'Repasse (payout)');
    reasons.bbPayRedirect = pending(this.bb.flags.bbPay, 'BB Pay');
    reasons.protectedFlow = pending(this.bb.flags.protectedFlow, 'Pagamento protegido');
    reasons.recurringPix = 'Pix Automático não integrado.';
    if (!ready) reasons.pix = 'Credenciais BB incompletas (BB_CLIENT_ID, BB_CLIENT_SECRET, BB_DEVELOPER_APPLICATION_KEY, BB_PIX_KEY).';
    if (!this.bb.webhookSecret) reasons.pixWebhook = 'BB_WEBHOOK_SECRET ausente.';
    return {
      capabilities: {
        ...NO_CAPABILITIES,
        pix: ready,
        pixWebhook: ready && Boolean(this.bb.webhookSecret),
        paymentStatus: ready,
        refund: ready, // BACEN devolução — part of the standard Pix API
        partialRefund: ready,
        // Contract-specific: off until implemented against a real BB contract.
        split: false,
        payout: false,
        bbPayRedirect: false,
        protectedFlow: false,
        recurringPix: false,
      },
      reasons,
    };
  }

  // ------------------------------------------------------------------ http

  async #call(method, path, { body, retry = true } = {}) {
    if (!this.credentialsReady) throw capabilityError('pix', 'missing BB credentials');
    const url = `${this.bb.apiBaseUrl}${path}${path.includes('?') ? '&' : '?'}${this.bb.appKeyParam}=${encodeURIComponent(this.bb.appKey)}`;
    const exec = async () => {
      const token = await this.auth.getToken();
      let res;
      try {
        res = await this.fetch(url, {
          method,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(15_000),
        });
      } catch (err) {
        throw new FinancialError('PROVIDER_UNAVAILABLE', { detail: `${method} ${path.split('?')[0]}: ${err.name}`, retryable: true });
      }
      if (res.status === 401) {
        this.auth.invalidate();
        throw new FinancialError('PROVIDER_AUTH_FAILED', { providerStatus: 401, retryable: true });
      }
      if (res.status === 404) throw new FinancialError('PIX_NOT_FOUND', { providerStatus: 404 });
      if (res.status === 429) throw new FinancialError('RATE_LIMITED', { providerStatus: 429, retryable: true });
      if (res.status >= 500) throw new FinancialError('PROVIDER_UNAVAILABLE', { providerStatus: res.status, retryable: true });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Safe metadata only (status + BACEN problem type), never the request body.
        logger.warn('bb api rejected request', { method, path: path.split('/').slice(0, 2).join('/'), status: res.status, type: data?.type, title: data?.title });
        throw new FinancialError('PIX_CREATE_FAILED', { providerStatus: res.status, detail: data?.title || data?.detail });
      }
      return data;
    };
    // Only idempotent calls are retried (GET, PUT keyed by txid/refund id, PATCH to a terminal state).
    return retry ? withRetry(exec, { retries: 3, sleep: this.sleep }) : exec();
  }

  // ------------------------------------------------------------------- Pix

  #normalizeCob(cob) {
    const paid = cob.pix?.[0];
    let status = COB_STATUS[cob.status] || 'PENDING';
    if (status === 'PENDING' && cob.calendario?.criacao && cob.calendario?.expiracao) {
      const exp = new Date(cob.calendario.criacao).getTime() + Number(cob.calendario.expiracao) * 1000;
      if (exp < this.now()) status = 'EXPIRED';
    }
    const refunds = (paid?.devolucoes || []).map((d) => ({
      id: d.id,
      rtrId: d.rtrId,
      amountCents: toCents(d.valor),
      status: REFUND_STATUS[d.status] || 'PROCESSING',
    }));
    const refundedCents = refunds.filter((r) => r.status === 'COMPLETED').reduce((a, r) => a + r.amountCents, 0);
    const paidCents = toCents(paid?.valor ?? null);
    if (status === 'CONFIRMED' && paidCents && refundedCents >= paidCents) status = 'REFUNDED';
    return {
      txid: cob.txid,
      status,
      providerStatus: cob.status,
      amountCents: paidCents ?? toCents(cob.valor?.original),
      expectedCents: toCents(cob.valor?.original),
      paidAt: paid?.horario ? new Date(paid.horario) : null,
      endToEndId: paid?.endToEndId || null,
      refunds,
      copyPaste: cob.pixCopiaECola || cob.textoImagemQRcode || null,
      expiresAt:
        cob.calendario?.criacao && cob.calendario?.expiracao
          ? new Date(new Date(cob.calendario.criacao).getTime() + Number(cob.calendario.expiracao) * 1000)
          : null,
    };
  }

  async createPixCharge({ paymentId, amountCents, description, payer = {}, expiresAt }) {
    const txid = txidFor(paymentId);
    const expiracao = expiresAt ? Math.max(60, Math.round((new Date(expiresAt).getTime() - this.now()) / 1000)) : this.bb.pixExpirationSeconds;
    const doc = String(payer.cnpj || '').replace(/\D/g, '');
    const body = {
      calendario: { expiracao },
      ...(doc.length === 14 && payer.name ? { devedor: { cnpj: doc, nome: String(payer.name).slice(0, 140) } } : {}),
      ...(doc.length === 11 && payer.name ? { devedor: { cpf: doc, nome: String(payer.name).slice(0, 140) } } : {}),
      valor: { original: toValor(amountCents) },
      chave: this.bb.pixKey,
      solicitacaoPagador: String(description || 'AutoPix').slice(0, 140),
    };
    let cob;
    try {
      cob = await this.#call('PUT', `/cob/${txid}`, { body }); // idempotent by txid
    } catch (err) {
      if (err instanceof FinancialError && err.code === 'PROVIDER_CAPABILITY_NOT_AVAILABLE') throw err;
      throw new FinancialError('PIX_CREATE_FAILED', { detail: err.detail || err.code, providerStatus: err.providerStatus });
    }
    const n = this.#normalizeCob(cob);
    if (!n.copyPaste) throw new FinancialError('PIX_CREATE_FAILED', { detail: 'BB response without pixCopiaECola' });
    if (n.expectedCents !== amountCents) throw new FinancialError('PIX_CREATE_FAILED', { detail: 'amount mismatch in BB response' });
    const png = await QRCode.toDataURL(n.copyPaste, { margin: 1, width: 320, errorCorrectionLevel: 'M' });
    return {
      providerPaymentId: txid,
      txid,
      status: n.status,
      qrCodeBase64: png.replace(/^data:image\/png;base64,/, ''),
      copyPaste: n.copyPaste,
      expiresAt: n.expiresAt || expiresAt,
      metadata: { txid, bbStatus: cob.status, location: cob.location || null, environment: this.bb.environment },
    };
  }

  async getPixCharge(txid) {
    return this.#normalizeCob(await this.#call('GET', `/cob/${encodeURIComponent(txid)}`));
  }

  async getPaymentStatus(txid) {
    const n = await this.getPixCharge(txid);
    return { status: n.status, paidAt: n.paidAt, amountCents: n.status === 'PENDING' || n.status === 'EXPIRED' ? null : n.amountCents, raw: { bbStatus: n.providerStatus, endToEndId: n.endToEndId } };
  }

  async cancelPixCharge(txid) {
    const cob = await this.#call('PATCH', `/cob/${encodeURIComponent(txid)}`, { body: { status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR' } });
    return { status: this.#normalizeCob(cob).status };
  }

  // --------------------------------------------------------------- refunds

  async refundPayment(txid, { amountCents, idempotencyKey } = {}) {
    if (!idempotencyKey) throw new Error('refundPayment requires an idempotencyKey');
    const charge = await this.getPixCharge(txid);
    if (!charge.endToEndId) throw new FinancialError('REFUND_FAILED', { detail: 'charge has no settled Pix' });
    const id = refundIdFor(idempotencyKey);
    let res;
    try {
      // PUT keyed by refund id → safe to retry.
      res = await this.#call('PUT', `/pix/${encodeURIComponent(charge.endToEndId)}/devolucao/${id}`, {
        body: { valor: toValor(amountCents ?? charge.amountCents), natureza: 'ORIGINAL', descricao: 'Reembolso AutoPix' },
      });
    } catch (err) {
      throw new FinancialError('REFUND_FAILED', { detail: err.detail || err.code, providerStatus: err.providerStatus });
    }
    return { providerRefundId: `${charge.endToEndId}:${id}`, status: REFUND_STATUS[res.status] || 'PROCESSING' };
  }

  async getRefundStatus(txid, providerRefundId) {
    const [e2e, id] = String(providerRefundId).split(':');
    const res = await this.#call('GET', `/pix/${encodeURIComponent(e2e)}/devolucao/${encodeURIComponent(id)}`);
    return { status: REFUND_STATUS[res.status] || 'PROCESSING' };
  }

  // ---------------------------------------------------------------- webhook

  /**
   * BACEN webhooks are authenticated with mTLS at the PSP edge. Behind a PaaS
   * that terminates TLS we add a shared secret in the registered URL
   * (?token=…) AND always re-fetch the charge from the BB API before any
   * state change, so a forged payload cannot confirm a payment.
   */
  validateWebhook({ query = {}, headers = {} }) {
    const token = query.token || headers['x-autopix-webhook-token'];
    if (!this.bb.webhookSecret || !token || !safeEqual(String(token), this.bb.webhookSecret)) {
      throw new FinancialError('WEBHOOK_INVALID', { detail: 'bad or missing webhook token' });
    }
    return true;
  }

  async handleWebhook(req) {
    this.validateWebhook(req);
    const items = req.body?.pix;
    if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
      const err = new FinancialError('WEBHOOK_INVALID', { detail: 'malformed payload' });
      err.status = 400;
      throw err;
    }
    const events = [];
    for (const item of items) {
      if (!item?.txid || !item?.endToEndId) continue; // Pix without our charge (e.g. key transfer) — not ours
      const charge = await this.getPixCharge(item.txid); // authoritative state
      events.push({
        providerEventId: `pix:${item.endToEndId}`,
        providerPaymentId: item.txid,
        type: 'pix.received',
        status: charge.status === 'REFUNDED' ? 'CONFIRMED' : charge.status,
        paidAt: charge.paidAt,
        amountCents: charge.amountCents,
        payload: { endToEndId: item.endToEndId, bbStatus: charge.providerStatus },
      });
      for (const d of item.devolucoes || []) {
        const r = charge.refunds.find((x) => x.id === d.id) || { status: REFUND_STATUS[d.status] || 'PROCESSING', amountCents: toCents(d.valor) };
        events.push({
          providerEventId: `refund:${d.rtrId || d.id}:${r.status}`,
          providerPaymentId: item.txid,
          type: 'pix.refund',
          kind: 'refund',
          refundProviderId: `${item.endToEndId}:${d.id}`,
          status: r.status,
          amountCents: r.amountCents,
          payload: { refundId: d.id, bbStatus: d.status },
        });
      }
    }
    return events;
  }

  /** Register the webhook URL for the Pix key (run once per environment). */
  async registerWebhook(webhookUrl) {
    await this.#call('PUT', `/webhook/${encodeURIComponent(this.bb.pixKey)}`, { body: { webhookUrl } });
    return { registered: true };
  }

  // ------------------------------------------ contract-specific capabilities

  async createSplit() {
    throw new FinancialError('SPLIT_NOT_SUPPORTED', { detail: this.getCapabilities().reasons.split });
  }

  async createPayout() {
    throw new FinancialError('PAYOUT_NOT_SUPPORTED', { detail: this.getCapabilities().reasons.payout });
  }

  async createPaymentRedirect() {
    throw capabilityError('bbPayRedirect', this.getCapabilities().reasons.bbPayRedirect);
  }
}
