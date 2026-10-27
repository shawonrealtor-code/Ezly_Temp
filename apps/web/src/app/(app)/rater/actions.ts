"use server";

import { requireUser } from "@/lib/auth";
import { rateAll, simulatedCarriers, type CarrierQuoteResult, type Lob, type CoverageLevel } from "@ezly/rating";

export type RateState = { results: CarrierQuoteResult[] } | null;

export async function rateAction(_prev: RateState, form: FormData): Promise<RateState> {
  await requireUser("quotes:run");
  const results = await rateAll(simulatedCarriers, {
    lob: form.get("lob") as Lob,
    state: String(form.get("state")),
    zip: String(form.get("zip")),
    insuredAge: Number(form.get("age")),
    coverage: form.get("coverage") as CoverageLevel,
    deductible: Number(form.get("deductible")),
    drivers: 1,
    vehicles: 1,
  });
  return { results };
}
