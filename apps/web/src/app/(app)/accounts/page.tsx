import { requireUser } from "@/lib/auth";

export default async function AccountsPage() {
  const { data } = await requireUser("accounts:read");
  const [accounts, users] = await Promise.all([data.accounts.list((a) => !a.deletedAt), data.users.list()]);
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const rows = accounts
    .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
    .slice(0, 50)
    .map((a) => ({
      id: a.id,
      person: a.people.find((p) => p.relationship === "primary") ?? a.people[0],
      address: a.addresses.find((ad) => ad.isPrimary) ?? a.addresses[0],
      producer: a.producerId ? userName.get(a.producerId) : undefined,
      leadStatus: a.leadStatus,
    }));
  return (
    <>
    <h1 className="mb-4 text-xl font-semibold">Accounts</h1>
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
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2">{r.person.lastName}</td>
              <td className="px-3 py-2">{r.person.firstName}</td>
              <td className="px-3 py-2">{r.producer}</td>
              <td className="px-3 py-2">{r.address?.city}</td>
              <td className="px-3 py-2">{r.address?.state}</td>
              <td className="px-3 py-2">{r.address?.zip}</td>
              <td className="px-3 py-2">{r.leadStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
