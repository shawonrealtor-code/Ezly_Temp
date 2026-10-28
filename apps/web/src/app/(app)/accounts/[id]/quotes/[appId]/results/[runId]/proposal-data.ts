import "server-only";
import { householdName, primaryAddress } from "@ezly/core";
import type { AgencyStore, User } from "@ezly/store";
import { LOB_TITLES } from "@/lib/quote-forms";
import { buildProposalPdf } from "@/lib/proposal-pdf";
import { loadRun, riskSummary } from "@/lib/quotes";
import { getStore } from "@/lib/store";

/** Builds the proposal PDF for a quote run, plus a file name and the client's name. */
export async function proposalFor(data: AgencyStore, user: User, accountId: string, appId: string, runId: string) {
  const { account, run } = await loadRun(data, accountId, appId, runId);
  const agency = await getStore().agencies.get(user.agencyId);
  const address = primaryAddress(account.addresses);
  const clientName = householdName(account.people);
  const pdf = await buildProposalPdf({
    agencyName: agency?.name ?? "Your insurance agency",
    preparedBy: { name: user.name, email: user.email },
    clientName,
    clientAddress: address ? `${address.line1}, ${address.city}, ${address.state} ${address.zip}` : "",
    lobTitle: LOB_TITLES[run.lob],
    ratedAt: new Date(run.submittedAt).toLocaleDateString("en-US", { timeZone: "America/New_York", dateStyle: "long" }),
    summary: riskSummary(run.lob, run.request),
    quotes: run.quotes,
    simulated: run.quotes.some((q) => q.carrierKey.startsWith("sim-")),
  });
  const fileName = `${LOB_TITLES[run.lob].replace(/\s/g, "-")}-proposal-${clientName.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`;
  return { pdf, fileName, run, account, clientName };
}
