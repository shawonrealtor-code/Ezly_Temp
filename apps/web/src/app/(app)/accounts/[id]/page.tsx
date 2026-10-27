import Link from "next/link";
import { money, ratingReadiness } from "@ezly/core";
import { Icon } from "@/components/icons";
import { Badge, Card, CardHeader, EmptyState, LOB_LABELS, dateFmt, timeAgo } from "@/components/ui";
import { loadAccountPage } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";

const POLICY_STATUS: Record<string, "green" | "blue" | "amber" | "gray" | "red"> = {
  ACTIVE: "green", BOUND: "blue", RENEWING: "amber", QUOTED: "gray", CANCELLED: "red", EXPIRED: "gray", NON_RENEWED: "red",
};

export default async function AccountOverview({ params }: PageProps<"/accounts/[id]">) {
  const { id } = await params;
  const { data } = await requireUser("accounts:read");
  const { account, policies, tasks, activities, userName, carrierName } = await loadAccountPage(data, id);
  const inForce = policies.filter((p) => ["ACTIVE", "BOUND", "RENEWING"].includes(p.status));
  const premium = inForce.reduce((s, p) => s + p.writtenPremium, 0);
  const openTasks = tasks.filter((t) => t.status === "open").sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
  const missing = ratingReadiness(account).filter((i) => !i.done);
  const since = account.customerSince ?? account.createdAt.slice(0, 10);
  const months = Math.max(0, Math.round((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(since)) / (30.44 * 86_400_000)));
  const now = Date.parse(new Date().toISOString());

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4"><div className="text-[13px] font-medium text-slate-500">Annual premium in force</div><div className="mt-1.5 text-[26px] font-bold tracking-tight">{money(premium)}</div><div className="text-xs text-slate-500">{inForce.length} active {inForce.length === 1 ? "policy" : "policies"}</div></Card>
        <Card className="p-4"><div className="text-[13px] font-medium text-slate-500">{account.customerSince ? "Customer for" : "In Ezly for"}</div><div className="mt-1.5 text-[26px] font-bold tracking-tight">{months < 12 ? `${months} mo` : `${Math.floor(months / 12)} yr`}</div><div className="text-xs text-slate-500">since {dateFmt(since)}</div></Card>
        <Card className="p-4"><div className="text-[13px] font-medium text-slate-500">Open tasks</div><div className="mt-1.5 text-[26px] font-bold tracking-tight">{openTasks.length}</div><div className="text-xs text-slate-500">{openTasks[0]?.dueDate ? `next due ${dateFmt(openTasks[0].dueDate)}` : "nothing due"}</div></Card>
      </div>

      <Card>
        <CardHeader title="Ready to rate?" icon="quotes" action={<Badge tone={missing.length ? "amber" : "green"} dot={false}>{missing.length ? `${missing.length} missing` : "Ready"}</Badge>} />
        <div className="px-[18px] py-3.5 text-sm">
          {missing.length === 0 ? (
            "Everything carriers need is on file."
          ) : (
            <>
              Before quoting, add: {missing.map((m) => m.label.toLowerCase()).join("; ")}.{" "}
              <Link href={`/accounts/${id}/details`} className="font-semibold text-blue-700 hover:underline">Complete details</Link>
            </>
          )}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Policies" icon="policies" />
          {policies.length === 0 ? (
            <EmptyState icon="policies" title="No policies yet">Quotes and policies appear here once they&apos;re added.</EmptyState>
          ) : (
            policies.map((p) => (
              <div key={p.id} className="flex items-center gap-3.5 border-b border-slate-200 px-[18px] py-3.5 last:border-b-0">
                <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-blue-50 text-blue-700"><Icon name={p.lob === "auto" ? "car" : "home"} /></span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{LOB_LABELS[p.lob]}{p.policyNumber && ` · ${p.policyNumber}`}</div>
                  <div className="text-[13px] text-slate-500">{carrierName.get(p.carrierId) ?? "Carrier"} · {money(p.writtenPremium)}/yr · expires {dateFmt(p.expirationDate)}</div>
                </div>
                <Badge tone={POLICY_STATUS[p.status]}>{p.status.charAt(0) + p.status.slice(1).toLowerCase().replace("_", "-")}</Badge>
              </div>
            ))
          )}
        </Card>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Open tasks" icon="tasks" />
            {openTasks.length === 0 ? (
              <p className="px-[18px] py-4 text-sm text-slate-500">No open tasks.</p>
            ) : (
              openTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 border-b border-slate-200 px-[18px] py-3 text-sm last:border-b-0">
                  <span className="h-[18px] w-[18px] rounded-[5px] border-[1.5px] border-slate-300" />
                  <div className="flex-1">
                    <div className="font-semibold">{t.title}</div>
                    <div className="text-[13px] text-slate-500">{t.assigneeId ? userName.get(t.assigneeId) : "Unassigned"}{t.dueDate && ` · due ${dateFmt(t.dueDate)}`}</div>
                  </div>
                  {t.priority === "high" && <Badge tone="amber" dot={false}>High</Badge>}
                </div>
              ))
            )}
          </Card>
          <Card>
            <CardHeader title="Recent activity" icon="activity" action={<Link href={`/accounts/${id}/activity`} className="text-blue-700">View all</Link>} />
            {activities.length === 0 ? (
              <p className="px-[18px] py-4 text-sm text-slate-500">No notes or calls logged yet.</p>
            ) : (
              activities.slice(0, 4).map((a) => (
                <div key={a.id} className="border-b border-slate-200 px-[18px] py-3 text-sm last:border-b-0">
                  <b className="capitalize">{a.kind}</b> · <span className="line-clamp-2 inline">{a.body}</span>
                  <div className="text-xs text-slate-500">{userName.get(a.authorId)} · {timeAgo(a.occurredAt, now)}</div>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
