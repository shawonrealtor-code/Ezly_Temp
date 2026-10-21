import type { CarrierQuoteResult, NormalizedRisk, RatingAdapter } from "./types.ts";

/** Rates a risk with every adapter that supports it, in parallel. A failing adapter becomes an error result. */
export async function rateAll(adapters: RatingAdapter[], risk: NormalizedRisk): Promise<CarrierQuoteResult[]> {
  const eligible = adapters.filter((a) => a.supports(risk.lob, risk.state));
  const results = await Promise.all(
    eligible.map((a) =>
      a.rate(risk).catch((err: unknown): CarrierQuoteResult => ({
        status: "error",
        carrierKey: a.key,
        errors: [err instanceof Error ? err.message : "Carrier request failed"],
      })),
    ),
  );
  return results.sort((x, y) => premiumOf(x) - premiumOf(y));
}

const premiumOf = (r: CarrierQuoteResult) => (r.status === "ok" ? r.annualPremium : Infinity);
