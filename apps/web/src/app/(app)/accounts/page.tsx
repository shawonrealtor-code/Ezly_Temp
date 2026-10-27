import Link from "next/link";
import { initials, money } from "@ezly/core";
import { Avatar, Badge, ButtonLink, Card, EmptyState, LEAD_STATUS, LOB_LABELS, PageHeader, buttonClass, timeAgo, toneFor } from "@/components/ui";
import { assignableStaff, listAccounts } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { FilterBar } from "./filter-bar";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const nowMs = () => Date.now();

export default async function AccountsPage({ searchParams }: PageProps<"/accounts">) {
  const { user, data, can } = await requireUser("accounts:read");
  const sp = await searchParams;
  const query = {
    q: first(sp.q)?.slice(0, 200),
    status: first(sp.status),
    producerId: first(sp.producer),
    mine: first(sp.mine) === "1",
    sort: first(sp.sort) === "name" ? ("name" as const) : ("recent" as const),
    page: Number(first(sp.page)) || 1,
  };
  const [{ rows, total, page, pageCount }, staff, all] = await Promise.all([
    listAccounts(data, user, query),
    assignableStaff(data),
    data.accounts.count((a) => !a.deletedAt),
  ]);
  const filtered = !!(query.q || query.status || query.producerId || query.mine);
  const pageHref = (p: number) => {
    const next = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    next.set("page", String(p));
    return `/accounts?${next}`;
  };
  const now = nowMs();

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${all} clients and prospects`}
        actions={
          <>
            {can("accounts:import") && <ButtonLink href="/accounts/import" icon="upload">Import</ButtonLink>}
            {can("reports:export") && (
              // A plain link: this downloads a file from a route handler rather than navigating to a page.
              <a href="/accounts/export" download className={buttonClass()}>Export CSV</a>
            )}
            {can("accounts:write") && <ButtonLink href="/accounts/new" variant="primary" icon="plus">New client</ButtonLink>}
          </>
        }
      />
      <Card>
        <FilterBar producers={staff.producers} />
        {rows.length === 0 ? (
          <EmptyState title={filtered ? "No clients match" : "No clients yet"}>
            {filtered ? "Try fewer words or clear the filters." : can("accounts:write") ? <Link href="/accounts/new" className="text-blue-700">Add your first client</Link> : null}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-4 py-2.5">Client</th>
                  <th className="px-4 py-2.5">Lines</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Producer</th>
                  <th className="px-4 py-2.5">Location</th>
                  <th className="px-4 py-2.5 text-right">Annual premium</th>
                  <th className="px-4 py-2.5">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/accounts/${r.id}`} className="flex items-center gap-2.5 font-semibold">
                        <Avatar text={initials(r.name)} tone={toneFor(r.id)} />
                        <span>
                          {r.name} {r.vip && <span title="VIP" className="text-amber-500">★</span>}
                          <span className="block text-xs font-normal text-slate-500">{r.contact}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">{r.lines.length ? r.lines.map((l) => <Badge key={l} dot={false}>{LOB_LABELS[l]}</Badge>) : <span className="text-slate-400">—</span>}</div>
                    </td>
                    <td className="px-4 py-3"><Badge tone={LEAD_STATUS[r.leadStatus].tone}>{LEAD_STATUS[r.leadStatus].label}</Badge></td>
                    <td className="px-4 py-3">{r.producer}</td>
                    <td className="px-4 py-3 text-slate-500">{r.location}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.premium ? money(r.premium) : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{timeAgo(r.touched, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center border-t border-slate-200 px-[18px] py-3 text-sm">
          <span className="text-slate-500">{total ? `Showing ${(page - 1) * 25 + 1}–${Math.min(page * 25, total)} of ${total}` : ""}</span>
          {pageCount > 1 && (
            <span className="ml-auto flex gap-1.5">
              {page > 1 ? <Link href={pageHref(page - 1)} className={buttonClass("secondary", "sm")}>Previous</Link> : <span className={`${buttonClass("secondary", "sm")} opacity-50`}>Previous</span>}
              {page < pageCount ? <Link href={pageHref(page + 1)} className={buttonClass("secondary", "sm")}>Next</Link> : <span className={`${buttonClass("secondary", "sm")} opacity-50`}>Next</span>}
            </span>
          )}
        </div>
      </Card>
    </>
  );
}
