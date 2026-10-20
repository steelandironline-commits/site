import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { disconnectPrisma, HELP_TEXT } from '@autopix/core';
import { setupApp, resetDb, hasDb } from './helpers.js';
import { AREA_ENV, makeAccount } from './authAreaHelpers.js';

// 4c · item F. O WhatsApp de entrada vale pela área do dono do número: a ajuda lista só o que a área
// pode pedir, e uma intenção de outra área é recusada ANTES do pedido de confirmação (antes o CPF
// recebia o botão de confirmar um Pix, uma carga ou uma equipe, e só no "sim" vinha a negativa).

const DENIED = 'Não foi possível concluir: Ação desconhecida.';
const COMPANY_ONLY = /oportunidade|neg[óo]cio|carga|soldador|\bPix\b|equipe/i;

const PIX = 'gere um Pix de 1400';
const FREIGHT = 'procura carga de Santos para São Paulo amanhã';
const CREW = 'preciso de 3 soldadores segunda';

function inboundOf(ctx) {
  const wa = ctx.services.whatsappProvider;
  return (from, payload) => {
    const wh = wa.buildInbound({ from, ...payload });
    const req = request(ctx.app).post('/api/webhooks/whatsapp').set('Content-Type', 'application/json');
    for (const [k, v] of Object.entries(wh.headers)) req.set(k, v);
    return req.send(wh.rawBody);
  };
}
const bodyOf = (m) => m?.text?.body || m?.interactive?.body?.text || '';

describe.skipIf(!hasDb)('WhatsApp por área · modo de áreas', () => {
  let ctx;
  let company;
  let person;
  let inbound;
  let phone;

  const say = async (who, text) => {
    const wa = ctx.services.whatsappProvider;
    wa.sent.length = 0;
    await inbound(phone[who], { text });
    return wa.sent.map(bodyOf);
  };

  beforeAll(async () => {
    ctx = await setupApp({ ...AREA_ENV, DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
    company = await makeAccount(ctx.prisma, { accountType: 'COMPANY', whatsapp: true });
    person = await makeAccount(ctx.prisma, { accountType: 'PERSON', whatsapp: true });
    inbound = inboundOf(ctx);
    phone = {
      company: (await ctx.prisma.whatsAppConnection.findUnique({ where: { userId: company.user.id } })).phoneNumber,
      person: (await ctx.prisma.whatsAppConnection.findUnique({ where: { userId: person.user.id } })).phoneNumber,
    };
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('a ajuda da empresa é a de sempre; a da pessoa não cita nada que é só da empresa', async () => {
    expect(await say('company', 'ajuda')).toEqual([HELP_TEXT]);
    const [help] = await say('person', 'ajuda');
    expect(help).toBeTruthy();
    expect(help).not.toMatch(COMPANY_ONLY);
    expect(help).not.toBe(HELP_TEXT);
  });

  it('texto que o parser não entende devolve a ajuda da própria área', async () => {
    const [cnpj] = await say('company', 'blablabla qualquer coisa');
    expect(cnpj).toBe(`Não entendi. ${HELP_TEXT}`);
    const [cpf] = await say('person', 'blablabla qualquer coisa');
    expect(cpf).toMatch(/^Não entendi\./);
    expect(cpf).not.toMatch(COMPANY_ONLY);
  });

  it('pedido de Pix, carga ou equipe da pessoa é recusado sem pedir confirmação nem gravar pendência', async () => {
    for (const text of [PIX, FREIGHT, CREW, 'quais oportunidades apareceram hoje?', 'quanto tenho em negócios abertos?']) {
      const out = await say('person', text);
      expect(out, text).toEqual([DENIED]);
    }
    expect(ctx.services.whatsappProvider.sent.some((m) => m.interactive)).toBe(false);
    expect(await ctx.prisma.whatsAppPendingCommand.count({ where: { connection: { userId: person.user.id } } })).toBe(0);
  });

  it('a empresa continua recebendo o pedido de confirmação dos três comandos', async () => {
    for (const text of [PIX, FREIGHT, CREW]) {
      const out = await say('company', text);
      expect(out, text).toHaveLength(1);
      expect(out[0], text).toMatch(/Responda SIM para confirmar/);
    }
    expect(await ctx.prisma.whatsAppPendingCommand.count({ where: { connection: { userId: company.user.id }, status: 'PENDING' } })).toBe(1);
  });

  it('confirmar ("sim") sem pendência continua respondendo o mesmo à pessoa', async () => {
    const [out] = await say('person', 'sim');
    expect(out).toBe('Não há nenhuma ação aguardando confirmação.');
  });
});

describe.skipIf(!hasDb)('WhatsApp por área · modo legado, como antes', () => {
  let ctx;
  let person;
  let phone;
  let inbound;

  beforeAll(async () => {
    ctx = await setupApp({ DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
    person = await makeAccount(ctx.prisma, { accountType: 'PERSON', whatsapp: true });
    phone = (await ctx.prisma.whatsAppConnection.findUnique({ where: { userId: person.user.id } })).phoneNumber;
    inbound = inboundOf(ctx);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('a ajuda e os pedidos de confirmação são os mesmos para qualquer conta', async () => {
    const wa = ctx.services.whatsappProvider;
    wa.sent.length = 0;
    await inbound(phone, { text: 'ajuda' });
    expect(wa.sent.map(bodyOf)).toEqual([HELP_TEXT]);
    wa.sent.length = 0;
    await inbound(phone, { text: PIX });
    expect(wa.sent.map(bodyOf)[0]).toMatch(/Responda SIM para confirmar/);
    wa.sent.length = 0;
    await inbound(phone, { text: 'blablabla qualquer coisa' });
    expect(wa.sent.map(bodyOf)).toEqual([`Não entendi. ${HELP_TEXT}`]);
  });
});
