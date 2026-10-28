import { z } from "zod";

// What each quote form collects. Drafts are saved as entered (strings); these schemas turn a draft into
// a rating request and explain anything missing in plain words. Browser-safe.

const blank = (v: unknown) => v === "" || v === null || v === undefined;
const num = (label: string, min: number, max: number, int = true) =>
  z.preprocess(
    (v) => (blank(v) ? undefined : Number(String(v).replace(/[$,\s]/g, ""))),
    z
      .number({ error: (i) => (i.input === undefined ? `${label} is required` : `${label} must be a number`) })
      .min(min, `${label} must be at least ${min.toLocaleString()}`)
      .max(max, `${label} must be at most ${max.toLocaleString()}`)
      .refine((n) => !int || Number.isInteger(n), `${label} must be a whole number`),
  );
const optNum = (label: string, min: number, max: number) =>
  z.preprocess(
    (v) => (blank(v) ? undefined : Number(String(v).replace(/[$,\s]/g, ""))),
    z.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`).min(min, `${label} must be at least ${min}`).max(max, `${label} must be at most ${max}`).optional(),
  );
const pick = <const T extends readonly [string, ...string[]]>(label: string, values: T) =>
  z.enum(values, { error: () => `Choose ${label.toLowerCase()}` });
const text = (label: string) => z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`);
const date = (label: string) => z.iso.date({ error: `${label} must be a date` });
const flag = z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean());

export const BI_LIMITS = ["30/60", "50/100", "100/300", "250/500"] as const;
export const PD_LIMITS = ["15000", "25000", "50000", "100000"] as const;
export const PHYS_DEDUCTIBLES = ["none", "250", "500", "1000"] as const;

export const driverSchema = z.object({
  id: z.string(),
  personId: z.string().optional(),
  firstName: text("First name"),
  lastName: text("Last name"),
  dateOfBirth: date("Date of birth"),
  gender: z.string().optional(),
  maritalStatus: z.string().optional(),
  relationship: pick("Relationship", ["insured", "spouse", "child", "other"]),
  licenseStatus: pick("License status", ["valid", "permit", "suspended", "revoked", "expired", "none"]),
  yearsLicensed: num("Years licensed", 0, 80),
  violations: num("Violations (3 yrs)", 0, 20),
  atFaultAccidents: num("At-fault accidents (3 yrs)", 0, 20),
  goodStudent: flag.default(false),
  defensiveDriving: flag.default(false),
});

export const vehicleSchema = z.object({
  id: z.string(),
  year: num("Vehicle year", 1960, new Date().getFullYear() + 1),
  make: text("Make"),
  model: text("Model"),
  vin: z.string().trim().regex(/^$|^[A-HJ-NPR-Z0-9]{17}$/i, "VIN must be 17 characters (no I, O or Q)").optional(),
  use: pick("Vehicle use", ["commute", "pleasure", "business"]),
  annualMiles: num("Annual miles", 0, 150_000),
  ownership: pick("Ownership", ["owned", "financed", "leased"]),
  comprehensiveDeductible: pick("Comprehensive deductible", PHYS_DEDUCTIBLES),
  collisionDeductible: pick("Collision deductible", PHYS_DEDUCTIBLES),
  rentalReimbursement: flag.default(false),
  roadside: flag.default(false),
});

export const autoRiskSchema = z.object({
  effectiveDate: date("Effective date"),
  drivers: z.array(driverSchema).min(1, "Add at least one driver").max(8),
  vehicles: z.array(vehicleSchema).min(1, "Add at least one vehicle").max(8),
  coverages: z.object({
    bodilyInjury: pick("Bodily injury limits", BI_LIMITS),
    propertyDamage: pick("Property damage limit", PD_LIMITS),
    uninsuredMotorist: pick("Uninsured motorist", [...BI_LIMITS, "rejected"]),
    medicalPayments: pick("Medical payments", ["0", "1000", "5000", "10000"]),
  }),
  priorInsurance: z.object({
    carrier: z.string().optional(),
    yearsInsured: num("Years with prior insurance", 0, 60),
    lapseDays: num("Days without insurance", 0, 3650),
  }),
});

const propertyShape = {
  effectiveDate: date("Effective date"),
  yearBuilt: num("Year built", 1800, new Date().getFullYear() + 1),
  squareFeet: num("Square feet", 200, 30_000),
  stories: num("Stories", 1, 6),
  construction: pick("Construction", ["frame", "masonry", "masonry_veneer", "fire_resistive"]),
  roofType: pick("Roof type", ["asphalt", "architectural", "metal", "tile", "slate", "wood_shake", "flat"]),
  /** Optional on the form, but some insurers require it for older homes. */
  roofYear: optNum("Roof year", 1900, new Date().getFullYear() + 1),
  protectionClass: num("Protection class", 1, 10),
  hydrantFeet: num("Distance to hydrant (ft)", 0, 10_000),
  claims5yr: num("Claims in 5 years", 0, 20),
  fireAlarm: flag.default(false),
  burglarAlarm: flag.default(false),
  sprinklers: flag.default(false),
  pool: flag.default(false),
  trampoline: flag.default(false),
  dog: flag.default(false),
};

export const homeRiskSchema = z.object({
  ...propertyShape,
  form: pick("Policy form", ["HO3", "HO5", "HO6", "HO4"]),
  occupancy: pick("Occupancy", ["owner", "seasonal"]),
  coverages: z.object({
    dwelling: num("Dwelling coverage (A)", 0, 10_000_000),
    personalProperty: num("Personal property (C)", 0, 5_000_000),
    liability: pick("Liability", ["100000", "300000", "500000"]),
    medicalPayments: pick("Medical payments", ["1000", "2000", "5000"]),
    deductible: pick("Deductible", ["500", "1000", "2500", "5000"]),
    waterBackup: pick("Water backup", ["0", "5000", "10000", "25000"]),
    replacementCostContents: flag.default(true),
  }),
}).superRefine((r, ctx) => {
  if ((r.form === "HO3" || r.form === "HO5") && r.coverages.dwelling < 50_000) {
    ctx.addIssue({ code: "custom", path: ["coverages", "dwelling"], message: "Dwelling coverage must be at least 50,000 for HO3/HO5" });
  }
});

export const dwellingRiskSchema = z.object({
  ...propertyShape,
  form: pick("Policy form", ["DP1", "DP3"]),
  occupancy: pick("Occupancy", ["rental", "owner", "vacant"]),
  units: num("Units", 1, 4),
  coverages: z.object({
    dwelling: num("Dwelling coverage (A)", 50_000, 5_000_000),
    fairRentalValue: num("Fair rental value (D)", 0, 500_000),
    liability: pick("Liability", ["0", "100000", "300000", "500000"]),
    deductible: pick("Deductible", ["500", "1000", "2500", "5000"]),
  }),
});

export type AutoRisk = z.output<typeof autoRiskSchema>;
export type HomeRisk = z.output<typeof homeRiskSchema>;
export type DwellingRisk = z.output<typeof dwellingRiskSchema>;
export type Lob = "auto" | "home" | "dwelling_fire";

export const RISK_SCHEMAS = { auto: autoRiskSchema, home: homeRiskSchema, dwelling_fire: dwellingRiskSchema } as const;

export interface RiskIssue {
  /** Dotted path into the draft, e.g. "vehicles.0.year". */
  path: string;
  message: string;
}

/** Checks a saved draft. Returns the typed risk when everything needed for rating is present. */
export function validateRisk<L extends Lob>(lob: L, draft: unknown):
  | { ok: true; risk: z.output<(typeof RISK_SCHEMAS)[L]>; issues: [] }
  | { ok: false; issues: RiskIssue[] } {
  const result = (RISK_SCHEMAS[lob] as z.ZodType).safeParse(draft);
  if (result.success) return { ok: true, risk: result.data as never, issues: [] };
  const issues = result.error.issues.map((i) => ({ path: i.path.join("."), message: humanize(i.path, i.message) }));
  return { ok: false, issues: issues.filter((x, n) => issues.findIndex((y) => y.path === x.path) === n) };
}

function humanize(path: PropertyKey[], message: string): string {
  const [list, index] = path;
  if ((list === "drivers" || list === "vehicles") && typeof index === "number") {
    return `${list === "drivers" ? "Driver" : "Vehicle"} ${index + 1}: ${message}`;
  }
  return message;
}
