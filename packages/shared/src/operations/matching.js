/**
 * Matching engine: does this company's real capacity fit a requirement?
 * Hard constraints (service, equipment capacity, container type, route,
 * location, emergency, port access, teams, availability) decide
 * compatibility; soft signals only change the score. Pure functions, so the
 * same rules run in the API, the worker and tests.
 */
import { NEED_EQUIPMENT, PORTS, labelOf } from './catalog.js';
import { normalizeOperationalProfile } from './profile.js';

export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** "Joinville - SC", "Santos/SP" → "joinville", "santos". */
const placeName = (s) => norm(String(s ?? '').split(/[-/,(]/)[0]);

const REGION_PLACES = {
  baixada_santista: ['santos', 'guaruja', 'sao vicente', 'praia grande', 'cubatao', 'bertioga', 'baixada santista'],
  grande_sao_paulo: ['sao paulo', 'guarulhos', 'osasco', 'santo andre', 'sao bernardo do campo', 'barueri', 'diadema', 'maua', 'grande sao paulo'],
  campinas_regiao: ['campinas', 'sumare', 'hortolandia', 'valinhos', 'vinhedo', 'paulinia', 'americana', 'indaiatuba', 'jundiai'],
  interior_sp: ['campinas', 'sorocaba', 'ribeirao preto', 'piracicaba', 'jundiai', 'bauru', 'sao carlos', 'limeira', 'interior de sao paulo'],
  vale_paraiba: ['sao jose dos campos', 'taubate', 'jacarei', 'guaratingueta', 'vale do paraiba'],
  sul: ['curitiba', 'paranagua', 'itajai', 'joinville', 'florianopolis', 'porto alegre', 'rio grande', 'blumenau'],
  sudeste: ['sao paulo', 'rio de janeiro', 'belo horizonte', 'vitoria', 'santos', 'campinas'],
  brasil: ['*'],
};
const PORT_PLACES = { guaruja: ['guaruja', 'santos'], santos: ['santos', 'guaruja'] };

/** Every place a candidate says it serves (normalized). */
export function placesOf(candidate) {
  const p = normalizeOperationalProfile(candidate.profile);
  const out = new Set();
  const addPlace = (s) => {
    const n = placeName(s);
    if (n) out.add(n);
  };
  addPlace(candidate.city);
  (candidate.serviceLocations || []).forEach(addPlace);
  addPlace(p.routes.baseCity);
  for (const r of p.routes.regions) (REGION_PLACES[r] || []).forEach((x) => out.add(x));
  for (const port of [...p.routes.ports, ...p.maritime.ports]) {
    (PORT_PLACES[port] || [placeName(labelOf(PORTS, port))]).forEach((x) => out.add(x));
  }
  p.routes.terminals.forEach(addPlace);
  for (const e of p.equipment) e.regions.forEach(addPlace);
  return out;
}

export function coversPlace(candidate, place, places = placesOf(candidate)) {
  const target = placeName(place);
  if (!target) return true;
  if (places.has('*')) return true;
  for (const p of places) {
    if (p === target) return true;
    if (p.length >= 4 && target.length >= 4 && (p.includes(target) || target.includes(p))) return true;
  }
  return false;
}

const AVAIL_RANK = { agora: 0, hoje: 1, semana: 2, consulta: 3 };

function equipmentFits(item, eq, p) {
  const types = Array.isArray(eq.type) ? eq.type : [eq.type];
  if (!types.includes(item.type)) return false;
  const atLeast = (have, need) => !need || (have != null && have >= need);
  if (!atLeast(item.capacityTons ?? item.maxLoadTons, eq.minCapacityTons)) return false;
  if (!atLeast(item.maxDiameterMm, eq.minDiameterMm)) return false;
  if (!atLeast(item.maxLengthMm, eq.minLengthMm)) return false;
  if (!atLeast(item.heightM, eq.minHeightM)) return false;
  if (!atLeast(item.reachM, eq.minReachM)) return false;
  if (!atLeast(item.quantity ?? 1, eq.minQuantity)) return false;
  if (eq.operator === 'com' && item.operator === 'sem') return false;
  if (eq.operator === 'sem' && item.operator === 'com') return false;
  if (eq.offered && item.usage === 'uso_interno') return false;
  if (eq.purpose === 'rental' && (item.rental === false || p.heavy.rental === false)) return false;
  if (eq.purpose === 'sale' && !(item.sale || p.heavy.sale || p.supplier.sells)) return false;
  return true;
}

function servicesOf(p) {
  const s = new Set([...p.industrial.services, ...p.construction.types, ...p.maritime.services]);
  // Owned machines imply the matching service.
  for (const e of p.equipment) {
    if (e.type === 'torno') s.add('torneamento');
    if (e.type === 'fresadora' || e.type === 'centro_usinagem') s.add('fresamento');
    if (e.type === 'solda_mig_mag') s.add('solda_mig_mag');
    if (e.type === 'solda_tig') s.add('solda_tig');
  }
  return s;
}

const TEAM_CHECKS = {
  soldagem: (p) => p.construction.weldingTeam === true || p.industrial.services.some((x) => x.startsWith('solda')) || p.construction.types.includes('soldagem_campo'),
  montagem: (p) => p.construction.types.some((x) => ['montagem_galpoes', 'estruturas_metalicas', 'montagem_industrial'].includes(x)) || p.industrial.services.includes('montagem'),
  altura: (p) => p.construction.heightTeam === true,
  demolicao: (p) => p.construction.demolitionTeam === true || p.construction.types.includes('demolicao') || p.equipment.some((e) => e.type === 'britadeira'),
  terraplenagem: (p) => p.construction.earthworksTeam === true || p.construction.types.includes('terraplenagem'),
  operacional: (p) => p.construction.ownTeam === true || p.capabilities.externalTeam === true,
};
const TEAM_LABELS = { soldagem: 'equipe de soldagem', montagem: 'montagem', altura: 'trabalho em altura', demolicao: 'demolição', terraplenagem: 'terraplenagem', operacional: 'equipe operacional' };

/**
 * candidate: { profile, city, state, serviceLocations }
 * requirement: {
 *   services?: string[]                       any of these services
 *   equipment?: { type, minCapacityTons, minDiameterMm, minLengthMm, minHeightM, minReachM, minQuantity, operator, purpose, offered }
 *   container?: string                        container type id
 *   lane?: { from, to }
 *   location?: string                         city, region or port name
 *   emergency?, portAccess?, externalTeam?: boolean
 *   teams?: string[]                          soldagem, montagem, altura, demolicao, terraplenagem, operacional
 *   availability?: 'agora' | 'hoje' | 'semana'
 *   directSupply?: boolean                    prefers who sells straight to buyers
 * }
 * → { compatible, score (0–100), reasons[], missing[] }
 */
export function matchRequirement(candidate, req) {
  const p = normalizeOperationalProfile(candidate.profile);
  const places = placesOf(candidate);
  const reasons = [];
  const missing = [];
  let got = 0;
  let total = 0;
  let compatible = true;
  const check = (ok, weight, reason, miss, hard = true) => {
    total += weight;
    if (ok) {
      got += weight;
      if (reason) reasons.push(reason);
    } else {
      if (miss) missing.push(miss);
      if (hard) compatible = false;
    }
  };

  if (req.services?.length) {
    const have = servicesOf(p);
    check(req.services.some((s) => have.has(s)), 3, 'Executa o serviço pedido', 'Não executa o serviço pedido');
  }
  if (req.equipment) {
    const fit = p.equipment.find((e) => equipmentFits(e, req.equipment, p));
    check(Boolean(fit), 4, fit ? `Equipamento compatível: ${fit.type}${fit.capacityTons ? ` ${fit.capacityTons} t` : ''}${fit.maxDiameterMm ? ` Ø${fit.maxDiameterMm} mm` : ''}` : null, 'Sem equipamento com a capacidade pedida');
  }
  if (req.container) {
    check(p.containers.transports === true && p.containers.types.includes(req.container), 3, `Transporta container ${req.container.toUpperCase()}`, 'Não transporta esse container');
  }
  if (req.lane) {
    const laneOk =
      p.routes.lanes.some((l) => placeName(l.from) === placeName(req.lane.from) && placeName(l.to) === placeName(req.lane.to)) ||
      (coversPlace(candidate, req.lane.from, places) && coversPlace(candidate, req.lane.to, places));
    check(laneOk, 3, `Rota ${req.lane.from} → ${req.lane.to}`, 'Rota fora da área atendida');
  }
  if (req.location) check(coversPlace(candidate, req.location, places), 3, `Atende ${req.location}`, `Não atende ${req.location}`);
  if (req.emergency) {
    const ok = [p.capabilities.emergency, p.heavy.emergency, p.construction.emergency].includes(true) || p.maritime.attendance.some((a) => a === 'emergencial' || a === '24_7');
    check(ok, 2, 'Atendimento emergencial', 'Sem atendimento emergencial');
  }
  if (req.portAccess) {
    const ok =
      [p.capabilities.portAreas, p.capabilities.terminals, p.construction.industrialPort, p.heavy.industrialPort].includes(true) ||
      p.trucker.portAccess === 'sim' ||
      p.maritime.ports.length > 0 ||
      p.routes.ports.length > 0;
    check(ok, 2, 'Acesso a porto / terminal', 'Sem acesso portuário');
  }
  for (const team of req.teams || []) {
    check(Boolean(TEAM_CHECKS[team]?.(p)), 2, `Possui ${TEAM_LABELS[team] || team}`, `Sem ${TEAM_LABELS[team] || team}`);
  }
  if (req.availability) {
    const known = [p.trucker.availability, ...p.equipment.map((e) => e.availability)].filter(Boolean).map((a) => AVAIL_RANK[a]);
    const best = known.length ? Math.min(...known) : null;
    if (best === null) check(false, 1, null, 'Disponibilidade não informada', false);
    else check(best <= AVAIL_RANK[req.availability], 2, 'Disponível no prazo', 'Indisponível no prazo');
  }
  if (req.externalTeam) check(p.capabilities.externalTeam === true, 1, 'Equipe externa', null, false);
  if (req.directSupply) {
    const direct = [p.industrial.wantsBuyers, p.maritime.suppliesBuyers, p.heavy.seeksBuyers, p.construction.seeksBuyers, p.fleet.offersTransport, p.supplier.businessBuyers].includes(true);
    check(direct, 1, 'Fornece direto para compradores', null, false);
  }

  const score = total ? Math.round((got / total) * 100) : 0;
  return { compatible, score: compatible ? score : Math.min(score, 49), reasons, missing };
}

/** Candidates ordered: compatible first, then by score. */
export function rankCandidates(candidates, req) {
  return candidates
    .map((c) => ({ candidate: c, ...matchRequirement(c, req) }))
    .sort((a, b) => Number(b.compatible) - Number(a.compatible) || b.score - a.score);
}

const NEED_SERVICES = {
  usinagem: ['torneamento', 'fresamento', 'mandrilhamento', 'furacao'],
  manutencao: ['manutencao_industrial', 'manutencao', 'reparo_emergencial'],
};
const NEED_TEAMS = { equipe_soldagem: ['soldagem'], equipe_montagem: ['montagem'], operador_maquinas: ['operacional'] };

/** Turns a buyer's detailed need into a requirement for suppliers. */
export function requirementFromRequest(r, preferences = []) {
  const req = {};
  if (NEED_EQUIPMENT[r.need]) {
    const onlyBuy = preferences.includes('compra') && !preferences.some((x) => ['hora', 'diaria', 'semanal', 'mensal', 'etapa', 'longo_prazo'].includes(x));
    req.equipment = {
      type: NEED_EQUIPMENT[r.need],
      minCapacityTons: r.minCapacityTons ?? r.loadTons ?? undefined,
      minHeightM: r.heightM ?? undefined,
      minReachM: r.reachM ?? undefined,
      operator: r.requiresOperator === true ? 'com' : r.requiresOperator === false ? 'sem' : undefined,
      purpose: onlyBuy ? 'sale' : 'rental',
      offered: true,
    };
  }
  if (NEED_TEAMS[r.need]) req.teams = NEED_TEAMS[r.need];
  if (NEED_SERVICES[r.need]) req.services = NEED_SERVICES[r.need];
  if (r.location) req.location = r.location;
  if (r.urgency === 'emergencial') req.emergency = true;
  if (r.terrain === 'portuario') req.portAccess = true;
  return req;
}

/**
 * Buyer ↔ supplier: the best fit among the buyer's needs (detailed requests,
 * or plain needs when no details were given).
 * buyer / supplier: { profile, city, state, serviceLocations }
 */
export function matchBuyerSupplier(buyer, supplier) {
  const bp = normalizeOperationalProfile(buyer.profile);
  const requests = bp.buyer.requests.length ? bp.buyer.requests : bp.buyer.needs.map((need) => ({ need, location: buyer.city }));
  let best = null;
  for (const r of requests) {
    const req = requirementFromRequest(r, bp.buyer.preferences);
    if (!Object.keys(req).length) continue;
    const res = matchRequirement(supplier, req);
    if (!best || Number(res.compatible) - Number(best.compatible) > 0 || (res.compatible === best.compatible && res.score > best.score)) best = { ...res, request: r };
  }
  return best || { compatible: false, score: 0, reasons: [], missing: ['Sem necessidade cadastrada'], request: null };
}

/** Is this profile offering anything / looking for anything? (for directory queries) */
export function profileSides(rawProfile) {
  const p = normalizeOperationalProfile(rawProfile);
  const supplies =
    p.equipment.some((e) => e.usage !== 'uso_interno') ||
    p.industrial.services.length > 0 ||
    p.construction.types.length > 0 ||
    p.maritime.services.length > 0 ||
    p.supplier.offered.length > 0 ||
    p.fleet.vehicles.length > 0 ||
    Boolean(p.trucker.truckType) ||
    p.trucker.truckTypes.length > 0;
  const buys = p.buyer.needs.length > 0 || p.buyer.requests.length > 0 || p.terminal.suppliersHired.length > 0;
  return { supplies, buys };
}
