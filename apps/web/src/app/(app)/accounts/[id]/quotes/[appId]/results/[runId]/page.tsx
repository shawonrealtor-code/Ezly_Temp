import { primaryAddress } from "@ezly/core";
import { requireUser } from "@/lib/auth";
import { mailConfigured, senderAddressFor } from "@/lib/mail";
import { LOB_TITLES } from "@/lib/quote-forms";
import { loadRun, riskSummary } from "@/lib/quotes";
import { ResultsView } from "./results-view";

export default async function ResultsPage({ params }: PageProps<"/accounts/[id]/quotes/[appId]/results/[runId]">) {
  const { id, appId, runId } = await params;
  const { user, data, can } = await requireUser("accounts:read");
  const { account, run } = await loadRun(data, id, appId, runId);
  const [ratedBy, latest] = await Promise.all([
    data.users.get(run.ratedById),
    data.quoteRuns.list((r) => r.applicationId === appId).then((runs) => runs.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0]),
  ]);
  const address = primaryAddress(account.addresses);
  return (
    <ResultsView
      accountId={id}
      appId={appId}
      runId={runId}
      title={`${LOB_TITLES[run.lob]} quote results`}
      subtitle={[address ? `${address.line1}, ${address.city}, ${address.state}` : "", `Effective ${String(run.request.effectiveDate)}`, `Rated ${new Date(run.submittedAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} by ${ratedBy?.name ?? "—"}`]
        .filter(Boolean)
        .join(" · ")}
      quotes={run.quotes}
      summary={riskSummary(run.lob, run.request)}
      isLatest={latest?.id === runId}
      canRate={can("quotes:run")}
      clientEmail={account.emails.find((e) => e.preferred)?.address ?? account.emails[0]?.address ?? ""}
      emailReady={mailConfigured()}
      sendFrom={senderAddressFor(user) ?? ""}
      emailedAt={run.emailedAt}
    />
  );
}
