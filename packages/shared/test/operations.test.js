import { describe, expect, it } from 'vitest';
import {
  capabilitySummary,
  conditionMet,
  matchBuyerSupplier,
  matchRequirement,
  modulesFor,
  normalizeOperationalProfile,
  operationalProfileSchema,
  BUSINESS_OBJECTIVES,
  OPERATION_TYPES,
  operationTypesFor,
  optionsFor,
  profileCompleteness,
  rankCandidates,
} from '../src/index.js';

const co = (profile, extra = {}) => ({ profile: operationalProfileSchema.parse(profile), ...extra });

describe('question engine', () => {
  it('shows only the modules that apply to the operation', () => {
    const ids = (p, t = 'COMPANY') => modulesFor(normalizeOperationalProfile(p), t).map((m) => m.id);
    expect(ids({ types: ['usinagem'] })).toEqual(['industrial_servicos', 'industrial_maquinas', 'industrial_estrutura', 'certificacoes', 'mercado']);
    expect(ids({ types: ['transportadora'] })).toEqual(['transporte_frota', 'transporte_containers', 'acesso_terminal', 'certificacoes', 'transporte_rotas', 'mercado']);
    // One equipment list, never three.
    const both = ids({ types: ['obras_montagem', 'guindastes_munck'] });
    expect(both.filter((x) => x.includes('equipamentos'))).toEqual(['pesados_equipamentos']);
    // Buyer details only once a need is chosen.
    expect(ids({ types: ['comprador_equipamentos'] })).not.toContain('compra_detalhes');
    expect(ids({ types: ['comprador_equipamentos'], buyer: { needs: ['munck'] } })).toContain('compra_detalhes');
    // Professionals (CPF) get no company-only module.
    expect(ids({ types: ['caminhoneiro'] }, 'PERSON')).toEqual(['caminhoneiro', 'transporte_containers', 'acesso_terminal', 'certificacoes', 'transporte_rotas']);
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

describe('pessoa física x CNPJ', () => {
  const ids = (catalog, type) => optionsFor(catalog, type).map((o) => o.id);

  it('offers people only the objectives that fit a person', () => {
    expect(ids(BUSINESS_OBJECTIVES, 'PERSON')).toEqual([
      'encontrar_compradores',
      'contratar_equipamentos',
      'oferecer_equipamentos',
      'encontrar_obras',
      'oferecer_servicos',
      'comprar_vender_equipamentos',
      'transportar_cargas',
      'outros',
    ]);
    expect(ids(BUSINESS_OBJECTIVES, 'COMPANY')).toEqual(BUSINESS_OBJECTIVES.map((o) => o.id));
  });

  it('gives the autonomous trucker a person label, and keeps MEI for companies', () => {
    const label = (type) => optionsFor(OPERATION_TYPES, type).find((o) => o.id === 'caminhoneiro').label;
    expect(label('PERSON')).toBe('Caminhoneiro autônomo');
    expect(label('COMPANY')).toBe('Caminhoneiro autônomo / MEI');
  });
});

describe('pessoa física: certificates and travel', () => {
  it('shows a worker her certificates, never company norms or the bulk NR shortcut', async () => {
    const pf = modulesFor({ types: ['caminhoneiro'], objectives: [] }, 'PERSON').find((m) => m.id === 'certificacoes');
    expect(pf.title).toBe('Certificados e habilitações');
    expect(pf.fields.map((f) => f.path)).not.toContain('certifications.norms');
    const nrs = pf.fields.find((f) => f.path === 'certifications.nrs');
    expect(nrs.bulk).toBeUndefined();
    expect(nrs.label).toBe('Treinamentos NR (segurança do trabalho)');
    expect(JSON.stringify(pf)).not.toMatch(/empresa|equipe/i);
    const co = modulesFor({ types: ['usinagem'], objectives: [] }, 'COMPANY').find((m) => m.id === 'certificacoes');
    expect(co.fields.map((f) => f.path)).toContain('certifications.norms');
    expect(co.title).toBe('Certificados e normas');
  });

  it('estimates the travel time at 80 km/h, one way and round trip', async () => {
    const { travelEstimate } = await import('../src/index.js');
    expect(travelEstimate(80)).toEqual({ oneWay: '1 h 00 min', roundTrip: '2 h 00 min' });
    expect(travelEstimate(50).oneWay).toBe('38 min');
    expect(travelEstimate(0)).toBeNull();
  });
});

describe('certificates and norms', () => {
  it('asks companies and people alike, and never requires the answer', () => {
    expect(modulesFor({ types: [], objectives: [] }, 'COMPANY').map((m) => m.id)).toContain('certificacoes');
    expect(modulesFor({ types: [], objectives: [] }, 'PERSON').map((m) => m.id)).toContain('certificacoes');
    const mod = modulesFor({ types: [], objectives: [] }, 'PERSON').find((m) => m.id === 'certificacoes');
    expect(mod.fields.every((f) => !f.required)).toBe(true);
  });

  it('stores only catalog ids and rejects anything else (no free text, no certificate numbers)', () => {
    expect(operationalProfileSchema.safeParse({ certifications: { nrs: ['nr-10', 'nr-35'], norms: ['iso-45001'], licenses: ['soldador'] } }).success).toBe(true);
    expect(operationalProfileSchema.safeParse({ certifications: { nrs: ['nr-99'] } }).success).toBe(false);
    expect(operationalProfileSchema.safeParse({ certifications: { licenses: ['CRC 123456'] } }).success).toBe(false);
  });

  it('lists the chosen certificates in the capability summary', () => {
    const lines = capabilitySummary({ certifications: { nrs: ['nr-10', 'nr-35'], licenses: ['soldador'] } }, {}).filter((x) => x.section === 'Certificações');
    expect(lines.find((x) => x.label === 'NRs').value).toContain('NR-35 · Trabalho em altura');
    expect(lines.find((x) => x.label === 'Habilitações').value).toBe('Soldador qualificado');
  });

  it('keeps 36 NRs in force and never offers the revoked NR-02 or NR-27', async () => {
    const { NRS } = await import('../src/index.js');
    expect(NRS).toHaveLength(36);
    expect(NRS.map((o) => o.id)).not.toContain('nr-02');
    expect(NRS.map((o) => o.id)).not.toContain('nr-27');
  });
});

describe('driving licence and terminal access', () => {
  const ids = (p, t = 'COMPANY') => modulesFor(normalizeOperationalProfile(p), t).map((m) => m.id);

  it('keeps the CNH category and validity, never the licence number', () => {
    const r = operationalProfileSchema.safeParse({ certifications: { cnh: { has: true, categories: ['C', 'E'], validUntil: '2028-03-01', number: '12345678901' } } });
    expect(r.success).toBe(true);
    expect(r.data.certifications.cnh).toEqual({ has: true, categories: ['C', 'E'], validUntil: '2028-03-01' });
  });

  it('accepts only real calendar dates and CNH categories from the catalog', () => {
    expect(operationalProfileSchema.safeParse({ certifications: { cnh: { validUntil: '2028-13-40' } } }).success).toBe(false);
    expect(operationalProfileSchema.safeParse({ certifications: { cnh: { validUntil: '10/03/2028' } } }).success).toBe(false);
    expect(operationalProfileSchema.safeParse({ certifications: { cnh: { categories: ['F'] } } }).success).toBe(false);
  });

  it('asks about terminal access only to logistics people and only details it when they have access', () => {
    expect(ids({ types: ['terminal_portuario'] })).toContain('acesso_terminal');
    expect(ids({ types: ['usinagem'] })).not.toContain('acesso_terminal');
    const mod = modulesFor(normalizeOperationalProfile({ types: ['caminhoneiro'] }), 'PERSON').find((m) => m.id === 'acesso_terminal');
    const shown = (p) => mod.fields.filter((f) => !f.when || conditionMet(f.when, normalizeOperationalProfile(p))).map((f) => f.path);
    expect(shown({ certifications: { terminal: { status: 'nao' } } })).toEqual(['certifications.terminal.status']);
    expect(shown({ certifications: { terminal: { status: 'sim' } } })).toEqual(['certifications.terminal.status', 'certifications.terminal.types', 'certifications.terminal.validUntil', 'certifications.terminal.registration']);
  });

  it('summarises the licence and the terminal access, and reads the old trucker answer as a fallback', () => {
    const line = (p, label) => capabilitySummary(p, {}).find((x) => x.label === label)?.value;
    const p = { certifications: { cnh: { has: true, categories: ['E'], validUntil: '2028-03-01' }, terminal: { status: 'sim', types: ['gate_caminhao'], validUntil: '2027-01-10', registration: 'CAD-88' } } };
    expect(line(p, 'CNH')).toBe('E · carreta e caminhão articulado · válida até 01/03/2028');
    expect(line(p, 'Acesso a terminal')).toBe('Gate de caminhão (entrada e saída) · válido até 10/01/2027 · cadastro CAD-88');
    expect(line({ trucker: { portAccess: 'em_processo' } }, 'Acesso a terminais')).toBe('Em processo');
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
