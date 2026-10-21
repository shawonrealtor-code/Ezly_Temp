import { describe, expect, it } from "vitest";
import { rateAll, simulatedCarriers, type NormalizedRisk, type RatingAdapter } from "./index.ts";

const homeRisk: NormalizedRisk = {
  lob: "home", state: "MD", zip: "21201", insuredAge: 40, coverage: "standard", deductible: 1000,
};

describe("rateAll", () => {
  it("returns a quote from every simulated carrier, cheapest first", async () => {
    const results = await rateAll(simulatedCarriers, homeRisk);
    expect(results).toHaveLength(simulatedCarriers.length);
    const premiums = results.map((r) => (r.status === "ok" ? r.annualPremium : NaN));
    expect(premiums).toEqual([...premiums].sort((a, b) => a - b));
  });

  it("skips carriers that do not write in the state", async () => {
    expect(await rateAll(simulatedCarriers, { ...homeRisk, state: "CA" })).toEqual([]);
  });

  it("reports validation errors instead of a premium", async () => {
    const [first] = await rateAll(simulatedCarriers, { ...homeRisk, zip: "12" });
    expect(first.status).toBe("error");
  });

  it("turns a thrown adapter error into an error result", async () => {
    const broken: RatingAdapter = {
      key: "broken", carrierName: "Broken", supports: () => true,
      rate: () => Promise.reject(new Error("timeout")),
    };
    expect(await rateAll([broken], homeRisk)).toEqual([{ status: "error", carrierKey: "broken", errors: ["timeout"] }]);
  });

  it("charges young drivers more", async () => {
    const auto: NormalizedRisk = { ...homeRisk, lob: "auto", vehicles: 1, drivers: 1 };
    const [adult] = await rateAll(simulatedCarriers.slice(0, 1), auto);
    const [young] = await rateAll(simulatedCarriers.slice(0, 1), { ...auto, insuredAge: 19 });
    expect(young.status === "ok" && adult.status === "ok" && young.annualPremium > adult.annualPremium).toBe(true);
  });
});
