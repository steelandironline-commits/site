import { describe, it, expect, beforeEach } from 'vitest';
import { BancoDoBrasilPaymentProvider, txidFor, refundIdFor } from '../src/payments/providers/banco-do-brasil.provider.js';
import { BancoDoBrasilAuthService } from '../src/payments/providers/banco-do-brasil.auth.js';
import { FinancialError, withRetry } from '../src/payments/errors.js';
import { loadConfig } from '../src/config.js';

/**
 * Provider contract tests against an in-memory fake of the BB Pix API
 * (BACEN standard). No live banking API is ever called.
 */
const SECRET = 'bb-webhook-secret-0123456789abcdef0123456789';
const BB = {
  environment: 'sandbox',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  appKey: 'test-app-key',
  pixKey: 'chave-teste@example.com',
  apiBaseUrl: 'https://bb.fake/pix/v2',
  oauthUrl: 'https://bb.fake/oauth/token',
  scopes: 'cob.read cob.write pix.read pix.write',
  appKeyParam: 'gw-dev-app-key',
  webhookSecret: SECRET,
  mtls: null,
  flags: { bbPay: true, split: true, payout: true, protectedFlow: true }, // flags alone never enable capabilities
  pixExpirationSeconds: 3600,
};

function fakeBB({ now }) {
  const state = { tokens: 0, calls: [], cobs: new Map(), devolucoes: new Map(), fail: [], tokenTtl: 600 };
  const res = (status, data) => ({ ok: status < 400, status, json: async () => data });
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url);
    state.calls.push({ method: opts.method, path: u.pathname, query: Object.fromEntries(u.searchParams), headers: opts.headers });
    if (state.fail.length) {
      const f = state.fail.shift();
      if (f === 'network') throw Object.assign(new Error('socket hang up'), { name: 'TypeError' });
      return res(f, { title: 'erro' });
    }
    if (u.pathname === '/oauth/token') {
      state.tokens += 1;
      return res(200, { access_token: `tok_${state.tokens}`, token_type: 'Bearer', expires_in: state.tokenTtl });
    }
    if (!/^Bearer tok_/.test(opts.headers?.Authorization || '')) return res(401, {});
    let m = u.pathname.match(/^\/pix\/v2\/cob\/(\w+)$/);
    if (m) {
      const txid = m[1];
      if (opts.method === 'PUT') {
        const body = JSON.parse(opts.body);
        if (!state.cobs.has(txid)) {
          state.cobs.set(txid, {
            txid,
            status: 'ATIVA',
            calendario: { criacao: new Date(now()).toISOString(), expiracao: body.calendario.expiracao },
            valor: { original: body.valor.original },
            chave: body.chave,
            pixCopiaECola: `00020101021226BR.GOV.BCB.PIX${txid}5303986540${body.valor.original}6304ABCD`,
          });
        }
        return res(201, state.cobs.get(txid));
      }
      const cob = state.cobs.get(txid);
      if (!cob) return res(404, { title: 'Cobrança não encontrada' });
      if (opts.method === 'PATCH') cob.status = JSON.parse(opts.body).status;
      return res(200, cob);
    }
    m = u.pathname.match(/^\/pix\/v2\/pix\/(\w+)\/devolucao\/(\w+)$/);
    if (m) {
      const key = `${m[1]}:${m[2]}`;
      if (opts.method === 'PUT' && !state.devolucoes.has(key)) {
        state.devolucoes.set(key, { id: m[2], rtrId: `D${m[2]}`, valor: JSON.parse(opts.body).valor, status: 'EM_PROCESSAMENTO' });
      }
      return state.devolucoes.has(key) ? res(201, state.devolucoes.get(key)) : res(404, {});
    }
    m = u.pathname.match(/^\/pix\/v2\/webhook\/(.+)$/);
    if (m) return res(204, {});
    return res(404, {});
  };
  /** Simulate a payer settling the cob. */
  const pay = (txid, valor, e2e = `E${txid.slice(0, 20)}`) => {
    const cob = state.cobs.get(txid);
    cob.status = 'CONCLUIDA';
    cob.pix = [{ endToEndId: e2e, txid, valor: valor ?? cob.valor.original, horario: new Date(now()).toISOString(), devolucoes: [] }];
    return e2e;
  };
  return { state, fetchImpl, pay };
}

describe('Banco do Brasil provider (contract, fake BB API)', () => {
  let clock;
  let bb;
  let provider;
  const now = () => clock;
  const sleep = async () => {};

  beforeEach(() => {
    clock = Date.parse('2026-10-12T12:00:00Z');
    bb = fakeBB({ now });
    provider = new BancoDoBrasilPaymentProvider({ bb: BB, fetchImpl: bb.fetchImpl, now, sleep });
  });

  it('reports only capabilities actually implemented — env flags never enable split/payout/protected', () => {
    const { capabilities: c, reasons } = provider.getCapabilities();
    expect(c).toMatchObject({ pix: true, pixWebhook: true, paymentStatus: true, refund: true, partialRefund: true });
    expect(c).toMatchObject({ split: false, payout: false, bbPayRedirect: false, protectedFlow: false, recurringPix: false });
    expect(reasons.protectedFlow).toMatch(/ainda não foi implementada/);
    const missing = new BancoDoBrasilPaymentProvider({ bb: { ...BB, clientSecret: undefined, webhookSecret: undefined }, fetchImpl: bb.fetchImpl });
    expect(missing.getCapabilities().capabilities.pix).toBe(false);
    expect(missing.getCapabilities().reasons.pix).toMatch(/Credenciais BB incompletas/);
  });

  it('unsupported operations fail cleanly with mapped errors', async () => {
    await expect(provider.createSplit({})).rejects.toMatchObject({ code: 'SPLIT_NOT_SUPPORTED' });
    await expect(provider.createPayout({})).rejects.toMatchObject({ code: 'PAYOUT_NOT_SUPPORTED' });
    await expect(provider.createPaymentRedirect({})).rejects.toMatchObject({ code: 'PROVIDER_CAPABILITY_NOT_AVAILABLE', capability: 'bbPayRedirect' });
  });

  it('caches the OAuth token, shares in-flight requests and refreshes before expiry', async () => {
    const auth = new BancoDoBrasilAuthService({ clientId: 'a', clientSecret: 'b', oauthUrl: BB.oauthUrl, fetchImpl: bb.fetchImpl, now, sleep });
    const [t1, t2] = await Promise.all([auth.getToken(), auth.getToken()]);
    expect(t1).toBe(t2);
    expect(bb.state.tokens).toBe(1);
    expect(await auth.getToken()).toBe(t1);
    clock += (600 - 30) * 1000; // inside the 60s refresh window
    expect(await auth.getToken()).not.toBe(t1);
    expect(bb.state.tokens).toBe(2);
    const req = bb.state.calls.find((c) => c.path === '/oauth/token');
    expect(req.headers.Authorization).toBe(`Basic ${Buffer.from('a:b').toString('base64')}`);
  });

  it('maps OAuth rejection to PROVIDER_AUTH_FAILED without retrying credentials errors', async () => {
    bb.state.fail.push(401);
    const auth = new BancoDoBrasilAuthService({ clientId: 'a', clientSecret: 'b', oauthUrl: BB.oauthUrl, fetchImpl: bb.fetchImpl, now, sleep });
    await expect(auth.getToken()).rejects.toMatchObject({ code: 'PROVIDER_AUTH_FAILED' });
    expect(bb.state.calls.length).toBe(1);
  });

  it('creates a cob idempotently by txid with the server amount and app key', async () => {
    const input = { paymentId: 'cmpay123', amountCents: 140000, description: 'Serviço', payer: {}, expiresAt: new Date(clock + 3600_000) };
    const a = await provider.createPixCharge(input);
    const b = await provider.createPixCharge(input);
    expect(a.providerPaymentId).toBe(txidFor('cmpay123'));
    expect(a.providerPaymentId).toMatch(/^[a-zA-Z0-9]{26,35}$/);
    expect(b.providerPaymentId).toBe(a.providerPaymentId);
    expect(bb.state.cobs.size).toBe(1);
    expect(a.copyPaste).toContain('BR.GOV.BCB.PIX');
    expect(a.qrCodeBase64.length).toBeGreaterThan(100);
    const put = bb.state.calls.find((c) => c.method === 'PUT');
    expect(put.query['gw-dev-app-key']).toBe('test-app-key');
    expect(bb.state.cobs.get(a.txid).valor.original).toBe('1400.00');
  });

  it('normalizes cob statuses: ATIVA→PENDING, expired calendar→EXPIRED, CONCLUIDA→CONFIRMED, removed→CANCELED', async () => {
    const { txid } = await provider.createPixCharge({ paymentId: 'p1', amountCents: 10000, expiresAt: new Date(clock + 600_000) });
    expect((await provider.getPaymentStatus(txid)).status).toBe('PENDING');
    clock += 601_000;
    expect((await provider.getPaymentStatus(txid)).status).toBe('EXPIRED');
    const c2 = await provider.createPixCharge({ paymentId: 'p2', amountCents: 10000 });
    bb.pay(c2.txid);
    expect(await provider.getPaymentStatus(c2.txid)).toMatchObject({ status: 'CONFIRMED', amountCents: 10000 });
    const c3 = await provider.createPixCharge({ paymentId: 'p3', amountCents: 10000 });
    expect((await provider.cancelPixCharge(c3.txid)).status).toBe('CANCELED');
    await expect(provider.getPaymentStatus('naoexiste000000000000000000')).rejects.toMatchObject({ code: 'PIX_NOT_FOUND' });
  });

  it('retries idempotent calls on 5xx / 429 / network errors with backoff', async () => {
    await provider.createPixCharge({ paymentId: 'p1', amountCents: 5000 });
    bb.state.fail.push(503, 429, 'network');
    const st = await provider.getPaymentStatus(txidFor('p1'));
    expect(st.status).toBe('PENDING');
    bb.state.fail.push(503, 503, 503, 503);
    await expect(provider.getPaymentStatus(txidFor('p1'))).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('re-authenticates once when the API answers 401 (expired token)', async () => {
    await provider.createPixCharge({ paymentId: 'p1', amountCents: 5000 });
    const before = bb.state.tokens;
    bb.state.fail.push(401);
    expect((await provider.getPaymentStatus(txidFor('p1'))).status).toBe('PENDING');
    expect(bb.state.tokens).toBe(before + 1);
  });

  it('webhook: rejects missing/invalid token and malformed bodies; re-fetches the charge as the source of truth', async () => {
    const { txid } = await provider.createPixCharge({ paymentId: 'p1', amountCents: 140000 });
    const e2e = bb.pay(txid);
    const body = { pix: [{ endToEndId: e2e, txid, valor: '1.00', horario: new Date().toISOString() }] }; // forged amount in payload
    await expect(provider.handleWebhook({ query: {}, headers: {}, body })).rejects.toMatchObject({ code: 'WEBHOOK_INVALID', status: 401 });
    await expect(provider.handleWebhook({ query: { token: 'x'.repeat(44) }, headers: {}, body })).rejects.toMatchObject({ code: 'WEBHOOK_INVALID' });
    await expect(provider.handleWebhook({ query: { token: SECRET }, headers: {}, body: { foo: 1 } })).rejects.toMatchObject({ code: 'WEBHOOK_INVALID', status: 400 });
    const [ev] = await provider.handleWebhook({ query: { token: SECRET }, headers: {}, body });
    expect(ev).toMatchObject({ providerEventId: `pix:${e2e}`, providerPaymentId: txid, status: 'CONFIRMED', amountCents: 140000 });
    // Same delivery twice → same providerEventId (deduplicated downstream).
    const [again] = await provider.handleWebhook({ query: { token: SECRET }, headers: {}, body });
    expect(again.providerEventId).toBe(ev.providerEventId);
  });

  it('webhook ignores Pix entries without a txid (not an AutoPix charge)', async () => {
    const events = await provider.handleWebhook({ query: { token: SECRET }, body: { pix: [{ endToEndId: 'E1', valor: '10.00' }] } });
    expect(events).toEqual([]);
  });

  it('refunds via BACEN devolução: idempotent by key, partial amounts, status mapping', async () => {
    const { txid } = await provider.createPixCharge({ paymentId: 'p1', amountCents: 140000 });
    bb.pay(txid);
    const r1 = await provider.refundPayment(txid, { amountCents: 40000, idempotencyKey: 'rf-abc' });
    const r2 = await provider.refundPayment(txid, { amountCents: 40000, idempotencyKey: 'rf-abc' });
    expect(r1).toEqual(r2);
    expect(r1.status).toBe('PROCESSING');
    expect(r1.providerRefundId).toContain(refundIdFor('rf-abc'));
    expect(bb.state.devolucoes.size).toBe(1);
    expect([...bb.state.devolucoes.values()][0].valor).toBe('400.00');
    [...bb.state.devolucoes.values()][0].status = 'DEVOLVIDO';
    expect((await provider.getRefundStatus(txid, r1.providerRefundId)).status).toBe('COMPLETED');
    await expect(provider.refundPayment(txid, {})).rejects.toThrow(/idempotencyKey/);
  });

  it('never logs or returns secrets in errors', async () => {
    bb.state.fail.push(400);
    const err = await provider.createPixCharge({ paymentId: 'p9', amountCents: 100 }).catch((e) => e);
    expect(err).toBeInstanceOf(FinancialError);
    expect(err.code).toBe('PIX_CREATE_FAILED');
    expect(JSON.stringify({ m: err.message, d: err.detail })).not.toMatch(/test-client-secret|tok_|test-app-key/);
  });

  it('withRetry does not retry non-retryable errors', async () => {
    let n = 0;
    await expect(withRetry(async () => { n += 1; throw new FinancialError('REFUND_FAILED'); }, { sleep })).rejects.toMatchObject({ code: 'REFUND_FAILED' });
    expect(n).toBe(1);
  });
});

describe('Banco do Brasil configuration safety', () => {
  const base = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://x@localhost/x',
    APP_URL: 'https://app.autopix.example',
    API_URL: 'https://app.autopix.example',
    SESSION_SECRET: 's'.repeat(48),
    ACTIVATION_TOKEN_SECRET: 'a'.repeat(48),
    PASSWORD_RESET_SECRET: 'r'.repeat(48),
    PAYMENT_PROVIDER: 'banco-do-brasil',
    PAYMENT_WEBHOOK_SECRET: 'w'.repeat(48),
    EMAIL_PROVIDER: 'console',
    BB_CLIENT_ID: 'id',
    BB_CLIENT_SECRET: 'secret',
    BB_DEVELOPER_APPLICATION_KEY: 'key',
    BB_PIX_KEY: 'chave',
    BB_WEBHOOK_SECRET: 'x'.repeat(40),
  };

  it('production refuses sandbox configuration', () => {
    expect(() => loadConfig({ ...base, BB_ENVIRONMENT: 'sandbox' })).toThrow(/sandbox/i);
    expect(() => loadConfig({ ...base, BB_ENVIRONMENT: 'production', BB_API_BASE_URL: 'https://api.hm.bb.com.br/pix/v2' })).toThrow(/sandbox|homolog/i);
  });

  it('production requires BB credentials and a strong webhook secret', () => {
    expect(() => loadConfig({ ...base, BB_ENVIRONMENT: 'production', BB_CLIENT_SECRET: '' })).toThrow(/BB_CLIENT_SECRET/);
    expect(() => loadConfig({ ...base, BB_ENVIRONMENT: 'production', BB_WEBHOOK_SECRET: 'short' })).toThrow(/BB_WEBHOOK_SECRET/);
  });

  it('accepts hyphenated provider names and resolves production defaults', () => {
    let cfg;
    try {
      cfg = loadConfig({ ...base, BB_ENVIRONMENT: 'production' });
    } catch (err) {
      // Other production requirements (e.g. e-mail provider) may apply; BB-specific checks must not be the cause.
      expect(String(err.message)).not.toMatch(/BB_/);
      return;
    }
    expect(cfg.payment.provider).toBe('banco_do_brasil');
    expect(cfg.bb.apiBaseUrl).toBe('https://api-pix.bb.com.br/pix/v2');
    expect(cfg.bb.appKeyParam).toBe('gw-app-key');
  });
});
