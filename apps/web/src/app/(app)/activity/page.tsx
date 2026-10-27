import { requireUser } from "@/lib/auth";

const LABELS: Record<string, string> = {
  "login.success": "Signed in",
  "login.failure": "Failed sign-in",
  "login.locked": "Sign-in blocked (locked)",
  "mfa.enrolled": "Set up two-step sign-in",
  "mfa.success": "Two-step code accepted",
  "mfa.failure": "Wrong two-step code",
  "mfa.recovery_used": "Used a recovery code",
  "mfa.reset": "Two-step sign-in reset",
  logout: "Signed out",
  "password.changed": "Changed password",
  "user.unlocked": "Account unlocked",
  create: "Created",
  update: "Changed",
  delete: "Deleted",
};

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "medium" });

export default async function ActivityPage() {
  const { data } = await requireUser("audit:read");
  const [entries, users] = await Promise.all([data.auditTrail(undefined, 200), data.users.list()]);
  const name = new Map(users.map((u) => [u.id, u.name]));
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Activity log</h1>
      <p className="mb-4 text-sm text-slate-500">The latest 200 sign-ins and changes. Times are Eastern.</p>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              {["When", "Who", "What", "Details", "IP address"].map((h) => (
                <th key={h} className="px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t align-top">
                <td className="whitespace-nowrap px-3 py-2">{dateTime(e.at)}</td>
                <td className="px-3 py-2">{e.actorId ? (name.get(e.actorId) ?? "Unknown user") : <span className="text-slate-500">System</span>}</td>
                <td className="px-3 py-2">
                  {LABELS[e.action] ?? e.action}
                  {e.collection !== "auth" && <span className="text-slate-500"> · {e.collection}</span>}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {e.detail ??
                    (e.collection === "auth" && e.recordId !== e.actorId && name.get(e.recordId)
                      ? `User: ${name.get(e.recordId)}`
                      : e.action === "update" && e.changes
                        ? `Fields: ${Object.keys(e.changes).join(", ")}`
                        : "")}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{e.ip ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
