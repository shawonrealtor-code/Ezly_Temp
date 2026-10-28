import type { Activity } from "@ezly/store";
import { Icon, type IconName } from "@/components/icons";
import { Card, CardHeader, EmptyState, dateFmt } from "@/components/ui";
import { loadAccountPage } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { ActivityForm } from "./activity-form";

const KIND_ICON: Record<Activity["kind"], IconName> = { note: "note", call: "phone", email: "mail", text: "message", meeting: "accounts", quote: "quotes" };
const FIELD_LABELS: Record<string, string> = {
  people: "applicant details", addresses: "address", phones: "phone numbers", emails: "email", leadStatus: "status",
  leadSource: "lead source", leadPriority: "priority", producerId: "producer", csrId: "CSR", customerSince: "customer since",
  probabilityOfSale: "probability", preferredContact: "preferred contact", contactTime: "contact time", vip: "VIP",
  labels: "labels", shareEmailWithCarriers: "email sharing",
};

export default async function ActivityTab({ params }: PageProps<"/accounts/[id]/activity">) {
  const { id } = await params;
  const { data, can } = await requireUser("accounts:read");
  const { account, activities, userName } = await loadAccountPage(data, id);
  const history = await data.auditTrail(id, 200);

  type Item = { at: string; icon: IconName; title: string; body?: string; who: string };
  const items: Item[] = [
    ...activities.map((a) => ({
      at: a.occurredAt,
      icon: KIND_ICON[a.kind],
      title: a.kind === "note" ? "Note" : a.kind === "quote" ? "Quote run" : `${a.kind.charAt(0).toUpperCase()}${a.kind.slice(1)} logged`,
      body: a.body,
      who: userName.get(a.authorId) ?? "Unknown user",
    })),
    ...history.map((e) => ({
      at: e.at,
      icon: (e.action === "data.revealed" ? "eye" : "activity") as IconName,
      title:
        e.action === "create"
          ? account.importBatchId && e.at.slice(0, 16) === account.createdAt.slice(0, 16) ? "Imported from a client list" : "Client created"
          : e.action === "update"
            ? `Changed ${Object.keys(e.changes ?? {}).map((k) => FIELD_LABELS[k] ?? k).join(", ") || "details"}`
            : e.action === "data.revealed"
              ? "Viewed a protected field"
              : e.action,
      body: e.action === "data.revealed" ? e.detail : undefined,
      who: e.actorId ? (userName.get(e.actorId) ?? "Unknown user") : "System",
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      {can("accounts:write") && <ActivityForm accountId={id} />}
      <Card>
        <CardHeader title="Timeline" icon="activity" />
        {items.length === 0 ? (
          <EmptyState icon="activity" title="Nothing yet" />
        ) : (
          <ol>
            {items.map((item, i) => (
              <li key={i} className="flex gap-3 border-b border-slate-100 px-[18px] py-3 last:border-b-0">
                <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"><Icon name={item.icon} className="h-[15px] w-[15px]" /></span>
                <div className="min-w-0 text-sm">
                  <b>{item.title}</b>
                  {item.body && <p className="mt-0.5 whitespace-pre-wrap break-words text-slate-700">{item.body}</p>}
                  <div className="mt-0.5 text-xs text-slate-500">{item.who} · {dateFmt(item.at, true)}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
