import { describe, it, expect } from 'vitest';
import { BbPayPaymentProvider } from '../src/payments/providers/bb-pay.provider.js';
import { FinancialError } from '../src/payments/errors.js';
import { loadConfig } from '../src/config.js';

const SECRET = 'bbpay-webhook-secret-0123456789abcdef0123';
const provider = () => new BbPayPaymentProvider({ bbPay: { environment: 'production', convenio: '421378', webhookSecret: SECRET } });

/** Sample payload from the BB developer portal ("PAGAMENTO BB PAY"). */
const sample = (over = {}) => ({
  codigoEvento: 1,
  dadosEvento: {
    numeroConvenio: 421378,
    numeroSolicitacao: 56789,
    numeroPagamento: 123456,
    codigoEstadoPagamento: 200,
    timestampPagamento: '2022-02-23T13:02:55.00000',
    valorOriginal: 100.2,
    valorLiquidoRecebedor: 100.2,
    codigoTipoPagamento: 'PIX',
    dataRepasse: '2022-02-25',
    numeroDocumentoPagador: 5544562701,
    nomePagador: 'NOME DO PAGADOR',
    e2eId: 'E00000000202110222016549061422',
  },
  ...over,
});

describe('BB Pay webhook', () => {
  it('turns a paid event into a confirmation of our request, with the amount in cents and no payer data', async () => {
    const [ev] = await provider().handleWebhook({ query: { token: SECRET }, body: sample() });
    expect(ev).toMatchObject({ providerPaymentId: '56789:', status: 'CONFIRMED', amountCents: 10020, providerEventId: 'bbpay:56789:123456:1' });
    expect(ev.paidAt.toISOString()).toBe('2022-02-23T16:02:55.000Z');
    expect(JSON.stringify(ev.payload)).not.toMatch(/NOME DO PAGADOR|5544562701/);
  });

  it('maps returned, unauthorized and contested events', async () => {
    const status = async (c) => (await provider().handleWebhook({ query: { token: SECRET }, body: sample({ codigoEvento: c }) }))[0].status;
    expect(await status(2)).toBe('REFUNDED');
    expect(await status(3)).toBe('FAILED');
    expect(await status(4)).toBe('CONTESTED');
  });

  it('refuses a wrong token, another convênio and malformed bodies', async () => {
    await expect(provider().handleWebhook({ query: { token: 'x' }, body: sample() })).rejects.toBeInstanceOf(FinancialError);
    await expect(provider().handleWebhook({ query: {}, body: sample() })).rejects.toBeInstanceOf(FinancialError);
    const other = sample();
    other.dadosEvento.numeroConvenio = 999999;
    await expect(provider().handleWebhook({ query: { token: SECRET }, body: other })).rejects.toThrow();
    await expect(provider().handleWebhook({ query: { token: SECRET }, body: { codigoEvento: 9, dadosEvento: {} } })).rejects.toThrow();
  });

  it('does not offer Pix until credentials and the mTLS certificate are configured', async () => {
    const p = provider();
    expect(p.has('pix')).toBe(false);
    expect(p.has('pixWebhook')).toBe(true);
    expect(p.getCapabilities().reasons.pix).toMatch(/BB_CLIENT_ID.*BB_MTLS_CERT_BASE64/);
    await expect(p.createPixCharge({ paymentId: 'x', amountCents: 100 })).rejects.toThrow();
  });

  it('requires the secret and the convênio in production', () => {
    const base = { NODE_ENV: 'production', DATABASE_URL: 'postgres://x', APP_URL: 'https://x', SESSION_SECRET: 's'.repeat(40), ACTIVATION_TOKEN_SECRET: 'a'.repeat(40), PASSWORD_RESET_SECRET: 'p'.repeat(40), PAYMENT_PROVIDER: 'bb_pay' };
    expect(() => loadConfig(base)).toThrow(/BB_PAY_CONVENIO/);
    expect(() => loadConfig({ ...base, BB_WEBHOOK_SECRET: SECRET, BB_PAY_CONVENIO: '421.378' })).not.toThrow();
    expect(loadConfig({ ...base, BB_WEBHOOK_SECRET: SECRET, BB_PAY_CONVENIO: '421.378' }).bbPay.convenio).toBe('421378');
    // Pasted straight from the portal's convênio field: only the number counts.
    expect(loadConfig({ ...base, BB_WEBHOOK_SECRET: SECRET, BB_PAY_CONVENIO: '421378 - 36 937 554 GUTEMBERG BISP' }).bbPay.convenio).toBe('421378');
  });

  it('accepts the company certificate as a .pfx with its password, or as a PEM pair', () => {
    const base = { NODE_ENV: 'test', PAYMENT_PROVIDER: 'bb_pay' };
    expect(loadConfig({ ...base, BB_MTLS_PFX_BASE64: 'cGZ4', BB_MTLS_PFX_PASSPHRASE: 'senha' }).bbPay.mtls).toEqual({ pfxBase64: 'cGZ4', passphrase: 'senha' });
    expect(loadConfig({ ...base, BB_MTLS_CERT_BASE64: 'Y2VydA==', BB_MTLS_KEY_BASE64: 'a2V5' }).bbPay.mtls).toEqual({ certBase64: 'Y2VydA==', keyBase64: 'a2V5' });
    expect(loadConfig(base).bbPay.mtls).toBeNull();
  });
});

/** In-memory fake of the BB Pay v2 API (no live banking API is ever called). */
function fakeBbPay() {
  const state = { calls: [], requests: new Map(), next: 9001 };
  const res = (status, data) => ({ ok: status < 400, status, json: async () => data });
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url);
    state.calls.push({ method: opts.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body: opts.body && String(opts.body).startsWith('{') ? JSON.parse(opts.body) : opts.body ?? null });
    if (u.pathname === '/oauth/token') return res(200, { access_token: 'tok', expires_in: 600 });
    if (opts.method === 'POST' && u.pathname === '/v2/solicitacoes') {
      const b = JSON.parse(opts.body);
      // Like the bank: the convênio must come inside "geral".
      if (!b.geral?.numeroConvenio) return res(400, { erros: [{ codigo: '5923577', mensagem: 'O número do convênio não foi informado. (5923577-052)' }] });
      const numero = state.next++;
      state.requests.set(numero, { ...b.geral, numeroSolicitacao: numero, codigoEstadoSolicitacao: 0 });
      const pix = { textoQrCode: `00020126BBPAY${numero}`, txId: `TX${numero}` };
      return res(201, { numeroSolicitacao: numero, timestampCriacaoSolicitacao: '2026-10-15T10:00:00', urlSolicitacao: `https://bbpay.apps.bb.com.br/m/#/${numero}`, ...(state.pixOnlyOnRead ? {} : { informacoesPix: pix }) });
    }
    const one = u.pathname.match(/^\/v2\/solicitacoes\/(\d+)$/);
    if (opts.method === 'GET' && one) {
      const r = state.requests.get(Number(one[1]));
      if (!r) return res(404, { erros: [{ codigo: '404', mensagem: 'não encontrada' }] });
      return res(200, { ...r, informacoesPix: { textoQrCode: `00020126BBPAY${r.numeroSolicitacao}`, txId: `TX${r.numeroSolicitacao}` } });
    }
    if (opts.method === 'GET' && u.pathname === '/v2/solicitacoes') {
      const list = [...state.requests.values()].filter((r) => r.codigoConciliacaoSolicitacao === u.searchParams.get('codigoConciliacaoSolicitacao'));
      return res(200, { totalRegistros: list.length, listaSolicitacoes: list.map((r) => ({ numeroSolicitacao: r.numeroSolicitacao, codigoEstadoSolicitacao: r.codigoEstadoSolicitacao, codigoConciliacaoSolicitacao: r.codigoConciliacaoSolicitacao, valorSolicitacao: r.valorSolicitacao })) });
    }
    return res(404, {});
  };
  return { state, fetchImpl };
}

const READY = {
  environment: 'production',
  convenio: '421378',
  webhookSecret: SECRET,
  clientId: 'cid',
  clientSecret: 'csecret',
  appKey: 'appkey',
  apiBaseUrl: 'https://bbpay.fake/v2',
  oauthUrl: 'https://bbpay.fake/oauth/token',
  scopes: '',
  appKeyParam: 'gw-dev-app-key',
  mtls: { certBase64: 'x', keyBase64: 'y' },
};

describe('BB Pay payment requests', () => {
  it('creates a single-payment Pix request with our conciliation code and returns the QR code', async () => {
    const bb = fakeBbPay();
    const p = new BbPayPaymentProvider({ bbPay: READY, fetchImpl: bb.fetchImpl });
    expect(p.has('pix')).toBe(true);
    const deadline = new Date('2026-10-15T15:00:00Z');
    const charge = await p.createPixCharge({ paymentId: 'cm9pay01', amountCents: 20000, description: 'Taxa de cadastro TemPix', expiresAt: deadline });

    const post = bb.state.calls.find((c) => c.method === 'POST' && c.path === '/v2/solicitacoes');
    expect(post.query['gw-dev-app-key']).toBe('appkey');
    expect(post.body).toEqual({
      geral: {
        numeroConvenio: 421378,
        pagamentoUnico: true,
        timestampLimiteSolicitacao: '2026-10-15T15:00:00Z',
        valorSolicitacao: 200,
        codigoConciliacaoSolicitacao: 'TPcm9pay01',
        descricaoSolicitacao: 'Taxa de cadastro TemPix',
      },
      formasPagamento: [{ codigoTipoPagamento: 'PIX', quantidadeParcelas: 1 }],
    });
    expect(charge.providerPaymentId).toBe('9001:TPcm9pay01');
    expect(charge.copyPaste).toBe('00020126BBPAY9001');
    expect(charge.qrCodeBase64.length).toBeGreaterThan(100);
    expect(charge.expiresAt).toEqual(deadline);
  });

  it('reads the Pix text back from the bank when the creation response does not carry it', async () => {
    const bb = fakeBbPay();
    bb.state.pixOnlyOnRead = true;
    const p = new BbPayPaymentProvider({ bbPay: READY, fetchImpl: bb.fetchImpl, sleep: async () => {} });
    const charge = await p.createPixCharge({ paymentId: 'cm9pay05', amountCents: 100, description: 'Taxa', expiresAt: new Date(Date.now() + 3600e3) });
    expect(charge.copyPaste).toBe(`00020126BBPAY${charge.metadata.numeroSolicitacao}`);
    const read = bb.state.calls.find((c) => c.method === 'GET' && /\/v2\/solicitacoes\/\d+$/.test(c.path));
    expect(read.query.numeroConvenio).toBe('421378');
  });

  it('reads the state back from the bank, and confirms a webhook only when the bank says it is paid', async () => {
    const bb = fakeBbPay();
    const p = new BbPayPaymentProvider({ bbPay: READY, fetchImpl: bb.fetchImpl });
    const charge = await p.createPixCharge({ paymentId: 'cm9pay02', amountCents: 20000, description: 'x', expiresAt: new Date(Date.now() + 3600_000) });
    expect((await p.getPaymentStatus(charge.providerPaymentId)).status).toBe('PENDING');

    const paidEvent = { codigoEvento: 1, dadosEvento: { numeroConvenio: 421378, numeroSolicitacao: 9001, numeroPagamento: 1, valorOriginal: 200, codigoConciliacaoSolicitacao: 'TPcm9pay02' } };
    // Forged "paid" while the bank still says "aguardando pagamento": refused.
    await expect(p.handleWebhook({ query: { token: SECRET }, body: paidEvent })).rejects.toBeInstanceOf(FinancialError);

    bb.state.requests.get(9001).codigoEstadoSolicitacao = 1;
    const st = await p.getPaymentStatus(charge.providerPaymentId);
    expect(st).toMatchObject({ status: 'CONFIRMED', amountCents: 20000 });
    const [ev] = await p.handleWebhook({ query: { token: SECRET }, body: paidEvent });
    expect(ev).toMatchObject({ providerPaymentId: '9001:TPcm9pay02', status: 'CONFIRMED', amountCents: 20000 });
  });

  it('maps expired, abandoned and deleted requests', async () => {
    const bb = fakeBbPay();
    const p = new BbPayPaymentProvider({ bbPay: READY, fetchImpl: bb.fetchImpl });
    const charge = await p.createPixCharge({ paymentId: 'cm9pay03', amountCents: 100, description: 'x' });
    for (const [code, status] of [[800, 'EXPIRED'], [850, 'EXPIRED'], [900, 'CANCELED']]) {
      bb.state.requests.get(9001).codigoEstadoSolicitacao = code;
      expect((await p.getPaymentStatus(charge.providerPaymentId)).status).toBe(status);
    }
  });
});
