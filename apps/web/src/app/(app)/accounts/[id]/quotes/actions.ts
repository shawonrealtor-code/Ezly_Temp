"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { RiskIssue } from "@ezly/rating";
import { requireUser } from "@/lib/auth";
import type { Draft, Lob } from "@/lib/quote-forms";
import { checkApplication, createApplication, loadApplication, runQuote } from "@/lib/quotes";

const draftSchema = z.record(z.string(), z.unknown()).refine((d) => JSON.stringify(d).length < 100_000, "The application is too large.");
const lobSchema = z.enum(["auto", "home", "dwelling_fire"]);

export async function createApplicationAction(accountId: string, lob: Lob) {
  const { data } = await requireUser("quotes:run");
  const account = await data.accounts.get(accountId);
  if (!account || account.deletedAt || !lobSchema.safeParse(lob).success) return;
  const app = await createApplication(data, account, lob);
  revalidatePath(`/accounts/${accountId}`, "layout");
  redirect(`/accounts/${accountId}/quotes/${app.id}`);
}

async function save(accountId: string, appId: string, draft: Draft) {
  const ctx = await requireUser("quotes:run");
  const { account, app } = await loadApplication(ctx.data, accountId, appId);
  const parsed = draftSchema.safeParse(draft);
  if (!parsed.success) return { ctx, account, app, issues: [{ path: "", message: "The application couldn't be read." }] as RiskIssue[] };
  const check = checkApplication(account, app.lob, parsed.data);
  const saved = await ctx.data.applications.update(appId, { risk: parsed.data, status: check.issues.length ? "invalid" : "valid" });
  return { ctx, account, app: saved, issues: check.issues, request: check.request };
}

export async function saveApplicationAction(accountId: string, appId: string, draft: Draft): Promise<{ issues: RiskIssue[]; saved: boolean }> {
  const { issues } = await save(accountId, appId, draft);
  revalidatePath(`/accounts/${accountId}`, "layout");
  return { issues, saved: true };
}

/** Saves, checks, and if complete rates with every insurer, then opens the results. */
export async function rateApplicationAction(accountId: string, appId: string, draft: Draft): Promise<{ issues: RiskIssue[] }> {
  const { ctx, account, app, issues, request } = await save(accountId, appId, draft);
  if (issues.length || !request) return { issues };
  const run = await runQuote(ctx.data, ctx.user, account, app, request);
  revalidatePath(`/accounts/${accountId}`, "layout");
  redirect(`/accounts/${accountId}/quotes/${appId}/results/${run.id}`);
}

/** Re-rates the saved application (e.g. after insurers' answers change). */
export async function rerateAction(accountId: string, appId: string) {
  const { data } = await requireUser("quotes:run");
  const { app } = await loadApplication(data, accountId, appId);
  const result = await rateApplicationAction(accountId, appId, app.risk);
  if (result.issues.length) redirect(`/accounts/${accountId}/quotes/${appId}`);
}
