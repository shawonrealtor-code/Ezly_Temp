import { requireUser } from "@/lib/auth";

export default async function Dashboard() {
  const { user, data } = await requireUser("dashboard:view");
  const [accounts, leads, policies] = await Promise.all([
    data.accounts.count((a) => !a.deletedAt),
    data.accounts.count((a) => !a.deletedAt && (a.leadStatus === "NEW" || a.leadStatus === "CONTACTED")),
    data.policies.count((p) => p.status === "ACTIVE"),
  ]);
  const tiles = [
    { label: "Accounts", value: accounts },
    { label: "Open leads", value: leads },
    { label: "Active policies", value: policies },
  ];
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Welcome, {user.name.split(" ")[0]}</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border bg-white p-4">
            <div className="text-3xl font-semibold">{t.value}</div>
            <div className="text-sm text-slate-500">{t.label}</div>
          </div>
        ))}
      </div>
    </>
  );
}
