import { ROLE_LABELS } from "@ezly/auth/permissions";
import { requireUser } from "@/lib/auth";
import { agencyMailbox, dailyLimit, domainOf, mailConfigured } from "@/lib/mail";
import { getStore } from "@/lib/store";
import { CreateUserForm, EmailDomainForm, UserRowActions } from "./user-forms";

const dateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) : "—";

const isLocked = (lockedUntil?: string) => !!lockedUntil && Date.parse(lockedUntil) > Date.now();

export default async function UsersPage() {
  const { user: me, data } = await requireUser("users:manage");
  const users = (await data.users.list()).sort((a, b) => a.name.localeCompare(b.name));
  const agency = await getStore().agencies.get(me.agencyId);
  const shared = agencyMailbox();
  const domain = agency?.emailDomain;
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Users</h1>
      <section className="mb-6 rounded-lg border bg-white p-4 text-sm">
        <h2 className="mb-1 font-semibold">Company email</h2>
        <p className="mb-3 text-slate-600">
          Ezly sends only from company mailboxes. Create each employee&apos;s mailbox in Hostinger (Emails), then connect it below.
          Proposals come from the employee&apos;s company address; automatic emails and any overflow come from the shared company mailbox.
          Each mailbox is kept under {dailyLimit()} emails a day.
        </p>
        <EmailDomainForm current={domain ?? ""} />
        <p className="mt-3">
          Shared company mailbox:{" "}
          {mailConfigured() && shared ? (
            <b>{shared.address}</b>
          ) : (
            <span className="text-amber-700">not set up yet (added in the server settings during Hostinger setup)</span>
          )}
          {shared && domain && domainOf(shared.address) !== domain && <span className="ml-2 text-red-700">— not on {domain}; fix it in the server settings</span>}
        </p>
      </section>
      <div className="mb-6 overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              {["Name", "Role", "Status", "Two-step sign-in", "Company email", "Last sign-in", "Actions"].map((h) => (
                <th key={h} className="px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const locked = isLocked(u.lockedUntil);
              return (
                <tr key={u.id} className="border-t align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium">{u.name}{u.id === me.id && " (you)"}</div>
                    <div className="text-slate-500">{u.email}</div>
                  </td>
                  <td className="px-3 py-2">{ROLE_LABELS[u.role]}</td>
                  <td className="px-3 py-2">
                    {!u.active ? (
                      <span className="rounded bg-slate-200 px-2 py-0.5">Disabled</span>
                    ) : locked ? (
                      <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">Locked</span>
                    ) : u.mustChangePassword ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">Temporary password</span>
                    ) : (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-green-800">Active</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{u.mfaConfirmedAt ? `On · ${u.recoveryCodeHashes.length} recovery codes left` : "Not set up yet"}</td>
                  <td className="px-3 py-2">
                    {u.mailboxVerifiedAt ? (
                      <span className="text-emerald-700">✓ {u.mailboxAddress}</span>
                    ) : (
                      <span className="text-slate-500">Not connected — sends from the shared mailbox</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{dateTime(u.lastLoginAt)}</td>
                  <td className="px-3 py-2">
                    <UserRowActions
                      self={u.id === me.id}
                      userId={u.id}
                      role={u.role}
                      active={u.active}
                      locked={locked}
                      hasMfa={!!u.mfaConfirmedAt}
                      mailbox={u.mailboxVerifiedAt ? u.mailboxAddress : undefined}
                      suggestedMailbox={domain && domainOf(u.email) === domain ? u.email : domain ? `@${domain}` : ""}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <CreateUserForm />
    </>
  );
}
