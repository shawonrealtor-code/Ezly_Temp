import type { CarrierQuoteResult, RatingAdapter, RatingRequest } from "./types.ts";

const TIMEOUT_MS = 20_000;

/**
 * Rates a request with every adapter that supports its line and state, in parallel. A failing or slow
 * adapter becomes an error result instead of failing the whole run. Results are cheapest first.
 */
export async function rateAll(adapters: RatingAdapter[], request: RatingRequest): Promise<CarrierQuoteResult[]> {
  const eligible = adapters.filter((a) => a.supports(request.lob, request.state));
  const results = await Promise.all(
    eligible.map((a) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("The insurer didn't respond in time.")), TIMEOUT_MS);
      });
      return Promise.race([a.rate(request), timeout])
        .finally(() => clearTimeout(timer))
        .catch((err: unknown): CarrierQuoteResult => ({
        status: "error",
        carrierKey: a.key,
        errors: [err instanceof Error ? err.message : "The insurer request failed."],
        fields: [],
      }));
    }),
  );
  return results.sort((x, y) => premiumOf(x) - premiumOf(y));
}

const premiumOf = (r: CarrierQuoteResult) => (r.status === "ok" ? r.annualPremium : Infinity);
