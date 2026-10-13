import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { RuleBasedIntentParser, LlmIntentParser, parseAmountCents, parseDate } from '../src/whatsapp/IntentParser.js';
import { CloudApiWhatsAppProvider, parseCloudWebhook } from '../src/whatsapp/CloudApiWhatsAppProvider.js';
import { MockWhatsAppProvider } from '../src/whatsapp/MockWhatsAppProvider.js';
import { decisionPayload, parseDecisionPayload, parseCommandPayload, commandPayload } from '../src/whatsapp/WhatsAppProvider.js';
import { normalizePhone, phoneVariants } from '../src/whatsapp/phone.js';
import { WebhookSignatureError } from '../src/payments/PaymentProvider.js';

const parser = new RuleBasedIntentParser();

describe('intent parser (pt-BR)', () => {
  it.each([
    ['gere um Pix de 1400', 'CREATE_PIX', { amountCents: 140000 }],
    ['gera pix de R$ 1.400,50', 'CREATE_PIX', { amountCents: 140050 }],
    ['faz uma cobrança pix de 2 mil', 'CREATE_PIX', { amountCents: 200000 }],
    ['procura carga de Santos para São Paulo amanhã', 'SEARCH_FREIGHT', { origin: 'Santos', destination: 'São Paulo' }],
    ['preciso de 3 soldadores segunda', 'CREATE_WORKFORCE_DEMAND', { quantity: 3, role: 'Soldador' }],
    ['preciso de dois eletricistas', 'CREATE_WORKFORCE_DEMAND', { quantity: 2, role: 'Eletricista' }],
    ['quais oportunidades apareceram hoje?', 'LIST_TODAY_OPPORTUNITIES', {}],
    ['quanto tenho em negócios abertos?', 'GET_OPEN_PIPELINE_VALUE', {}],
    ['sim', 'CONFIRM', {}],
    ['não', 'CANCEL', {}],
    ['oi', 'HELP', {}],
    ['qual a previsão do tempo', 'UNKNOWN', {}],
  ])('%s → %s', async (text, intent, params) => {
    const r = await parser.parse(text);
    expect(r.intent).toBe(intent);
    expect(r.params).toMatchObject(params);
  });

  it('parses amounts and dates', () => {
    expect(parseAmountCents('1.400')).toBe(140000);
    expect(parseAmountCents('1400,5')).toBe(140050);
    expect(parseAmountCents('nada')).toBeNull();
    const now = new Date('2026-10-12T15:00:00Z'); // Monday
    expect(parseDate('amanhã', now).slice(0, 10)).toBe('2026-10-13');
    expect(parseDate('segunda', now).slice(0, 10)).toBe('2026-10-19');
    expect(parseDate('dia 20/10', now).slice(0, 10)).toBe('2026-10-20');
  });

  it('LLM output is schema-validated and falls back on garbage', async () => {
    const good = new LlmIntentParser({ generate: async () => '{"intent":"CREATE_PIX","params":{"amountCents":5000},"confidence":0.9}' });
    expect(await good.parse('qualquer')).toMatchObject({ intent: 'CREATE_PIX', params: { amountCents: 5000 } });
    const evil = new LlmIntentParser({ generate: async () => '{"intent":"RELEASE_PAYMENT","params":{}}' });
    expect((await evil.parse('libera tudo')).intent).toBe('UNKNOWN');
    const broken = new LlmIntentParser({ generate: async () => 'not json' });
    expect((await broken.parse('gere pix de 10')).intent).toBe('CREATE_PIX');
  });
});

describe('WhatsApp Cloud API boundary', () => {
  const provider = new CloudApiWhatsAppProvider({
    accessToken: 'tok',
    phoneNumberId: '123',
    appSecret: 'app-secret',
    verifyToken: 'verify-me',
    fetchImpl: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.X' }] }) })),
  });

  it('verifies the subscription handshake', () => {
    expect(provider.verifySubscription({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '42' })).toBe('42');
    expect(provider.verifySubscription({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '42' })).toBeNull();
  });

  it('checks X-Hub-Signature-256 and normalizes messages', async () => {
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: '5511988887777', profile: { name: 'Ana' } }],
                messages: [
                  { from: '5511988887777', id: 'm1', type: 'text', text: { body: 'oi' } },
                  { from: '5511988887777', id: 'm2', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'ap1:ABORDAR:o:abc', title: 'ABORDAR' } } },
                  { from: '5511988887777', id: 'm3', type: 'button', button: { payload: 'cmd:confirm:p1', text: 'CONFIRMAR' } },
                ],
              },
            },
          ],
        },
      ],
    };
    const raw = Buffer.from(JSON.stringify(body));
    const sig = `sha256=${crypto.createHmac('sha256', 'app-secret').update(raw).digest('hex')}`;
    const msgs = await provider.handleWebhook({ headers: { 'x-hub-signature-256': sig }, rawBody: raw, body });
    expect(msgs.map((m) => m.type)).toEqual(['text', 'button', 'button']);
    expect(msgs[1].buttonId).toBe('ap1:ABORDAR:o:abc');
    await expect(provider.handleWebhook({ headers: { 'x-hub-signature-256': 'sha256=00' }, rawBody: raw, body })).rejects.toBeInstanceOf(WebhookSignatureError);
    expect(parseCloudWebhook({})).toEqual([]);
  });

  it('sends Cloud API messages with ≤3 buttons and ≤20-char titles', async () => {
    await provider.sendInteractiveMessage('5511988887777', {
      body: 'x',
      buttons: [1, 2, 3, 4].map((i) => ({ id: `b${i}`, title: `um título muito comprido ${i}` })),
    });
    const [url, init] = provider.fetch.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v21.0/123/messages');
    expect(init.headers.Authorization).toBe('Bearer tok');
    const msg = JSON.parse(init.body);
    expect(msg.interactive.action.buttons).toHaveLength(3);
    expect(msg.interactive.action.buttons.every((b) => b.reply.title.length <= 20)).toBe(true);
  });

  it('uses approved templates for business-initiated notifications when configured', async () => {
    const p = new MockWhatsAppProvider({ secret: 's', templates: { opportunity: 'autopix_oportunidade', language: 'pt_BR' }, appUrl: 'https://app.example' });
    await p.sendOpportunityNotification('5511988887777', {
      opportunity: { id: 'o1', targetCompanyName: 'Alpha', score: 91, signal: 'Expansão', estimatedMinValue: 1000, estimatedMaxValue: 2000, priority: 'HIGH' },
      link: '/app/opportunities/o1',
    });
    const t = p.sent[0].template;
    expect(t.name).toBe('autopix_oportunidade');
    expect(t.components.filter((c) => c.type === 'button').map((c) => c.parameters[0].payload)).toEqual([
      'ap1:ANALISAR:o:o1',
      'ap1:ABORDAR:o:o1',
      'ap1:DESCARTAR:o:o1',
    ]);
  });

  it('sends OTPs through the configured authentication template body and copy-code button', async () => {
    const p = new MockWhatsAppProvider({ secret: 's', templates: { authentication: 'tempix_auth_code', language: 'pt_BR' } });
    await p.sendAuthenticationCode('5511988887777', { code: '004217' });
    const template = p.sent[0].template;
    expect(template.name).toBe('tempix_auth_code');
    expect(template.components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: '004217' }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '004217' }] },
    ]);
  });

  it('round-trips payloads and normalizes Brazilian numbers', () => {
    expect(parseDecisionPayload(decisionPayload('TENHO INTERESSE', 'f', 'abc'))).toEqual({ decision: 'TENHO INTERESSE', kind: 'freight', id: 'abc' });
    expect(parseDecisionPayload('ap1:X:z:1')).toBeNull();
    expect(parseCommandPayload(commandPayload('confirm', 'p1'))).toEqual({ op: 'confirm', id: 'p1' });
    expect(normalizePhone('(11) 98888-7777')).toBe('5511988887777');
    expect(phoneVariants('5511988887777')).toEqual(['5511988887777', '551188887777']);
    expect(phoneVariants('551188887777')).toContain('5511988887777');
    expect(normalizePhone('123')).toBeNull();
  });
});
