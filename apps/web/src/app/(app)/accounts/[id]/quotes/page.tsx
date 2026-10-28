import Link from "next/link";
import { money } from "@ezly/core";
import { Icon } from "@/components/icons";
import { Badge, Card, CardHeader, EmptyState, buttonClass, dateFmt } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { LOB_TITLES } from "@/lib/quote-forms";
import { checkApplication, describeApplication } from "@/lib/quotes";
import { NewQuoteButtons } from "./new-quote-buttons";

export default async function QuotesTab({ params }: PageProps<"/accounts/[id]/quotes">) {
  const { id } = await params;
  const { data, can } = await requireUser("accounts:read");
  const [apps, runs, account] = await Promise.all([
    data.applications.list((a) => a.accountId === id),
    data.quoteRuns.list((r) => r.accountId === id),
    data.accounts.get(id),
  ]);
  if (!account) return null;
  const runsBy = Map.groupBy(runs.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)), (r) => r.applicationId);
  apps.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <>
      {can("quotes:run") && <NewQuoteButtons accountId={id} />}
      {apps.length === 0 ? (
        <Card><EmptyState icon="quotes" title="No quotes yet">Start an auto, home or dwelling fire quote above.</EmptyState></Card>
      ) : (
        apps.map((app) => {
          const issues = checkApplication(account, app.lob, app.risk).issues;
          const appRuns = runsBy.get(app.id) ?? [];
          return (
            <Card key={app.id}>
              <CardHeader
                title={`${LOB_TITLES[app.lob]} · ${describeApplication(app)}`}
                icon={app.lob === "auto" ? "car" : "home"}
                action={issues.length ? <Badge tone="amber">Needs {issues.length} item{issues.length === 1 ? "" : "s"}</Badge> : <Badge tone="green">Ready to quote</Badge>}
              />
              <div className="flex flex-wrap items-center gap-2 px-[18px] py-3 text-sm">
                <span className="text-slate-500">Last changed {dateFmt(app.updatedAt, true)}</span>
                <Link href={`/accounts/${id}/quotes/${app.id}`} className={`${buttonClass("secondary", "sm")} ml-auto`}>
                  <Icon name="note" className="h-4 w-4" /> {can("quotes:run") ? "Edit application" : "View application"}
                </Link>
              </div>
              {appRuns.length > 0 && (
                <table className="w-full border-t border-slate-200 text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                      <th className="px-[18px] py-2">Rated</th>
                      <th className="px-3 py-2">Insurers quoted</th>
                      <th className="px-3 py-2">Best annual premium</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {appRuns.slice(0, 5).map((r) => {
                      const ok = r.quotes.filter((q) => q.status === "ok");
                      return (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="px-[18px] py-2">{dateFmt(r.submittedAt, true)}</td>
                          <td className="px-3 py-2">{ok.length} of {r.quotes.length}</td>
                          <td className="px-3 py-2">{ok[0] ? `${money(ok[0].annualPremium ?? 0)} · ${ok[0].carrierName}` : "—"}</td>
                          <td className="px-3 py-2 text-right">
                            <Link href={`/accounts/${id}/quotes/${app.id}/results/${r.id}`} className="font-semibold text-blue-700 hover:underline">View results</Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Card>
          );
        })
      )}
    </>
  );
}
