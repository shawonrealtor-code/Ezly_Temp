import type { CarrierQuoteResult, Lob, NormalizedRisk, RatingAdapter } from "./types.ts";

// Fictional carriers used until real carrier connections are in place.
const BASE_PREMIUM: Record<Lob, number> = { auto: 1200, home: 1500, dwelling_fire: 900 };
const COVERAGE_FACTOR = { basic: 0.8, standard: 1, premium: 1.3 } as const;

export interface SimulatedCarrierConfig {
  key: string;
  carrierName: string;
  factor: number;
  states: string[];
  lobs: Lob[];
}

export class SimulatedAdapter implements RatingAdapter {
  readonly key: string;
  readonly carrierName: string;

  constructor(private readonly config: SimulatedCarrierConfig) {
    this.key = config.key;
    this.carrierName = config.carrierName;
  }

  supports(lob: Lob, state: string): boolean {
    return this.config.lobs.includes(lob) && this.config.states.includes(state);
  }

  async rate(risk: NormalizedRisk): Promise<CarrierQuoteResult> {
    const errors = validate(risk);
    if (errors.length) return { status: "error", carrierKey: this.key, errors };

    const ageFactor = risk.insuredAge < 25 ? 1.4 : risk.insuredAge > 65 ? 1.15 : 1;
    const deductibleFactor = 1 - Math.min(risk.deductible, 2500) / 10000;
    let premium = BASE_PREMIUM[risk.lob] * ageFactor * COVERAGE_FACTOR[risk.coverage] * deductibleFactor;

    if (risk.lob === "auto") {
      premium *= 1 + 0.6 * ((risk.drivers ?? 1) - 1) + 0.5 * ((risk.vehicles ?? 1) - 1);
    } else {
      premium *= (risk.dwellingCoverage ?? 250000) / 250000;
      if (risk.yearBuilt && risk.yearBuilt < 1960) premium *= 1.2;
    }

    return {
      status: "ok",
      carrierKey: this.key,
      annualPremium: Math.round(premium * this.config.factor),
      termMonths: risk.lob === "auto" ? 6 : 12,
    };
  }
}

function validate(risk: NormalizedRisk): string[] {
  const errors: string[] = [];
  if (!/^\d{5}$/.test(risk.zip)) errors.push("ZIP code must be 5 digits");
  if (risk.insuredAge < 16 || risk.insuredAge > 110) errors.push("Insured age is out of range");
  if (risk.lob === "auto" && !risk.vehicles) errors.push("At least one vehicle is required");
  return errors;
}

const ALL_LOBS: Lob[] = ["auto", "home", "dwelling_fire"];
const MID_ATLANTIC = ["MD", "VA", "DC", "DE", "PA"];

export const simulatedCarriers: RatingAdapter[] = [
  { key: "sim-summit", carrierName: "Summit Mutual (simulated)", factor: 0.95 },
  { key: "sim-harbor", carrierName: "Harbor Insurance (simulated)", factor: 1.05 },
  { key: "sim-pinecrest", carrierName: "Pinecrest General (simulated)", factor: 0.9 },
  { key: "sim-liberty-shield", carrierName: "Liberty Shield (simulated)", factor: 1.12 },
  { key: "sim-crescent", carrierName: "Crescent Casualty (simulated)", factor: 1.0 },
].map((c) => new SimulatedAdapter({ ...c, states: MID_ATLANTIC, lobs: ALL_LOBS }));
