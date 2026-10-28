"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { money } from "@ezly/core";
import { payPlanAmounts, type PayPlan } from "@ezly/rating/payplans";
import type { CarrierQuote } from "@ezly/store";
import { Icon } from "@/components/icons";
import { Badge, Card, CardHeader, PageHeader, buttonClass, dateFmt } from "@/components/ui";
import { rerateAction } from "../../../actions";
import { emailProposalAction } from "./email-action";

const PLANS: [PayPlan, string][] = [["full_pay", "Pay in full"], ["monthly", "Monthly"], ["eft", "Bank draft"]];
const TONES = ["text-teal-700", "text-blue-700", "text-amber-700", "text-violet-700", "text-pink-700", "text-emerald-700", "text-sky-700"];
const monogram = (name: string) => name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export function ResultsView(props: {
  accountId: string;
  appId: string;
  runId: string;
  title: string;
  subtitle: string;
  quotes: CarrierQuote[];
  summary: { label: string; value: string }[];
  isLatest: boolean;
  canRate: boolean;
  clientEmail: string;
  emailReady: boolean;
  sendFrom: string;
  emailedAt?: string;
}) {
  const [plan, setPlan] = useState<PayPlan>("full_pay");
  const [sort, setSort] = useState<"low" | "high" | "name">("low");
  const [open, setOpen] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [pending, start] = useTransition();
  const base = `/accounts/${props.accountId}/quotes/${props.appId}`;

  const ok = useMemo(() => {
    const list = props.quotes.filter((q) => q.status === "ok");
    return list.sort((a, b) => (sort === "name" ? a.carrierName.localeCompare(b.carrierName) : sort === "high" ? b.annualPremium! - a.annualPremium! : a.annualPremium! - b.annualPremium!));
  }, [props.quotes, sort]);
  const errors = props.quotes.filter((q) => q.status === "error");
  const best = Math.min(...ok.map((q) => q.annualPremium!));
  const fixField = errors.flatMap((e) => e.fields)[0];
  const reasons = [...new Set(errors.flatMap((e) => e.errors))];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={props.title}
        subtitle={props.subtitle}
        actions={
          <>
            <Link href={base} className={buttonClass()}><Icon name="note" className="h-4 w-4" /> {props.canRate ? "Edit application" : "View application"}</Link>
            {ok.length > 0 && (
              <a href={`${base}/results/${props.runId}/proposal`} download className={buttonClass()}><Icon name="download" className="h-4 w-4" /> Proposal PDF</a>
            )}
            {props.canRate && ok.length > 0 && (
              <button type="button" className={buttonClass()} onClick={() => setEmailOpen(!emailOpen)}><Icon name="mail" className="h-4 w-4" /> Email proposal</button>
            )}
            {props.canRate && (
              <button type="button" disabled={pending} className={buttonClass("primary")} onClick={() => start(() => rerateAction(props.accountId, props.appId))}>
                {pending ? "Rating…" : "Re-rate"}
              </button>
            )}
          </>
        }
      />

      {!props.isLatest && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">These are earlier results. <Link href={`/accounts/${props.accountId}/quotes`} className="font-semibold text-blue-700">See the latest</Link>.</div>
      )}
      {emailOpen && <EmailPanel {...props} onClose={() => setEmailOpen(false)} />}
      {props.emailedAt && <p className="text-sm text-slate-500">Proposal last emailed {dateFmt(props.emailedAt, true)}.</p>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white" role="group" aria-label="Pay plan">
          {PLANS.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={plan === value} onClick={() => setPlan(value)} className={`border-r border-slate-200 px-3.5 py-1.5 text-sm font-semibold last:border-r-0 ${plan === value ? "bg-blue-50 text-blue-700" : "text-slate-500"}`}>
              {label}
            </button>
          ))}
        </div>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm">
          <option value="low">Premium: low to high</option>
          <option value="high">Premium: high to low</option>
          <option value="name">Insurer: A–Z</option>
        </select>
        <span className="ml-auto text-sm text-slate-500">{ok.length} quote{ok.length === 1 ? "" : "s"}{errors.length ? ` · ${errors.length} need attention` : ""}</span>
      </div>

      <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
        Sample insurers with simulated prices, for testing until real insurer connections are set up.
      </p>

      {errors.length > 0 && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[10px] border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <Icon name="alert" />
          <div className="flex-1"><b>{errors.length} insurer{errors.length === 1 ? "" : "s"} couldn&apos;t quote.</b> {reasons.join(" ")}</div>
          {props.canRate && fixField && <Link href={`${base}?fix=${encodeURIComponent(fixField)}`} className={buttonClass("secondary", "sm")}>Fix &amp; re-rate</Link>}
        </div>
      )}

      <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          {ok.map((q, i) => {
            const amounts = payPlanAmounts(q.termPremium!, q.termMonths!);
            const a = amounts[plan];
            const isBest = q.annualPremium === best;
            const expanded = open === q.carrierKey;
            return (
              <div key={q.carrierKey} className={`border-b border-slate-200 last:border-b-0 ${isBest ? "bg-blue-50/40 shadow-[inset_3px_0_0_#1d4ed8]" : ""}`}>
                <div className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 p-4 sm:grid-cols-[52px_minmax(0,1fr)_auto]">
                  <div className={`grid h-[52px] w-[52px] place-items-center rounded-xl border border-slate-200 bg-white text-[15px] font-extrabold ${TONES[i % TONES.length]}`}>{monogram(q.carrierName)}</div>
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold">{q.carrierName}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {isBest && <Badge tone="green">Best price</Badge>}
                      {q.notes.map((n) => <span key={n} className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700">{n}</span>)}
                    </div>
                  </div>
                  <div className="col-span-2 flex items-center gap-4 sm:col-span-1 sm:justify-end">
                    <div className="sm:text-right">
                      <div className="text-[22px] font-bold tabular-nums tracking-tight">{money(a.perPayment, plan !== "full_pay")}</div>
                      <div className="text-xs text-slate-500">
                        {plan === "full_pay" ? `per ${q.termMonths} months` : `/mo × ${a.payments} (total ${money(a.total)})`}
                      </div>
                      <div className="text-xs text-slate-500">{isBest ? `${money(q.annualPremium!)}/yr` : `+${money(q.annualPremium! - best)}/yr vs best`}</div>
                    </div>
                    <button type="button" aria-expanded={expanded} className={`${buttonClass("secondary", "sm")} ml-auto sm:ml-0`} onClick={() => setOpen(expanded ? null : q.carrierKey)}>
                      {expanded ? "Hide" : "Details"}
                    </button>
                  </div>
                  <div className="col-span-2 flex flex-wrap gap-1.5 sm:col-span-2 sm:col-start-2">
                    {q.coverages.map((c) => (
                      <span key={c.label} className="whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{c.label} <b className="font-semibold text-slate-900">{c.value}</b></span>
                    ))}
                  </div>
                </div>
                {expanded && (
                  <div className="grid gap-4 border-t border-slate-100 bg-white px-4 py-3 text-sm sm:grid-cols-2 sm:pl-[84px]">
                    <div>
                      <h4 className="mb-1 font-semibold">Coverages</h4>
                      <dl className="grid grid-cols-[1fr_auto] gap-x-3">{q.coverages.map((c) => <div key={c.label} className="contents"><dt className="text-slate-500">{c.label}</dt><dd>{c.value}</dd></div>)}</dl>
                    </div>
                    <div>
                      <h4 className="mb-1 font-semibold">Ways to pay ({q.termMonths}-month term)</h4>
                      <dl className="grid grid-cols-[1fr_auto] gap-x-3">
                        {Object.values(amounts).map((p) => (
                          <div key={p.plan} className="contents"><dt className="text-slate-500">{p.label}</dt><dd className="tabular-nums">{p.payments === 1 ? money(p.total) : `${p.payments} × ${money(p.perPayment, true)} = ${money(p.total)}`}</dd></div>
                        ))}
                      </dl>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {errors.map((q) => (
            <div key={q.carrierKey} className="grid grid-cols-[52px_1fr_auto] items-center gap-4 border-b border-slate-200 bg-red-50/30 p-4 last:border-b-0">
              <div className="grid h-[52px] w-[52px] place-items-center rounded-xl border border-slate-200 bg-white text-[15px] font-extrabold text-slate-400">{monogram(q.carrierName)}</div>
              <div><b>{q.carrierName}</b><div className="text-sm text-red-700">{q.errors.join(" ")}</div></div>
              <Badge tone="red">No quote</Badge>
            </div>
          ))}
          {props.quotes.length === 0 && <p className="p-6 text-sm text-slate-500">No appointed insurer writes this line in this state. Check carrier appointments in Settings.</p>}
        </Card>
        <Card>
          <CardHeader title="What was rated" />
          <dl className="flex flex-col gap-2.5 px-[18px] py-3.5 text-sm">
            {props.summary.map((s) => (
              <div key={s.label}><dt className="text-xs text-slate-500">{s.label}</dt><dd>{s.value}</dd></div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}

function EmailPanel(props: { accountId: string; appId: string; runId: string; clientEmail: string; emailReady: boolean; sendFrom: string; onClose: () => void }) {
  const [state, setState] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="p-4">
      <form
        className="flex flex-col gap-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          start(async () => setState(await emailProposalAction(props.accountId, props.appId, props.runId, String(f.get("to")), String(f.get("message")))));
        }}
      >
        <h3 className="font-semibold">Email the proposal (PDF attached)</h3>
        {props.emailReady && props.sendFrom && <p className="text-slate-600">Sends from <b>{props.sendFrom}</b>.</p>}
        {!props.emailReady && (
          <p className="rounded bg-amber-50 p-2 text-amber-800">
            Email sending isn&apos;t set up on this server yet. Download the PDF and attach it in your own email for now.
          </p>
        )}
        <label className="flex flex-col gap-1 font-semibold text-slate-700">To<input name="to" type="email" required defaultValue={props.clientEmail} className="rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
        <label className="flex flex-col gap-1 font-semibold text-slate-700">
          Message
          <textarea name="message" rows={4} maxLength={2000} className="rounded-lg border border-slate-300 px-3 py-2 font-normal" defaultValue={"Hi,\n\nAttached are the quotes we discussed. Let me know which option you'd like, or if you have any questions.\n"} />
        </label>
        <div className="flex items-center gap-2">
          <button disabled={pending || !props.emailReady} className={buttonClass("primary", "sm")}>{pending ? "Sending…" : "Send"}</button>
          <button type="button" className={buttonClass("ghost", "sm")} onClick={props.onClose}>Close</button>
          {state?.ok && <span role="status" className="text-emerald-700">{state.ok}</span>}
          {state?.error && <span role="alert" className="text-red-700">{state.error}</span>}
        </div>
      </form>
    </Card>
  );
}
