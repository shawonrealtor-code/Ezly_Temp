import type { AutoRisk, DwellingRisk, HomeRisk, Lob } from "./risk.ts";

export type { Lob } from "./risk.ts";

/** Everything an insurer needs to price one policy, independent of any insurer's format. */
export interface RatingRequest {
  lob: Lob;
  state: string;
  zip: string;
  county?: string;
  /** Primary named insured. */
  insured: { dateOfBirth?: string; maritalStatus?: string };
  auto?: AutoRisk;
  home?: HomeRisk;
  dwelling?: DwellingRisk;
}

export interface CoverageLine {
  label: string;
  value: string;
}

export type CarrierQuoteResult =
  | {
      status: "ok";
      carrierKey: string;
      /** Premium for one policy term (6 months for auto, 12 for property). */
      termPremium: number;
      termMonths: 6 | 12;
      annualPremium: number;
      coverages: CoverageLine[];
      notes: string[];
    }
  | {
      status: "error";
      carrierKey: string;
      errors: string[];
      /** Form fields that would fix the problem (paths into the application), for "Fix & re-rate". */
      fields: string[];
    };

/** Every insurer connection (simulated, direct API, or a rating service) implements this. */
export interface RatingAdapter {
  key: string;
  carrierName: string;
  supports(lob: Lob, state: string): boolean;
  rate(request: RatingRequest): Promise<CarrierQuoteResult>;
}
