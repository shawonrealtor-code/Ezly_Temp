import { householdName, primaryAddress, primaryPerson } from "@ezly/core";
import { getRequestMeta, requireUser } from "@/lib/auth";

// Admin-only CSV export of the client list. Never includes SSNs or license numbers. Every export is logged.

const cell = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v);
  // Quote everything, and neutralize spreadsheet formulas (CSV injection).
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

export async function GET() {
  const { data } = await requireUser("reports:export");
  const [accounts, users] = await Promise.all([data.accounts.list((a) => !a.deletedAt), data.users.list()]);
  const name = new Map(users.map((u) => [u.id, u.name]));
  const header = ["Client", "First name", "Last name", "Date of birth", "Email", "Phone", "Address", "City", "State", "ZIP", "County", "Status", "Lead source", "Producer", "CSR", "Customer since", "Created"];
  const lines = accounts.map((a) => {
    const p = primaryPerson(a.people)!;
    const ad = primaryAddress(a.addresses);
    return [
      householdName(a.people), p.firstName, p.lastName, p.dateOfBirth, a.emails[0]?.address, a.phones[0]?.number,
      ad?.line1, ad?.city, ad?.state, ad?.zip, ad?.county, a.leadStatus, a.leadSource,
      a.producerId && name.get(a.producerId), a.csrId && name.get(a.csrId), a.customerSince, a.createdAt.slice(0, 10),
    ].map(cell).join(",");
  });
  await data.logEvent("data.exported", `Exported ${accounts.length} clients to CSV`, undefined, await getRequestMeta());
  return new Response(`﻿${[header.map(cell).join(","), ...lines].join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ezly-clients-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
