import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { disconnectPrisma, getPrisma } from '@autopix/core';
import { setupApp, resetDb, client, hasDb, testCpf, PROFILE } from './helpers.js';

describe.skipIf(!hasDb)('pessoa física: CEP obrigatório no cadastro', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp({ BILLING_MODEL: 'commission', COMPANY_SIGNUP_FEE_CENTS: '20000' });
  });
  beforeEach(async () => {
    await resetDb(getPrisma());
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('does not finish a pessoa física without the CEP, and keeps it once given', async () => {
    const c = client(ctx.app);
    expect((await c.post('/api/onboarding/start', { accountType: 'PERSON', name: 'Zé Trabalhador', email: 'ze@ex.example', document: testCpf() })).status).toBe(201);

    const { postalCode, ...semCepData } = PROFILE;
    const semCep = await c.put('/api/onboarding/step', { step: 4, data: semCepData, complete: true });
    expect(semCep.status).toBe(400);
    expect(JSON.stringify(semCep.body)).toMatch(/CEP/);

    const comCep = await c.put('/api/onboarding/step', { step: 4, data: { ...semCepData, postalCode: '89201000' }, complete: true });
    expect(comCep.status).toBe(200);
    const saved = await getPrisma().company.findFirst({ where: { accountType: 'PERSON' } });
    expect(saved.postalCode).toBe('89201000');
  });
});
