import Link from "next/link";
import { householdName, money } from "@ezly/core";
import { Badge, Card, EmptyState, PageHeader, dateFmt } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { LOB_TITLES } from "@/lib/quote-forms";

export default async function QuotesPage() {
  const { data } = await requireUser("accounts:read");
  const [runs, accounts, users] = await Promise.all([data.quoteRuns.list(), data.accounts.list(), data.users.list()]);
  const account = new Map(accounts.map((a) => [a.id, a]));
  const user = new Map(users.map((u) => [u.id, u.name]));
  const recent = runs.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 100);
  return (
    <>
      <PageHeader title="Quotes" subtitle="Recent quote runs across all clients. To start a quote, open a client and use the Quotes tab." />
      <Card>
        {recent.length === 0 ? (
          <EmptyState icon="quotes" title="No quotes yet">
            Open a client from <Link href="/accounts" className="text-blue-700">Clients</Link> and choose <b>Quotes</b>.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-4 py-2.5">Rated</th>
                  <th className="px-4 py-2.5">Client</th>
                  <th className="px-4 py-2.5">Line</th>
                  <th className="px-4 py-2.5">Quoted</th>
                  <th className="px-4 py-2.5 text-right">Best annual premium</th>
                  <th className="px-4 py-2.5">By</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => {
                  const a = account.get(r.accountId);
                  const ok = r.quotes.filter((q) => q.status === "ok");
                  return (
                    <tr key={r.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <Link href={`/accounts/${r.accountId}/quotes/${r.applicationId}/results/${r.id}`} className="text-blue-700 hover:underline">{dateFmt(r.submittedAt, true)}</Link>
                      </td>
                      <td className="px-4 py-2.5 font-medium">{a ? householdName(a.people) : "Deleted client"}</td>
                      <td className="px-4 py-2.5">{LOB_TITLES[r.lob]}</td>
                      <td className="px-4 py-2.5">
                        {ok.length} of {r.quotes.length} {ok.length < r.quotes.length && <Badge tone="amber" dot={false}>{r.quotes.length - ok.length} declined</Badge>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{ok[0] ? `${money(ok[0].annualPremium ?? 0)} · ${ok[0].carrierName}` : "—"}</td>
                      <td className="px-4 py-2.5">{user.get(r.ratedById) ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
