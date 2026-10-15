import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { disconnectPrisma } from '@autopix/core';
import { setupApp, resetDb, client, hasDb, createActiveUser, PROFILE, testCnpj } from './helpers.js';

const SUPPLIER = {
  types: ['guindastes_munck'],
  objectives: ['oferecer_equipamentos', 'encontrar_compradores'],
  heavy: { rental: true, seeksBuyers: true },
  equipment: [{ type: 'munck', capacityTons: 12, operator: 'com', rental: true, usage: 'oferece', regions: ['Campinas'] }],
};
const BUYER = {
  types: ['construtora_contratante'],
  objectives: ['contratar_equipamentos'],
  buyer: { needs: ['munck'], requests: [{ need: 'munck', minCapacityTons: 12, requiresOperator: true, location: 'Campinas', durationDays: 5 }] },
};

describe.skipIf(!hasDb)('operational profile and intermediation', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setupApp();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('stores the profile from onboarding and refuses values outside the catalogs', async () => {
    const c = client(ctx.app);
    await c.post('/api/onboarding/start', { name: 'Ana Souza', email: `op-${Date.now()}@empresa.example`, companyName: 'Usinagem Ana', document: testCnpj() });
    const bad = await c.put('/api/onboarding/step', { step: 2, data: { operationalProfile: { types: ['nave_espacial'] } } });
    expect(bad.status).toBe(400);
    const ok = await c.put('/api/onboarding/step', {
      step: 2,
      data: { operationalProfile: { types: ['usinagem'], equipment: [{ type: 'torno', maxDiameterMm: '650', maxLengthMm: 2000, quantity: 2 }] } },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.company.operationalProfile.equipment[0]).toMatchObject({ type: 'torno', maxDiameterMm: 650, quantity: 2 });
    expect(ok.body.company.operationalProfileUpdatedAt).toBeTruthy();
    // The rest of the signup still completes as before.
    expect((await c.put('/api/onboarding/step', { step: 30, data: PROFILE, complete: true })).status).toBe(200);
  });

  it('finds the compatible supplier for the buyer and vice versa, anonymously', async () => {
    const supplier = await createActiveUser(ctx.app);
    const buyer = await createActiveUser(ctx.app);
    const other = await createActiveUser(ctx.app);
    expect((await supplier.c.put('/api/company', { city: 'Campinas', state: 'SP', operationalProfile: SUPPLIER })).status).toBe(200);
    expect((await buyer.c.put('/api/company', { city: 'Campinas', state: 'SP', operationalProfile: BUYER })).status).toBe(200);
    // A smaller munck does not qualify.
    await other.c.put('/api/company', { operationalProfile: { ...SUPPLIER, equipment: [{ ...SUPPLIER.equipment[0], capacityTons: 8 }] } });

    const forBuyer = await buyer.c.get('/api/intermediation');
    expect(forBuyer.status).toBe(200);
    expect(forBuyer.body.suppliers).toHaveLength(1);
    expect(forBuyer.body.suppliers[0]).toMatchObject({ label: 'Guindastes / Munck · Campinas/SP' });
    expect(forBuyer.body.counts.equipmentDemands).toBe(1);

    const forSupplier = await supplier.c.get('/api/intermediation');
    expect(forSupplier.body.buyers).toHaveLength(1);
    expect(forSupplier.body.counts.equipmentOffered).toBe(1);
    expect(forSupplier.body.capabilities).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Munck' })]));
    // Never the counterpart's name, CNPJ or e-mail.
    const raw = JSON.stringify(forSupplier.body);
    expect(raw).not.toContain(buyer.cnpj);
    expect(raw).not.toContain(buyer.email);
    expect(raw).not.toMatch(/Empresa \d+/);

    expect((await client(ctx.app).get('/api/intermediation')).status).toBe(401);
  });
});
