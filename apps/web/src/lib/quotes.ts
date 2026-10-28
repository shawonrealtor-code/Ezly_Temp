import "server-only";
import { notFound } from "next/navigation";
import { householdName, primaryAddress } from "@ezly/core";
import {
  rateAll,
  simulatedCarriers,
  validateRisk,
  type CarrierQuoteResult,
  type RatingRequest,
  type RiskIssue,
} from "@ezly/rating";
import type { Account, AgencyStore, Application, QuoteRun, User } from "@ezly/store";
import { LOB_TITLES, newDraft, type Draft, type HouseholdPerson, type Lob } from "./quote-forms";

export const household = (account: Account): HouseholdPerson[] =>
  account.people.map((p) => ({
    id: p.id, firstName: p.firstName, lastName: p.lastName, dateOfBirth: p.dateOfBirth, gender: p.gender,
    maritalStatus: p.maritalStatus, relationship: p.relationship, dlStatus: p.dlStatus,
  }));

/** Tomorrow, in the agency's (Eastern) time zone — the default effective date. */
export function tomorrow(): string {
  const d = new Date(Date.now() + 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export async function createApplication(data: AgencyStore, account: Account, lob: Lob): Promise<Application> {
  return data.applications.create({ accountId: account.id, lob, status: "draft", risk: newDraft(lob, household(account), tomorrow()) });
}

/** The client-level problems that stop any quote (insurers price by the client's address and birth date). */
export function accountIssues(account: Account): RiskIssue[] {
  const address = primaryAddress(account.addresses);
  const issues: RiskIssue[] = [];
  if (!address) issues.push({ path: "account.address", message: "Add the client's address on the Details tab — insurers price by location." });
  return issues;
}

export function checkApplication(account: Account, lob: Lob, draft: Draft): { issues: RiskIssue[]; request?: RatingRequest } {
  const issues = accountIssues(account);
  const v = validateRisk(lob, draft);
  if (!v.ok) issues.push(...v.issues);
  if (issues.length || !v.ok) return { issues };
  const address = primaryAddress(account.addresses)!;
  const insured = account.people.find((p) => p.relationship === "primary") ?? account.people[0];
  return {
    issues: [],
    request: {
      lob, state: address.state, zip: address.zip, county: address.county,
      insured: { dateOfBirth: insured.dateOfBirth, maritalStatus: insured.maritalStatus },
      ...(lob === "auto" ? { auto: v.risk as RatingRequest["auto"] } : lob === "home" ? { home: v.risk as RatingRequest["home"] } : { dwelling: v.risk as RatingRequest["dwelling"] }),
    },
  };
}

/**
 * Rates an application with every insurer the agency is appointed with (and that writes the line and state),
 * saves the run, and logs it on the client's timeline.
 */
export async function runQuote(data: AgencyStore, user: User, account: Account, app: Application, request: RatingRequest): Promise<QuoteRun> {
  const appointed = await data.carriers.list((c) => c.enabled && c.appointedStates.includes(request.state));
  const names = new Map(appointed.map((c) => [c.adapterKey, c.name]));
  const adapters = simulatedCarriers.filter((a) => names.has(a.key));
  const results: CarrierQuoteResult[] = await rateAll(adapters, request);
  const now = new Date().toISOString();
  const run = await data.quoteRuns.create({
    accountId: account.id,
    applicationId: app.id,
    lob: request.lob,
    state: request.state,
    zip: request.zip,
    request: (request.auto ?? request.home ?? request.dwelling) as Record<string, unknown>,
    ratedById: user.id,
    submittedAt: now,
    quotes: results.map((r) => ({ ...r, carrierName: names.get(r.carrierKey) ?? r.carrierKey })),
  });
  await data.applications.update(app.id, { status: "valid", lastRatedAt: now });
  if (account.leadStatus === "NEW" || account.leadStatus === "CONTACTED") await data.accounts.update(account.id, { leadStatus: "QUOTED" });
  const ok = run.quotes.filter((q) => q.status === "ok");
  const best = ok[0];
  await data.activities.create({
    accountId: account.id,
    kind: "quote",
    body: `${LOB_TITLES[request.lob]} quote: ${ok.length} of ${run.quotes.length} insurers quoted${best ? `; best ${best.carrierName} at $${best.annualPremium?.toLocaleString("en-US")}/yr` : ""}.`,
    occurredAt: now,
    authorId: user.id,
  });
  return run;
}

export function describeApplication(app: Application): string {
  const r = app.risk as Draft;
  if (app.lob === "auto") {
    const d = (r.drivers as unknown[] | undefined)?.length ?? 0;
    const v = (r.vehicles as unknown[] | undefined)?.length ?? 0;
    return `${d} driver${d === 1 ? "" : "s"}, ${v} vehicle${v === 1 ? "" : "s"}`;
  }
  const c = (r.coverages ?? {}) as Draft;
  const amount = Number(c.dwelling) ? ` · dwelling $${Number(c.dwelling).toLocaleString("en-US")}` : "";
  return `${r.form ?? ""}${amount}`;
}

/** Loads an application and its client for the quote pages; 404s if either is missing. */
export async function loadApplication(data: AgencyStore, accountId: string, appId: string) {
  const [account, app] = await Promise.all([data.accounts.get(accountId), data.applications.get(appId)]);
  if (!account || account.deletedAt || !app || app.accountId !== accountId) notFound();
  return { account, app, name: householdName(account.people) };
}

export async function loadRun(data: AgencyStore, accountId: string, appId: string, runId: string) {
  const loaded = await loadApplication(data, accountId, appId);
  const run = await data.quoteRuns.get(runId);
  if (!run || run.applicationId !== appId) notFound();
  return { ...loaded, run };
}

/** Plain-language facts about what was rated, for the results page and the proposal PDF. */
export function riskSummary(lob: Lob, request: Record<string, unknown>): { label: string; value: string }[] {
  const r = request as Record<string, never>;
  const label = (map: Record<string, string>, v: string) => map[v] ?? v;
  if (lob === "auto") {
    const drivers = r.drivers as { firstName: string; lastName: string; violations: number; atFaultAccidents: number; licenseStatus: string }[];
    const vehicles = r.vehicles as { year: number; make: string; model: string }[];
    const c = r.coverages as Record<string, string>;
    const incidents = drivers.reduce((s, d) => s + d.violations + d.atFaultAccidents, 0);
    return [
      { label: "Effective", value: String(r.effectiveDate) },
      { label: "Drivers", value: drivers.filter((d) => d.licenseStatus !== "none").map((d) => `${d.firstName} ${d.lastName}`).join(", ") },
      { label: "Vehicles", value: vehicles.map((v) => `${v.year} ${v.make} ${v.model}`).join(", ") },
      { label: "Liability", value: `${c.bodilyInjury.replace("/", "k/")}k / $${Number(c.propertyDamage) / 1000}k` },
      { label: "Violations & accidents (3 yrs)", value: incidents ? String(incidents) : "None" },
    ];
  }
  const construction = { frame: "Frame", masonry: "Masonry", masonry_veneer: "Masonry veneer", fire_resistive: "Fire resistive" };
  const roof = { asphalt: "Asphalt shingle", architectural: "Architectural shingle", metal: "Metal", tile: "Tile", slate: "Slate", wood_shake: "Wood shake", flat: "Flat" };
  return [
    { label: "Effective · form", value: `${r.effectiveDate} · ${r.form}` },
    { label: "Year built · construction", value: `${r.yearBuilt} · ${label(construction, r.construction)}` },
    { label: "Square feet · stories", value: `${Number(r.squareFeet).toLocaleString("en-US")} · ${r.stories}` },
    { label: "Roof", value: `${label(roof, r.roofType)}${r.roofYear ? ` · updated ${r.roofYear}` : " · update year not given"}` },
    { label: "Protection class · hydrant", value: `${r.protectionClass} · ${Number(r.hydrantFeet).toLocaleString("en-US")} ft` },
    { label: "Claims (5 years)", value: Number(r.claims5yr) ? String(r.claims5yr) : "None" },
  ];
}
