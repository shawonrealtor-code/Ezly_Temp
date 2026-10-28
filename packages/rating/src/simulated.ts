import type { AutoRisk, DwellingRisk, HomeRisk, Lob } from "./risk.ts";
import type { CarrierQuoteResult, CoverageLine, RatingAdapter, RatingRequest } from "./types.ts";

// Simulated insurers, used until real carrier connections exist. The pricing follows the factors real
// personal-lines rating uses (driver age and record, vehicle, limits and deductibles; home age, roof,
// construction, protection class, claims) so results behave believably. Not real rates.

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const k = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : money(n));
const round = (n: number) => Math.round(n);

function ageOn(dateOfBirth: string, on: string): number {
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  const [ey, em, ed] = on.split("-").map(Number);
  return ey - y - (em < m || (em === m && ed < d) ? 1 : 0);
}

/** Small stable per-carrier, per-ZIP variation (±4%) so carriers don't rank identically everywhere. */
function jitter(carrierKey: string, zip: string): number {
  let h = 0;
  for (const c of carrierKey + zip) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 1 + ((h % 9) - 4) / 100;
}

// ---------- Auto ----------

const BI = { "30/60": 0.82, "50/100": 0.9, "100/300": 1, "250/500": 1.18 } as const;
const PD = { "15000": 0.9, "25000": 0.95, "50000": 1, "100000": 1.07 } as const;
const PHYS_DED = { none: 0, "250": 1.15, "500": 1, "1000": 0.85 } as const;
const AUTO_BASE: Record<string, number> = { MD: 640, VA: 520, DC: 700, DE: 600, PA: 560 };

function driverFactor(d: AutoRisk["drivers"][number], on: string): number {
  const age = ageOn(d.dateOfBirth, on);
  let f = age < 21 ? 2.2 : age < 25 ? 1.5 : age < 30 ? 1.15 : age < 65 ? 1 : age < 75 ? 1.08 : 1.25;
  f *= 1 + 0.25 * d.violations + 0.35 * d.atFaultAccidents;
  if (d.yearsLicensed < 3) f *= 1.3;
  if (d.goodStudent && age < 25) f *= 0.9;
  if (d.defensiveDriving) f *= 0.95;
  return f;
}

export function priceAuto(auto: AutoRisk, state: string): { termPremium: number; coverages: CoverageLine[] } {
  const year = Number(auto.effectiveDate.slice(0, 4));
  const rated = auto.drivers.filter((d) => d.licenseStatus !== "none");
  const factors = rated.map((d) => driverFactor(d, auto.effectiveDate)).sort((a, b) => b - a);
  const driver = (factors[0] ?? 1) + 0.15 * Math.max(0, factors.length - 1);
  const prior = auto.priorInsurance.lapseDays > 30 || auto.priorInsurance.yearsInsured === 0 ? 1.25 : auto.priorInsurance.yearsInsured >= 5 ? 0.92 : 1;
  const um = auto.coverages.uninsuredMotorist === "rejected" ? 1 : 1.06;
  const med = { "0": 1, "1000": 1.01, "5000": 1.025, "10000": 1.04 }[auto.coverages.medicalPayments];
  let total = 0;
  for (const v of auto.vehicles) {
    const age = Math.max(0, year - v.year);
    const liability = 0.55 * BI[auto.coverages.bodilyInjury] * PD[auto.coverages.propertyDamage];
    const physical =
      0.45 * (age <= 3 ? 1.2 : age <= 7 ? 1 : age <= 12 ? 0.8 : 0.6) *
      ((PHYS_DED[v.comprehensiveDeductible] * 0.35 + PHYS_DED[v.collisionDeductible] * 0.65) || 0);
    const use = { commute: 1.1, pleasure: 0.95, business: 1.25 }[v.use] * (v.annualMiles > 15_000 ? 1.1 : v.annualMiles < 7_500 ? 0.92 : 1);
    total += (AUTO_BASE[state] ?? 600) * (liability + physical) * use + (v.rentalReimbursement ? 15 : 0) + (v.roadside ? 6 : 0);
  }
  if (auto.vehicles.length > 1) total *= 0.9;
  const termPremium = total * driver * prior * um * med;
  const first = auto.vehicles[0];
  return {
    termPremium,
    coverages: [
      { label: "Bodily injury", value: auto.coverages.bodilyInjury.replace("/", "k/") + "k" },
      { label: "Property damage", value: k(Number(auto.coverages.propertyDamage)) },
      { label: "Uninsured motorist", value: auto.coverages.uninsuredMotorist === "rejected" ? "Rejected" : auto.coverages.uninsuredMotorist.replace("/", "k/") + "k" },
      { label: "Comp / collision", value: first.collisionDeductible === "none" ? "Liability only" : `$${first.comprehensiveDeductible} / $${first.collisionDeductible}` },
      { label: "Vehicles · drivers", value: `${auto.vehicles.length} · ${rated.length}` },
    ],
  };
}

// ---------- Home and dwelling fire ----------

const DEDUCTIBLE = { "500": 1.12, "1000": 1, "2500": 0.86, "5000": 0.75 } as const;
const CONSTRUCTION = { frame: 1, masonry: 0.9, masonry_veneer: 0.95, fire_resistive: 0.85 } as const;
const HOME_RATE: Record<string, number> = { MD: 0.0036, VA: 0.0033, DC: 0.0038, DE: 0.0035, PA: 0.0034 };

function propertyFactor(p: HomeRisk | DwellingRisk): number {
  const year = Number(p.effectiveDate.slice(0, 4));
  const homeAge = year - p.yearBuilt;
  let f = CONSTRUCTION[p.construction];
  f *= homeAge < 10 ? 0.85 : homeAge < 30 ? 1 : homeAge < 60 ? 1.12 : 1.25;
  if (p.roofYear !== undefined) {
    const roofAge = year - p.roofYear;
    f *= roofAge < 10 ? 0.92 : roofAge < 20 ? 1 : 1.2;
  }
  f *= ["metal", "tile", "slate"].includes(p.roofType) ? 0.92 : p.roofType === "wood_shake" ? 1.15 : 1;
  f *= p.protectionClass <= 5 ? 1 : p.protectionClass <= 8 ? 1.15 : 1.5;
  f *= p.claims5yr === 0 ? 0.95 : p.claims5yr === 1 ? 1.15 : 1.4;
  if (p.fireAlarm) f *= 0.97;
  if (p.burglarAlarm) f *= 0.97;
  if (p.sprinklers) f *= 0.92;
  if (p.pool) f *= 1.05;
  if (p.trampoline) f *= 1.08;
  if (p.dog) f *= 1.03;
  return f;
}

export function priceHome(h: HomeRisk, state: string): { termPremium: number; coverages: CoverageLine[] } {
  const rate = HOME_RATE[state] ?? 0.0035;
  const c = h.coverages;
  let base =
    h.form === "HO4" ? 150 + c.personalProperty * 0.004 : h.form === "HO6" ? 250 + c.personalProperty * 0.004 + c.dwelling * 0.002 : c.dwelling * rate * (h.form === "HO5" ? 1.15 : 1);
  base *= propertyFactor(h) * DEDUCTIBLE[c.deductible];
  base *= { "100000": 0.97, "300000": 1, "500000": 1.03 }[c.liability];
  if (c.replacementCostContents) base *= 1.06;
  if (h.occupancy === "seasonal") base *= 1.2;
  base += { "0": 0, "5000": 40, "10000": 65, "25000": 120 }[c.waterBackup];
  return {
    termPremium: base,
    coverages: [
      ...(h.form === "HO4" ? [] : [{ label: "Dwelling", value: k(c.dwelling) }]),
      { label: "Personal property", value: k(c.personalProperty) },
      { label: "Liability", value: k(Number(c.liability)) },
      { label: "Deductible", value: money(Number(c.deductible)) },
      ...(c.waterBackup !== "0" ? [{ label: "Water backup", value: k(Number(c.waterBackup)) }] : []),
    ],
  };
}

export function priceDwelling(d: DwellingRisk, state: string): { termPremium: number; coverages: CoverageLine[] } {
  const c = d.coverages;
  let base = c.dwelling * (HOME_RATE[state] ?? 0.0035) * 1.2;
  base *= propertyFactor(d) * DEDUCTIBLE[c.deductible] * (d.form === "DP3" ? 1.2 : 0.85);
  if (d.occupancy === "rental") base *= 1.1;
  base *= 1 + 0.12 * (d.units - 1);
  base += c.fairRentalValue * 0.004 + { "0": 0, "100000": 60, "300000": 90, "500000": 120 }[c.liability];
  return {
    termPremium: base,
    coverages: [
      { label: "Dwelling", value: k(c.dwelling) },
      { label: "Fair rental value", value: k(c.fairRentalValue) },
      { label: "Liability", value: c.liability === "0" ? "None" : k(Number(c.liability)) },
      { label: "Deductible", value: money(Number(c.deductible)) },
      { label: "Form", value: d.form },
    ],
  };
}

// ---------- Insurers ----------

type Rule = (r: RatingRequest) => { error: string; field: string } | null;

const property = (r: RatingRequest) => r.home ?? r.dwelling;
const rules = {
  roofYearIfOld: ((r) => {
    const p = property(r);
    return p && p.yearBuilt < 1995 && p.roofYear === undefined ? { error: "Roof update year is required for homes built before 1995.", field: "roofYear" } : null;
  }) as Rule,
  roofYearAlways: ((r) => {
    const p = property(r);
    return p && p.roofYear === undefined ? { error: "Roof update year is required.", field: "roofYear" } : null;
  }) as Rule,
  roofUnder20: ((r) => {
    const p = property(r);
    return p?.roofYear !== undefined && Number(p.effectiveDate.slice(0, 4)) - p.roofYear >= 20 ? { error: "Roofs 20 years or older aren't accepted.", field: "roofYear" } : null;
  }) as Rule,
  cleanRecords: ((r) => {
    const i = r.auto?.drivers.findIndex((d) => d.violations > 2 || d.licenseStatus === "suspended" || d.licenseStatus === "revoked");
    return i !== undefined && i >= 0 ? { error: `Driver ${i + 1} has more than 2 violations or a suspended/revoked license.`, field: `drivers.${i}.violations` } : null;
  }) as Rule,
  noLapse: ((r) =>
    r.auto && r.auto.priorInsurance.lapseDays > 30 ? { error: "Prior insurance lapse over 30 days isn't accepted.", field: "priorInsurance.lapseDays" } : null) as Rule,
  noVacant: ((r) => (r.dwelling?.occupancy === "vacant" ? { error: "Vacant dwellings aren't accepted.", field: "occupancy" } : null)) as Rule,
  lowProtection: ((r) => {
    const p = property(r);
    return p && p.protectionClass >= 9 ? { error: "Protection class 9–10 isn't accepted.", field: "protectionClass" } : null;
  }) as Rule,
};

export interface SimulatedCarrierConfig {
  key: string;
  carrierName: string;
  factors: Partial<Record<Lob, number>>;
  states: string[];
  rules: Rule[];
  notes?: Partial<Record<Lob, string[]>>;
}

export class SimulatedAdapter implements RatingAdapter {
  readonly key: string;
  readonly carrierName: string;

  constructor(private readonly config: SimulatedCarrierConfig) {
    this.key = config.key;
    this.carrierName = config.carrierName;
  }

  supports(lob: Lob, state: string): boolean {
    return this.config.factors[lob] !== undefined && this.config.states.includes(state);
  }

  async rate(r: RatingRequest): Promise<CarrierQuoteResult> {
    const problems = this.config.rules.map((rule) => rule(r)).filter((p) => p !== null);
    if (problems.length) {
      return { status: "error", carrierKey: this.key, errors: problems.map((p) => p.error), fields: [...new Set(problems.map((p) => p.field))] };
    }
    const priced =
      r.lob === "auto" && r.auto ? priceAuto(r.auto, r.state)
      : r.lob === "home" && r.home ? priceHome(r.home, r.state)
      : r.lob === "dwelling_fire" && r.dwelling ? priceDwelling(r.dwelling, r.state)
      : null;
    if (!priced) return { status: "error", carrierKey: this.key, errors: ["The application is incomplete."], fields: [] };
    const termMonths = r.lob === "auto" ? 6 : 12;
    const termPremium = round(priced.termPremium * this.config.factors[r.lob]! * jitter(this.key, r.zip));
    return {
      status: "ok",
      carrierKey: this.key,
      termPremium,
      termMonths,
      annualPremium: termMonths === 6 ? termPremium * 2 : termPremium,
      coverages: priced.coverages,
      notes: this.config.notes?.[r.lob] ?? [],
    };
  }
}

const MID_ATLANTIC = ["MD", "VA", "DC", "DE", "PA"];

export const SIMULATED_CARRIERS: SimulatedCarrierConfig[] = [
  { key: "sim-summit", carrierName: "Summit Mutual", factors: { auto: 0.97, home: 1.0, dwelling_fire: 1.02 }, states: MID_ATLANTIC, rules: [], notes: { home: ["Multi-policy discount available with auto"] } },
  { key: "sim-harbor", carrierName: "Harbor Insurance", factors: { auto: 1.05, home: 1.08, dwelling_fire: 1.0 }, states: MID_ATLANTIC, rules: [rules.lowProtection] },
  { key: "sim-pinecrest", carrierName: "Pinecrest General", factors: { auto: 1.04, home: 0.92 }, states: MID_ATLANTIC, rules: [rules.roofUnder20], notes: { home: ["Preferred home program"] } },
  { key: "sim-liberty-shield", carrierName: "Liberty Shield", factors: { auto: 1.12, home: 1.16, dwelling_fire: 1.18 }, states: MID_ATLANTIC, rules: [], notes: { auto: ["Accepts drivers with violations"] } },
  { key: "sim-crescent", carrierName: "Crescent Casualty", factors: { auto: 0.94, home: 1.04, dwelling_fire: 0.97 }, states: ["MD", "VA"], rules: [rules.cleanRecords, rules.noVacant], notes: { auto: ["Local carrier"] } },
  { key: "sim-northgate", carrierName: "Northgate Mutual", factors: { home: 0.95, dwelling_fire: 0.95 }, states: ["MD", "VA", "PA"], rules: [rules.roofYearIfOld, rules.roofUnder20, rules.noVacant] },
  { key: "sim-bayview", carrierName: "Bayview Insurance", factors: { auto: 0.99, home: 0.97 }, states: ["MD", "VA", "DE"], rules: [rules.roofYearAlways, rules.noLapse] },
];

export const simulatedCarriers: RatingAdapter[] = SIMULATED_CARRIERS.map((c) => new SimulatedAdapter(c));
