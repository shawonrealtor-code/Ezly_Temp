// Quote application drafts as edited in the browser (plain strings/booleans), with sensible defaults.
// The rating schemas in @ezly/rating validate them. Browser-safe.

export type Lob = "auto" | "home" | "dwelling_fire";
export type Draft = Record<string, unknown>;

export const LOB_TITLES: Record<Lob, string> = { auto: "Auto", home: "Home", dwelling_fire: "Dwelling fire" };

export interface HouseholdPerson {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: string;
  maritalStatus?: string;
  relationship: string;
  dlStatus?: string;
}

const LICENSE: Record<string, string> = {
  Valid: "valid", "Learner's permit": "permit", Suspended: "suspended", Revoked: "revoked", Expired: "expired", "Not licensed": "none",
};

let counter = 0;
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

export function driverFrom(p: HouseholdPerson): Draft {
  return {
    id: newId("d"),
    personId: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    dateOfBirth: p.dateOfBirth ?? "",
    gender: p.gender ?? "",
    maritalStatus: p.maritalStatus ?? "",
    relationship: p.relationship === "primary" ? "insured" : "spouse",
    licenseStatus: p.dlStatus ? (LICENSE[p.dlStatus] ?? "") : "",
    yearsLicensed: "",
    violations: "0",
    atFaultAccidents: "0",
    goodStudent: false,
    defensiveDriving: false,
  };
}

export const emptyDriver = (): Draft => ({
  ...driverFrom({ id: "", firstName: "", lastName: "", relationship: "other" }),
  personId: undefined,
  relationship: "child",
});

export const emptyVehicle = (): Draft => ({
  id: newId("v"),
  year: "",
  make: "",
  model: "",
  vin: "",
  use: "commute",
  annualMiles: "12000",
  ownership: "owned",
  comprehensiveDeductible: "500",
  collisionDeductible: "500",
  rentalReimbursement: false,
  roadside: false,
});

const property = (effectiveDate: string): Draft => ({
  effectiveDate,
  yearBuilt: "",
  squareFeet: "",
  stories: "1",
  construction: "",
  roofType: "",
  roofYear: "",
  protectionClass: "",
  hydrantFeet: "",
  claims5yr: "0",
  fireAlarm: false,
  burglarAlarm: false,
  sprinklers: false,
  pool: false,
  trampoline: false,
  dog: false,
});

export function newDraft(lob: Lob, household: HouseholdPerson[], effectiveDate: string): Draft {
  if (lob === "auto") {
    return {
      effectiveDate,
      drivers: household.map(driverFrom),
      vehicles: [emptyVehicle()],
      coverages: { bodilyInjury: "100/300", propertyDamage: "50000", uninsuredMotorist: "100/300", medicalPayments: "5000" },
      priorInsurance: { carrier: "", yearsInsured: "", lapseDays: "0" },
    };
  }
  if (lob === "home") {
    return {
      ...property(effectiveDate),
      form: "HO3",
      occupancy: "owner",
      coverages: { dwelling: "", personalProperty: "", liability: "300000", medicalPayments: "1000", deductible: "1000", waterBackup: "0", replacementCostContents: true },
    };
  }
  return {
    ...property(effectiveDate),
    form: "DP3",
    occupancy: "rental",
    units: "1",
    coverages: { dwelling: "", fairRentalValue: "", liability: "300000", deductible: "1000" },
  };
}

/** Immutable set of a dotted path like "vehicles.0.year". */
export function setPath(draft: Draft, path: string, value: unknown): Draft {
  const [head, ...rest] = path.split(".");
  const current = (draft as Record<string, unknown>)[head];
  if (rest.length === 0) return { ...draft, [head]: value };
  if (Array.isArray(current)) {
    const i = Number(rest[0]);
    const copy = [...current];
    copy[i] = rest.length === 1 ? value : setPath(current[i] as Draft, rest.slice(1).join("."), value);
    return { ...draft, [head]: copy };
  }
  return { ...draft, [head]: setPath((current as Draft) ?? {}, rest.join("."), value) };
}

export function getPath(draft: Draft, path: string): unknown {
  return path.split(".").reduce<unknown>((v, key) => (v == null ? undefined : (v as Record<string, unknown>)[key]), draft);
}

export const fieldId = (path: string) => `f-${path.replace(/\./g, "-")}`;
