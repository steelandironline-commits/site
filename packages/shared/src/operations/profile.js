/**
 * Operational profile: what a company is, does, owns, buys and where it works.
 * Stored as one JSON document (Company.operationalProfile) so new categories
 * can be added without migrations; every field is typed and catalog-checked
 * here, so the matching engine can rely on it.
 */
import { z } from 'zod';
import {
  ATTENDANCE,
  AVAILABILITY,
  BUSINESS_OBJECTIVES,
  BUSINESS_ROLES,
  BUYER_NEEDS,
  CARGO_TYPES,
  CNH_CATEGORIES,
  CONSTRUCTION_TYPES,
  CONTAINER_OPERATIONS,
  CONTAINER_TYPES,
  CONTRACT_PREFERENCES,
  DOCUMENTS,
  EQUIPMENT_TYPES,
  EQUIPMENT_USAGE,
  IDEAL_CUSTOMERS,
  INDUSTRIAL_SERVICES,
  LICENSES,
  MARITIME_SERVICES,
  MIN_TICKETS,
  MOBILIZATION_TIMES,
  NORMS,
  NRS,
  OPERATION_TYPES,
  OPERATOR_MODES,
  PORTS,
  PORT_ACCESS,
  REGIONS,
  SUPPLIED_EQUIPMENT,
  SUPPLIERS_SOUGHT,
  TERMINAL_SUPPLIERS,
  TERMINAL_ACCESS_TYPES,
  TERRAIN_TYPES,
  URGENCY,
  VEHICLE_TYPES,
  ids,
} from './catalog.js';

export const OPERATIONAL_PROFILE_VERSION = 1;

const oneOf = (catalog) => z.enum(ids(catalog));
const many = (catalog, max = 40) => z.array(oneOf(catalog)).max(max).default([]);
const yes = z.boolean().nullable().optional();
/** A calendar date as YYYY-MM-DD (what <input type="date"> gives). */
const isoDate = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'data inválida')
    .refine((v) => !Number.isNaN(Date.parse(v)), 'data inválida')
    .nullable(),
).optional();
const toNumber = (v) => (v === '' || v === undefined || v === null ? null : Number(String(v).replace(',', '.')));
const num = (max = 1_000_000) => z.preprocess(toNumber, z.number().min(0).max(max).nullable()).optional();
const int = (max = 100_000) => z.preprocess(toNumber, z.number().int().min(0).max(max).nullable()).optional();
const text = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const tags = (max = 20, len = 80) => z.array(z.string().trim().min(1).max(len)).max(max).default([]);
const itemId = z.string().trim().max(40).optional();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
  .optional()
  .or(z.literal('').transform(() => undefined));

export const equipmentItemSchema = z.object({
  id: itemId,
  type: oneOf(EQUIPMENT_TYPES),
  brand: text(60),
  model: text(60),
  quantity: int(10_000),
  capacityTons: num(5000),
  maxDiameterMm: num(100_000),
  maxLengthMm: num(1_000_000),
  reachM: num(500),
  heightM: num(500),
  maxLoadTons: num(5000),
  operator: oneOf(OPERATOR_MODES).optional(),
  availability: oneOf(AVAILABILITY).optional(),
  usage: oneOf(EQUIPMENT_USAGE).optional(),
  rental: yes,
  sale: yes,
  regions: tags(20),
});

export const vehicleItemSchema = z.object({
  id: itemId,
  type: oneOf(VEHICLE_TYPES),
  quantity: int(10_000),
  payloadTons: num(500),
  lengthM: num(100),
  maxWeightTons: num(500),
  baseCity: text(80),
});

export const laneSchema = z.object({
  id: itemId,
  from: z.string().trim().min(2).max(80),
  to: z.string().trim().min(2).max(80),
});

export const buyerRequestSchema = z.object({
  id: itemId,
  need: oneOf(BUYER_NEEDS),
  minCapacityTons: num(5000),
  heightM: num(500),
  reachM: num(500),
  loadTons: num(5000),
  durationDays: int(3650),
  startDate: date,
  endDate: date,
  location: text(120),
  requiresOperator: yes,
  requiresTransport: yes,
  terrain: oneOf(TERRAIN_TYPES).optional(),
  serviceType: text(200),
  urgency: oneOf(URGENCY).optional(),
  budget: int(1_000_000_000),
});

export const operationalProfileSchema = z.object({
  version: z.literal(OPERATIONAL_PROFILE_VERSION).default(OPERATIONAL_PROFILE_VERSION),
  types: many(OPERATION_TYPES, 12),
  objectives: many(BUSINESS_OBJECTIVES, 12),
  roles: many(BUSINESS_ROLES, 12),
  otherType: text(120),

  industrial: z
    .object({
      services: many(INDUSTRIAL_SERVICES),
      sellsEquipment: yes,
      buysInputs: yes,
      wantsBuyers: yes,
      seeksSuppliers: yes,
    })
    .default({}),
  capabilities: z
    .object({
      emergency: yes,
      h24: yes,
      weekends: yes,
      terminals: yes,
      portAreas: yes,
      externalTeam: yes,
      serviceVehicle: yes,
      onsiteInstall: yes,
      pickupDelivery: yes,
      overheadCrane: yes,
      forklift: yes,
      crane: yes,
      munck: yes,
      aerialPlatform: yes,
      earthworks: yes,
      safetyDocs: yes,
      nrStaff: yes,
      maxLiftTons: num(5000),
    })
    .default({}),
  equipment: z.array(equipmentItemSchema).max(60).default([]),

  fleet: z
    .object({
      total: int(100_000),
      vehicles: z.array(vehicleItemSchema).max(40).default([]),
      offersTransport: yes,
      seeksLoads: yes,
      transportsHeavy: yes,
      transportsCranes: yes,
      mobilization: yes,
    })
    .default({}),
  containers: z
    .object({
      transports: yes,
      types: many(CONTAINER_TYPES),
      simultaneous: int(10_000),
      ownChassis: yes,
      operations: many(CONTAINER_OPERATIONS),
    })
    .default({}),
  routes: z
    .object({
      baseCity: text(80),
      baseState: text(2),
      ports: many(PORTS),
      terminals: tags(20),
      radiusKm: int(5000),
      regions: many(REGIONS),
      lanes: z.array(laneSchema).max(40).default([]),
    })
    .default({}),
  trucker: z
    .object({
      truckType: oneOf(VEHICLE_TYPES).optional(), // legacy single choice
      truckTypes: many(VEHICLE_TYPES, 16),
      quantity: int(100),
      payloadTons: num(500),
      portAccess: oneOf(PORT_ACCESS).optional(),
      availability: oneOf(AVAILABILITY).optional(),
      wantsTransport: yes,
      offersHeavy: yes,
      wantsDirect: yes,
      acceptsIntermediation: yes,
    })
    .default({}),
  maritime: z
    .object({
      services: many(MARITIME_SERVICES),
      ports: many(PORTS),
      attendance: many(ATTENDANCE),
      mobilization: oneOf(MOBILIZATION_TIMES).optional(),
      suppliesBuyers: yes,
      wantsShipDemands: yes,
      seeksPartners: yes,
    })
    .default({}),
  terminal: z
    .object({
      suppliersHired: many(TERMINAL_SUPPLIERS),
      cargoTypes: many(CARGO_TYPES),
      accreditation: yes,
      equipmentHired: many(BUYER_NEEDS),
      servicesWanted: text(500),
      acceptsHomologating: yes,
      recurring: yes,
      emergency: yes,
    })
    .default({}),
  heavy: z
    .object({
      rental: yes,
      sale: yes,
      seeksBuyers: yes,
      recurring: yes,
      emergency: yes,
      industrialPort: yes,
      seeksThirdParty: yes,
      transportNeeded: yes,
      terrains: many(TERRAIN_TYPES),
      certifications: text(300),
    })
    .default({}),
  construction: z
    .object({
      types: many(CONSTRUCTION_TYPES),
      ownTeam: yes,
      subcontractors: yes,
      fullWorks: yes,
      stagesOnly: yes,
      technicalResponsible: yes,
      weldingTeam: yes,
      heightTeam: yes,
      demolitionTeam: yes,
      earthworksTeam: yes,
      emergency: yes,
      weekends: yes,
      industrialPort: yes,
      safetyDocs: yes,
      artLicenses: yes,
      seeksBuyers: yes,
      seeksEquipmentSuppliers: yes,
      hiresThirdPartyEquipment: yes,
      offersFullTeams: yes,
      acceptsWithOperator: yes,
      acceptsWithoutOperator: yes,
      wantsWorks: yes,
      wantsRentals: yes,
    })
    .default({}),
  buyer: z
    .object({
      needs: many(BUYER_NEEDS),
      requests: z.array(buyerRequestSchema).max(20).default([]),
      preferences: many(CONTRACT_PREFERENCES),
    })
    .default({}),
  supplier: z
    .object({
      offered: many(SUPPLIED_EQUIPMENT),
      sells: yes,
      rents: yes,
      maintenance: yes,
      parts: yes,
      technicalAssistance: yes,
      training: yes,
      operator: yes,
      delivery: yes,
      businessBuyers: yes,
      readyStock: yes,
      madeToOrder: yes,
      acceptsQuotes: yes,
    })
    .default({}),
  certifications: z
    .object({
      nrs: many(NRS, 40),
      norms: many(NORMS, 60),
      licenses: many(LICENSES, 30),
      // Driving licence. The number itself is not stored: only what matching needs.
      cnh: z
        .object({
          has: yes,
          categories: many(CNH_CATEGORIES, 9),
          validUntil: isoDate,
        })
        .default({}),
      // Access to terminals and ports. `registration` is the terminal's own cadastro, if any.
      terminal: z
        .object({
          status: oneOf(PORT_ACCESS).nullable().optional(),
          types: many(TERMINAL_ACCESS_TYPES, 6),
          validUntil: isoDate,
          registration: text(60),
        })
        .default({}),
    })
    .default({}),
  market: z
    .object({
      idealCustomers: many(IDEAL_CUSTOMERS),
      suppliersSought: many(SUPPLIERS_SOUGHT),
      minTicket: oneOf(MIN_TICKETS).optional(),
    })
    .default({}),
  documents: many(DOCUMENTS),
});

/** A blank, fully-shaped profile (every section present). */
export function emptyOperationalProfile() {
  return operationalProfileSchema.parse({});
}

/** Parses a stored profile (or nothing) into the full shape; invalid data falls back to blank. */
export function normalizeOperationalProfile(raw) {
  const parsed = operationalProfileSchema.safeParse(raw && typeof raw === 'object' ? raw : {});
  return parsed.success ? parsed.data : emptyOperationalProfile();
}

/* --------------------------------------------------------------- paths */
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Immutable set by dotted path. */
export function setPath(obj, path, value) {
  const [head, ...rest] = path.split('.');
  const base = obj && typeof obj === 'object' ? obj : {};
  return { ...base, [head]: rest.length ? setPath(base[head], rest.join('.'), value) : value };
}
