/** Completeness and a readable capability summary of an operational profile. */
import {
  BUSINESS_ROLES,
  BUYER_NEEDS,
  CONSTRUCTION_TYPES,
  CNH_CATEGORIES,
  LICENSES,
  NORMS,
  NRS,
  TERMINAL_ACCESS_TYPES,
  CONTAINER_TYPES,
  EQUIPMENT_TYPES,
  INDUSTRIAL_SERVICES,
  MARITIME_SERVICES,
  PORTS,
  REGIONS,
  SPEC_FIELDS,
  SUPPLIED_EQUIPMENT,
  VEHICLE_TYPES,
  labelOf,
} from './catalog.js';
import { DOCUMENTS_FIELD, OPERATION_START, conditionMet, modulesFor } from './modules.js';
import { getPath, normalizeOperationalProfile } from './profile.js';

function answered(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== null && value !== undefined;
}

/** [answered, total] for a list of field definitions (toggles count per item). */
function countFields(fields, profile) {
  let done = 0;
  let total = 0;
  for (const f of fields) {
    if (f.when && !conditionMet(f.when, profile)) continue;
    if (f.type === 'toggles') {
      for (const item of f.items) {
        total += 1;
        if (answered(getPath(profile, item.path))) done += 1;
      }
      continue;
    }
    total += 1;
    const value = getPath(profile, f.path);
    if (answered(value)) done += 1;
    if (f.type === 'yesno' && value === true && f.children) {
      const [d, t] = countFields(f.children, profile);
      done += d;
      total += t;
    }
  }
  return [done, total];
}

/**
 * 0–100. Operation types + objectives (25%), the applicable modules (55%),
 * service area (10%) and documents (10%). `company` adds the base fields.
 */
export function profileCompleteness(rawProfile, { accountType, company } = {}) {
  const profile = normalizeOperationalProfile(rawProfile);
  const [sd, st] = countFields(OPERATION_START.fields, profile);
  const start = st ? sd / st : 0;
  const modules = modulesFor(profile, accountType);
  let md = 0;
  let mt = 0;
  for (const m of modules) {
    const [d, t] = countFields(m.fields, profile);
    md += d;
    mt += t;
  }
  const mod = mt ? md / mt : profile.types.length ? 0.5 : 0;
  const area =
    company?.city || company?.serviceLocations?.length || profile.routes.baseCity || profile.routes.regions.length || profile.maritime.ports.length ? 1 : 0;
  const docs = answered(getPath(profile, DOCUMENTS_FIELD.path)) ? 1 : 0;
  return Math.round((start * 0.25 + mod * 0.55 + area * 0.1 + docs * 0.1) * 100);
}

const yesNo = (v) => (v === true ? 'Sim' : v === false ? 'Não' : null);
const list = (catalog, values, max = 4) => {
  if (!values?.length) return null;
  const labels = values.map((v) => labelOf(catalog, v));
  return labels.length > max ? `${labels.slice(0, max).join(', ')} +${labels.length - max}` : labels.join(', ');
};
/** YYYY-MM-DD to DD/MM/AAAA without going through the local timezone. */
const brDate = (iso) => (iso ? iso.split('-').reverse().join('/') : null);
const fmt = (n) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(n);

/** Biggest relevant spec of an equipment item, e.g. "12 t" or "Ø650 mm × 2.000 mm". */
export function equipmentSpecText(item) {
  const parts = [];
  if (item.maxDiameterMm) parts.push(`Ø${fmt(item.maxDiameterMm)} mm`);
  if (item.maxLengthMm) parts.push(`${fmt(item.maxLengthMm)} mm`);
  if (item.capacityTons) parts.push(`${fmt(item.capacityTons)} ${SPEC_FIELDS.capacityTons.unit}`);
  if (item.heightM) parts.push(`altura ${fmt(item.heightM)} m`);
  if (item.reachM) parts.push(`alcance ${fmt(item.reachM)} m`);
  return parts.join(' · ');
}

/**
 * Lines like the dashboard needs: { section, label, value }. Only answered
 * facts appear, so two similar companies read differently.
 */
export function capabilitySummary(rawProfile, company = {}) {
  const p = normalizeOperationalProfile(rawProfile);
  const out = [];
  const add = (section, label, value) => {
    if (value !== null && value !== undefined && value !== '') out.push({ section, label, value: String(value) });
  };

  // Equipment: quantity per type and its capacity.
  for (const item of p.equipment) {
    const name = labelOf(EQUIPMENT_TYPES, item.type);
    const qty = item.quantity ?? 1;
    const spec = equipmentSpecText(item);
    const extras = [item.operator === 'com' ? 'com operador' : item.operator === 'ambos' ? 'com ou sem operador' : null, item.rental ? 'locação' : null, item.sale ? 'venda' : null]
      .filter(Boolean)
      .join(', ');
    add('Equipamentos', name, [qty, spec, extras].filter(Boolean).join(' · '));
  }
  add('Serviços', 'Serviços industriais', list(INDUSTRIAL_SERVICES, p.industrial.services, 5));
  add('Serviços', 'Obras', list(CONSTRUCTION_TYPES, p.construction.types, 4));
  add('Serviços', 'Operações marítimas', list(MARITIME_SERVICES, p.maritime.services, 4));
  add('Serviços', 'Fornece', list(SUPPLIED_EQUIPMENT, p.supplier.offered, 4));

  // Fleet.
  for (const v of p.fleet.vehicles) add('Frota', labelOf(VEHICLE_TYPES, v.type), [v.quantity ?? 1, v.payloadTons ? `${fmt(v.payloadTons)} t` : null].filter(Boolean).join(' · '));
  for (const truck of new Set([p.trucker.truckType, ...p.trucker.truckTypes].filter(Boolean))) {
    add('Frota', labelOf(VEHICLE_TYPES, truck), [p.trucker.quantity ?? 1, p.trucker.payloadTons ? `${fmt(p.trucker.payloadTons)} t` : null].filter(Boolean).join(' · '));
  }
  if (p.containers.transports) {
    for (const c of p.containers.types) add('Containers', labelOf(CONTAINER_TYPES, c), 'Sim');
  } else if (p.containers.transports === false) add('Containers', 'Transporta containers', 'Não');

  // Where.
  const base = p.routes.baseCity ? `${p.routes.baseCity}${p.routes.baseState ? `/${p.routes.baseState}` : ''}` : company.city ? `${company.city}${company.state ? `/${company.state}` : ''}` : null;
  add('Atendimento', 'Base', base);
  add('Atendimento', 'Regiões', list(REGIONS, p.routes.regions, 3));
  add('Atendimento', 'Portos', list(PORTS, [...new Set([...p.routes.ports, ...p.maritime.ports])], 4));
  if (p.routes.lanes.length) add('Atendimento', 'Rotas cadastradas', p.routes.lanes.length);

  // Capabilities.
  const c = p.capabilities;
  add('Capacidade', 'Atendimento externo', yesNo(c.externalTeam));
  add('Capacidade', 'Emergencial', yesNo(c.emergency ?? p.heavy.emergency ?? p.construction.emergency));
  add('Capacidade', 'Porto / terminal', yesNo(c.portAreas ?? c.terminals ?? p.construction.industrialPort ?? p.heavy.industrialPort));
  if (c.maxLiftTons) add('Capacidade', 'Movimenta até', `${fmt(c.maxLiftTons)} t`);
  add('Capacidade', 'Equipe de soldagem', yesNo(p.construction.weldingTeam));
  add('Capacidade', 'Trabalho em altura', yesNo(p.construction.heightTeam));
  // Shown once in "Certificações" when answered there; the old trucker answer is only a fallback.
  const access = p.certifications.terminal.status ? null : p.trucker.portAccess;
  add('Capacidade', 'Acesso a terminais', access ? { sim: 'Sim', nao: 'Não', em_processo: 'Em processo' }[access] : null);

  // Certificates: NRs and technical norms of the company, habilitations of people.
  const cert = p.certifications;
  add('Certificações', 'NRs', list(NRS, cert.nrs, 8));
  add('Certificações', 'Normas', list(NORMS, cert.norms, 5));
  add('Certificações', 'Habilitações', list(LICENSES, cert.licenses, 5));
  if (cert.cnh.has === true) add('Certificações', 'CNH', [list(CNH_CATEGORIES, cert.cnh.categories, 9), cert.cnh.validUntil && `válida até ${brDate(cert.cnh.validUntil)}`].filter(Boolean).join(' · ') || 'Sim');
  else if (cert.cnh.has === false) add('Certificações', 'CNH', 'Não possui');
  if (cert.terminal.status === 'sim') {
    add('Certificações', 'Acesso a terminal', [list(TERMINAL_ACCESS_TYPES, cert.terminal.types, 3), cert.terminal.validUntil && `válido até ${brDate(cert.terminal.validUntil)}`, cert.terminal.registration && `cadastro ${cert.terminal.registration}`].filter(Boolean).join(' · '));
  }

  // Commercial relationship.
  add('Comercial', 'Atua como', list(BUSINESS_ROLES, p.roles, 3));
  add('Comercial', 'Fornece para compradores', yesNo(p.industrial.wantsBuyers ?? p.maritime.suppliesBuyers ?? p.heavy.seeksBuyers ?? p.construction.seeksBuyers ?? p.fleet.offersTransport));
  add('Comercial', 'Busca fornecedores', yesNo(p.industrial.seeksSuppliers ?? p.maritime.seeksPartners ?? p.construction.seeksEquipmentSuppliers ?? p.heavy.seeksThirdParty));
  add('Comercial', 'Locação', yesNo(p.heavy.rental ?? p.supplier.rents));
  add('Comercial', 'Venda', yesNo(p.heavy.sale ?? p.supplier.sells));
  add('Compras', 'Precisa contratar', list(BUYER_NEEDS, p.buyer.needs, 4));
  if (p.buyer.requests.length) add('Compras', 'Necessidades detalhadas', p.buyer.requests.length);

  return out;
}

/** Simulated travel time for a distance at a steady speed (80 km/h by default): one way and round trip. */
export function travelEstimate(km, speedKmh = 80) {
  const n = Number(km) || 0;
  if (n <= 0) return null;
  const oneWayMin = Math.round((n / speedKmh) * 60);
  return { oneWay: formatTravel(oneWayMin), roundTrip: formatTravel(oneWayMin * 2) };
}

function formatTravel(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}
