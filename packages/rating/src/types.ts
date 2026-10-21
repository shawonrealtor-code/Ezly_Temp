export type Lob = "auto" | "home" | "dwelling_fire";
export type PayPlan = "full_pay" | "monthly" | "eft";
export type CoverageLevel = "basic" | "standard" | "premium";

/** Carrier-neutral description of a risk, built from an application. */
export interface NormalizedRisk {
  lob: Lob;
  state: string; // two-letter code
  zip: string;
  insuredAge: number;
  coverage: CoverageLevel;
  deductible: number;
  /** Auto: drivers and vehicles on the policy. */
  drivers?: number;
  vehicles?: number;
  /** Home / dwelling fire. */
  yearBuilt?: number;
  dwellingCoverage?: number;
}

export type CarrierQuoteResult =
  | { status: "ok"; carrierKey: string; annualPremium: number; termMonths: number }
  | { status: "error"; carrierKey: string; errors: string[] };

/** Every carrier connection (simulated, direct API, or aggregator) implements this. */
export interface RatingAdapter {
  key: string;
  carrierName: string;
  supports(lob: Lob, state: string): boolean;
  rate(risk: NormalizedRisk): Promise<CarrierQuoteResult>;
}
