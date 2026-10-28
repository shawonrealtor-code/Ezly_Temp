import { describe, expect, it } from "vitest";
import {
  payPlanAmounts,
  priceAuto,
  priceHome,
  rateAll,
  simulatedCarriers,
  validateRisk,
  type AutoRisk,
  type HomeRisk,
  type RatingAdapter,
  type RatingRequest,
} from "./index.ts";

const autoDraft = {
  effectiveDate: "2026-11-15",
  drivers: [
    { id: "d1", firstName: "Maria", lastName: "Ortega", dateOfBirth: "1984-03-07", relationship: "insured", licenseStatus: "valid", yearsLicensed: "20", violations: "0", atFaultAccidents: "0" },
  ],
  vehicles: [
    { id: "v1", year: "2021", make: "Toyota", model: "RAV4", vin: "", use: "commute", annualMiles: "12,000", ownership: "financed", comprehensiveDeductible: "500", collisionDeductible: "500" },
  ],
  coverages: { bodilyInjury: "100/300", propertyDamage: "50000", uninsuredMotorist: "100/300", medicalPayments: "5000" },
  priorInsurance: { carrier: "Other", yearsInsured: "6", lapseDays: "0" },
};

const homeDraft = {
  effectiveDate: "2026-11-15", form: "HO3", occupancy: "owner", yearBuilt: "1988", squareFeet: "2340", stories: "2",
  construction: "frame", roofType: "asphalt", roofYear: "", protectionClass: "3", hydrantFeet: "400", claims5yr: "0",
  coverages: { dwelling: "425000", personalProperty: "212500", liability: "300000", medicalPayments: "1000", deductible: "1000", waterBackup: "10000", replacementCostContents: true },
};

const request = (lob: "auto" | "home", draft: unknown): RatingRequest => {
  const v = validateRisk(lob, draft);
  if (!v.ok) throw new Error(JSON.stringify(v.issues));
  return { lob, state: "MD", zip: "21044", insured: {}, [lob]: v.risk };
};

describe("risk validation", () => {
  it("accepts complete drafts typed as strings, converting numbers", () => {
    const v = validateRisk("auto", autoDraft);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.risk.vehicles[0].annualMiles).toBe(12000);
  });

  it("explains what is missing in plain words with the field path", () => {
    const v = validateRisk("auto", { ...autoDraft, vehicles: [{ ...autoDraft.vehicles[0], year: "", vin: "123" }] });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.issues).toContainEqual({ path: "vehicles.0.year", message: "Vehicle 1: Vehicle year is required" });
      expect(v.issues.map((i) => i.path)).toContain("vehicles.0.vin");
    }
  });

  it("requires enough dwelling coverage for HO3", () => {
    const v = validateRisk("home", { ...homeDraft, coverages: { ...homeDraft.coverages, dwelling: "10000" } });
    expect(!v.ok && v.issues[0].path).toBe("coverages.dwelling");
  });
});

describe("pricing behaves like real rating", () => {
  const auto = request("auto", autoDraft).auto!;
  const home = request("home", homeDraft).home!;
  const withDriver = (patch: Partial<AutoRisk["drivers"][number]>): AutoRisk => ({ ...auto, drivers: [{ ...auto.drivers[0], ...patch }] });

  it("charges young drivers and drivers with violations more", () => {
    const base = priceAuto(auto, "MD").termPremium;
    expect(priceAuto(withDriver({ dateOfBirth: "2007-01-01", yearsLicensed: 1 }), "MD").termPremium).toBeGreaterThan(base * 2);
    expect(priceAuto(withDriver({ violations: 2 }), "MD").termPremium).toBeGreaterThan(base * 1.4);
  });

  it("charges less for liability-only and higher deductibles", () => {
    const base = priceAuto(auto, "MD").termPremium;
    const liabilityOnly = { ...auto, vehicles: [{ ...auto.vehicles[0], comprehensiveDeductible: "none" as const, collisionDeductible: "none" as const }] };
    expect(priceAuto(liabilityOnly, "MD").termPremium).toBeLessThan(base * 0.7);
  });

  it("prices homes by coverage, deductible and claims", () => {
    const base = priceHome(home, "MD").termPremium;
    const bigger: HomeRisk = { ...home, coverages: { ...home.coverages, dwelling: 850000 } };
    expect(priceHome(bigger, "MD").termPremium).toBeGreaterThan(base * 1.8);
    expect(priceHome({ ...home, coverages: { ...home.coverages, deductible: "5000" } }, "MD").termPremium).toBeLessThan(base);
    expect(priceHome({ ...home, claims5yr: 2 }, "MD").termPremium).toBeGreaterThan(base * 1.3);
    expect(base).toBeGreaterThan(900);
    expect(base).toBeLessThan(3000);
  });
});

describe("rateAll", () => {
  it("quotes every eligible insurer, cheapest first, with errors for those that decline", async () => {
    const results = await rateAll(simulatedCarriers, request("home", homeDraft));
    expect(results.map((r) => r.carrierKey)).toHaveLength(7);
    const ok = results.filter((r) => r.status === "ok");
    expect(ok.length).toBe(5);
    const premiums = ok.map((r) => (r.status === "ok" ? r.annualPremium : 0));
    expect(premiums).toEqual([...premiums].sort((a, b) => a - b));
    const errors = results.filter((r) => r.status === "error");
    expect(errors.every((e) => e.status === "error" && e.fields.includes("roofYear"))).toBe(true);
  });

  it("lets declined insurers quote once the missing field is added", async () => {
    const results = await rateAll(simulatedCarriers, request("home", { ...homeDraft, roofYear: "2015" }));
    expect(results.every((r) => r.status === "ok")).toBe(true);
  });

  it("only asks insurers that write the line and state, and shows 6-month auto terms", async () => {
    const results = await rateAll(simulatedCarriers, request("auto", autoDraft));
    expect(results.map((r) => r.carrierKey)).not.toContain("sim-northgate");
    const first = results[0];
    expect(first.status === "ok" && first.termMonths === 6 && first.annualPremium === first.termPremium * 2).toBe(true);
    expect(await rateAll(simulatedCarriers, { ...request("auto", autoDraft), state: "CA" })).toEqual([]);
  });

  it("turns a failing insurer into an error result", async () => {
    const broken: RatingAdapter = { key: "broken", carrierName: "Broken", supports: () => true, rate: () => Promise.reject(new Error("timeout")) };
    expect(await rateAll([broken], request("auto", autoDraft))).toEqual([{ status: "error", carrierKey: "broken", errors: ["timeout"], fields: [] }]);
  });
});

describe("pay plans", () => {
  it("adds installment fees to monthly plans", () => {
    const p = payPlanAmounts(1200, 12);
    expect(p.full_pay.total).toBe(1200);
    expect(p.eft).toMatchObject({ payments: 12, perPayment: 102, total: 1224 });
    expect(p.monthly).toMatchObject({ perPayment: 106, total: 1272 });
  });
});
