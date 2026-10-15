import { describe, expect, it } from 'vitest';
import {
  capabilitySummary,
  matchBuyerSupplier,
  matchRequirement,
  modulesFor,
  normalizeOperationalProfile,
  operationalProfileSchema,
  operationTypesFor,
  profileCompleteness,
  rankCandidates,
} from '../src/index.js';

const co = (profile, extra = {}) => ({ profile: operationalProfileSchema.parse(profile), ...extra });

describe('question engine', () => {
  it('shows only the modules that apply to the operation', () => {
    const ids = (p, t = 'COMPANY') => modulesFor(normalizeOperationalProfile(p), t).map((m) => m.id);
    expect(ids({ types: ['usinagem'] })).toEqual(['industrial_servicos', 'industrial_maquinas', 'industrial_estrutura', 'mercado']);
    expect(ids({ types: ['transportadora'] })).toEqual(['transporte_frota', 'transporte_containers', 'transporte_rotas', 'mercado']);
    // One equipment list, never three.
    const both = ids({ types: ['obras_montagem', 'guindastes_munck'] });
    expect(both.filter((x) => x.includes('equipamentos'))).toEqual(['pesados_equipamentos']);
    // Buyer details only once a need is chosen.
    expect(ids({ types: ['comprador_equipamentos'] })).not.toContain('compra_detalhes');
    expect(ids({ types: ['comprador_equipamentos'], buyer: { needs: ['munck'] } })).toContain('compra_detalhes');
    // Professionals (CPF) get no company-only module.
    expect(ids({ types: ['caminhoneiro'] }, 'PERSON')).toEqual(['caminhoneiro', 'transporte_containers', 'transporte_rotas']);
    expect(operationTypesFor('PERSON').map((t) => t.id)).toContain('caminhoneiro');
    expect(operationTypesFor('PERSON').map((t) => t.id)).not.toContain('terminal_portuario');
    expect(operationTypesFor('COMPANY').map((t) => t.id)).not.toContain('profissional_autonomo');
  });

  it('rejects values outside the catalogs and keeps a full shape', () => {
    expect(operationalProfileSchema.safeParse({ types: ['nave_espacial'] }).success).toBe(false);
    const p = normalizeOperationalProfile({ types: ['usinagem'], equipment: [{ type: 'torno', maxDiameterMm: '650', quantity: '2' }] });
    expect(p.equipment[0]).toMatchObject({ type: 'torno', maxDiameterMm: 650, quantity: 2, regions: [] });
    expect(p.fleet.vehicles).toEqual([]);
  });

  it('measures completeness', () => {
    expect(profileCompleteness(null, { accountType: 'COMPANY' })).toBe(0);
    const some = profileCompleteness({ types: ['usinagem'], objectives: ['encontrar_compradores'], industrial: { services: ['torneamento'] } }, { accountType: 'COMPANY', company: { city: 'Santos' } });
    expect(some).toBeGreaterThan(30);
    expect(some).toBeLessThan(80);
  });
});

describe('matching', () => {
  const metalA = co({ types: ['usinagem'], industrial: { services: ['torneamento'] }, equipment: [{ type: 'torno', maxDiameterMm: 300, maxLengthMm: 1500 }], capabilities: { externalTeam: false, portAreas: false } }, { city: 'Santos' });
  const metalB = co(
    {
      types: ['usinagem'],
      industrial: { services: ['torneamento'], wantsBuyers: true },
      equipment: [{ type: 'torno', maxDiameterMm: 650, maxLengthMm: 2000 }],
      capabilities: { externalTeam: true, emergency: true, portAreas: true },
    },
    { city: 'Santos' },
  );

  it('sends a Ø500 shaft on a ship to Metalúrgica B, not A', () => {
    const req = { services: ['torneamento'], equipment: { type: 'torno', minDiameterMm: 500, minLengthMm: 1500 }, location: 'Porto de Santos', emergency: true, portAccess: true, directSupply: true };
    expect(matchRequirement(metalA, req).compatible).toBe(false);
    const b = matchRequirement(metalB, req);
    expect(b.compatible).toBe(true);
    expect(b.score).toBe(100);
    const ranked = rankCandidates([metalA, metalB], req);
    expect(ranked[0].candidate).toBe(metalB);
  });

  it('matches a 40 HC pickup in Santos to Caminhoneiro B only', () => {
    const truckerA = co({ types: ['caminhoneiro'], trucker: { truckType: 'truck', availability: 'hoje' }, containers: { transports: false } }, { city: 'Santos' });
    const truckerB = co(
      { types: ['caminhoneiro'], trucker: { truckType: 'cavalo_mecanico', portAccess: 'sim', availability: 'hoje' }, containers: { transports: true, types: ['40hc'] }, routes: { baseCity: 'Santos', regions: ['campinas_regiao'] } },
      { city: 'Santos' },
    );
    const req = { container: '40hc', lane: { from: 'Santos', to: 'Campinas' }, availability: 'hoje', portAccess: true };
    expect(matchRequirement(truckerA, req).compatible).toBe(false);
    expect(matchRequirement(truckerB, req)).toMatchObject({ compatible: true, score: 100 });
  });

  it('routes a steel-truss warehouse job to Empresa de obras B', () => {
    const obraA = co({ types: ['construcao'], construction: { types: ['manutencao_predial'] } }, { city: 'Campinas' });
    const obraB = co(
      {
        types: ['obras_montagem'],
        construction: { types: ['montagem_galpoes', 'estruturas_metalicas'], weldingTeam: true, heightTeam: true, industrialPort: true },
        equipment: [{ type: 'munck', capacityTons: 12, heightM: 14, operator: 'com' }],
      },
      { city: 'Campinas' },
    );
    const req = { services: ['montagem_galpoes', 'estruturas_metalicas'], equipment: { type: 'munck', minCapacityTons: 8, minHeightM: 12 }, teams: ['soldagem', 'altura'], location: 'Campinas' };
    expect(matchRequirement(obraA, req).compatible).toBe(false);
    expect(matchRequirement(obraB, req).compatible).toBe(true);
  });

  it('connects a 12 t munck supplier with a buyer who needs one in Campinas', () => {
    const supplier = co(
      { types: ['guindastes_munck'], heavy: { rental: true, seeksBuyers: true }, equipment: [{ type: 'munck', capacityTons: 12, operator: 'com', rental: true, usage: 'oferece', regions: ['Campinas'] }] },
      { city: 'Campinas' },
    );
    const buyer = co(
      { types: ['construtora_contratante'], buyer: { needs: ['munck'], requests: [{ need: 'munck', minCapacityTons: 12, requiresOperator: true, location: 'Campinas', durationDays: 5 }] } },
      { city: 'Campinas' },
    );
    const smaller = co({ types: ['guindastes_munck'], equipment: [{ type: 'munck', capacityTons: 8, operator: 'com', usage: 'oferece' }] }, { city: 'Campinas' });
    expect(matchBuyerSupplier(buyer, supplier).compatible).toBe(true);
    expect(matchBuyerSupplier(buyer, smaller).compatible).toBe(false);
  });

  it('connects a 50 t crane for rent with an industrial job in Santos', () => {
    const crane = co(
      { types: ['locacao_maquinas'], heavy: { rental: true, industrialPort: true }, equipment: [{ type: 'guindaste_telescopico', capacityTons: 50, usage: 'oferece' }], routes: { regions: ['baixada_santista'] } },
      { city: 'Cubatão' },
    );
    const buyer = co({ types: ['comprador_equipamentos'], buyer: { requests: [{ need: 'guindaste', minCapacityTons: 50, location: 'Santos', serviceType: 'Montagem industrial' }] } });
    expect(matchBuyerSupplier(buyer, crane)).toMatchObject({ compatible: true });
  });

  it('summarizes capabilities so similar companies read differently', () => {
    const lines = capabilitySummary(metalB.profile, { city: 'Santos', state: 'SP' });
    expect(lines).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Torno', value: '1 · Ø650 mm · 2.000 mm' }), expect.objectContaining({ label: 'Atendimento externo', value: 'Sim' })]));
    expect(capabilitySummary(metalA.profile).find((l) => l.label === 'Atendimento externo')?.value).toBe('Não');
  });
});
