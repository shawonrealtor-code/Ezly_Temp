"use client";

import { useActionState } from "react";
import { simulatedCarriers } from "@ezly/rating";
import { rateAction, type RateState } from "./actions";

const carrierName = (key: string) => simulatedCarriers.find((c) => c.key === key)?.carrierName ?? key;
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const field = "flex flex-col gap-1 text-sm text-slate-600";
const input = "rounded border px-2 py-1 text-slate-900";

export function RaterForm() {
  const [state, formAction, pending] = useActionState<RateState, FormData>(rateAction, null);
  return (
    <>
      <form action={formAction} className="mb-6 grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-3">
        <label className={field}>Line
          <select name="lob" className={input}>
            <option value="home">Home</option>
            <option value="auto">Auto</option>
            <option value="dwelling_fire">Dwelling Fire</option>
          </select>
        </label>
        <label className={field}>State
          <select name="state" className={input}><option>MD</option><option>VA</option></select>
        </label>
        <label className={field}>ZIP<input name="zip" defaultValue="21201" className={input} /></label>
        <label className={field}>Insured age<input name="age" type="number" defaultValue={40} className={input} /></label>
        <label className={field}>Coverage
          <select name="coverage" defaultValue="standard" className={input}>
            <option value="basic">Basic</option><option value="standard">Standard</option><option value="premium">Premium</option>
          </select>
        </label>
        <label className={field}>Deductible<input name="deductible" type="number" step={250} defaultValue={1000} className={input} /></label>
        <button disabled={pending} className="rounded bg-teal-700 px-4 py-2 text-white disabled:opacity-50 sm:col-span-3">
          {pending ? "Rating…" : "Get quotes"}
        </button>
      </form>
      {state && (
        <ul className="space-y-2">
          {state.results.map((r) => (
            <li key={r.carrierKey} className="flex justify-between rounded-lg border bg-white p-3">
              <span>{carrierName(r.carrierKey)}</span>
              {r.status === "ok"
                ? <span className="font-semibold">{money(r.annualPremium)} / {r.termMonths} mo</span>
                : <span className="text-red-700">{r.errors.join("; ")}</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
