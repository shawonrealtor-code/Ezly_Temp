import { Suspense } from "react";
import { connection } from "next/server";
import { getCurrentAgency } from "@/lib/store";

async function Stats() {
  await connection();
  const { data } = await getCurrentAgency();
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
    <div className="grid gap-4 sm:grid-cols-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border bg-white p-4">
          <div className="text-3xl font-semibold">{t.value}</div>
          <div className="text-sm text-slate-500">{t.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Dashboard</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <Stats />
      </Suspense>
    </>
  );
}
