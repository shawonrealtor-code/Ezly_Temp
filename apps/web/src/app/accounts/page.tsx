import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@ezly/db";

async function AccountTable() {
  await connection();
  const accounts = await prisma.account.findMany({
    where: { deletedAt: null },
    include: {
      people: { where: { relationship: "primary" }, take: 1 },
      addresses: { where: { isPrimary: true }, take: 1 },
      producer: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-100 text-left">
          <tr>
            {["Last name", "First name", "Producer", "City", "State", "ZIP", "Lead status"].map((h) => (
              <th key={h} className="px-3 py-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => {
            const p = a.people[0];
            const addr = a.addresses[0];
            return (
              <tr key={a.id} className="border-t">
                <td className="px-3 py-2">{p?.lastName}</td>
                <td className="px-3 py-2">{p?.firstName}</td>
                <td className="px-3 py-2">{a.producer?.name}</td>
                <td className="px-3 py-2">{addr?.city}</td>
                <td className="px-3 py-2">{addr?.state}</td>
                <td className="px-3 py-2">{addr?.zip}</td>
                <td className="px-3 py-2">{a.leadStatus}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AccountsPage() {
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Accounts</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <AccountTable />
      </Suspense>
    </>
  );
}
