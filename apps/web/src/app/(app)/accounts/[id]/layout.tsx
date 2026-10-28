import { digits, fullName, householdName, initials, primaryAddress, primaryPerson } from "@ezly/core";
import { Icon } from "@/components/icons";
import { Avatar, Badge, ButtonLink, LEAD_STATUS, PageHeader, dateFmt, toneFor } from "@/components/ui";
import { loadAccountPage } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { textTarget, textingEnabled } from "@/lib/texting";
import { AccountTabs } from "./account-tabs";

const external = { target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-1 text-blue-700 hover:underline" } as const;
const searchUrl = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

export default async function AccountLayout({ children, params }: LayoutProps<"/accounts/[id]">) {
  const { id } = await params;
  const { user, data, can } = await requireUser("accounts:read");
  const { account, activities, userName } = await loadAccountPage(data, id);
  const quoteCount = await data.applications.count((a) => a.accountId === id);
  const agency = await getStore().agencies.get(user.agencyId);
  const name = householdName(account.people);
  const person = primaryPerson(account.people)!;
  const address = primaryAddress(account.addresses);
  const phone = account.phones.find((p) => p.preferred) ?? account.phones[0];
  const email = account.emails.find((e) => e.preferred) ?? account.emails[0];
  const status = LEAD_STATUS[account.leadStatus];
  const textBody = `Hi ${person.firstName}, this is ${user.name.split(" ")[0]} from ${agency?.name ?? "your insurance agency"}.`;
  const canTextFromEzly = textingEnabled() && can("accounts:write") && "to" in textTarget(account);
  const addressLine = address ? `${address.line1}, ${address.city}, ${address.state} ${address.zip}` : "";

  return (
    <>
      <PageHeader crumbs={[{ href: "/accounts", label: "Clients" }]} title={name} />
      <div className="grid items-start gap-5 lg:grid-cols-[290px_1fr]">
        <aside className="rounded-[10px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,.05)]">
          <div className="flex flex-col items-center border-b border-slate-200 px-[18px] py-5 text-center">
            <Avatar text={initials(name)} tone={toneFor(account.id)} size="lg" />
            <h2 className="mt-2.5 text-lg font-bold">{name}</h2>
            <div className="mt-2 flex gap-1.5">
              <Badge tone={status.tone}>{status.label}</Badge>
              {account.vip && <Badge tone="amber" dot={false}>★ VIP</Badge>}
            </div>
            <div className="mt-3.5 flex gap-2">
              {phone && (
                <>
                  <a href={`tel:${digits(phone.number)}`} title="Call" aria-label="Call" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Icon name="phone" /></a>
                  {canTextFromEzly ? (
                    <a href={`/accounts/${id}/activity#text`} title="Send a text from Ezly" aria-label="Send a text from Ezly" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Icon name="message" /></a>
                  ) : (
                    <a href={`sms:${digits(phone.number)}?&body=${encodeURIComponent(textBody)}`} title="Text from my phone" aria-label="Text from my phone" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Icon name="message" /></a>
                  )}
                </>
              )}
              {email && <a href={`mailto:${email.address}`} title="Email" aria-label="Email" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Icon name="mail" /></a>}
              {can("accounts:write") && (
                <a href={`/accounts/${id}/activity`} title="Log a note or call" aria-label="Log a note or call" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Icon name="note" /></a>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2.5 border-b border-slate-200 px-[18px] py-3.5 text-sm">
            {phone && (
              <div className="flex gap-2.5"><Icon name="phone" className="mt-0.5 h-4 w-4 text-slate-400" /><div>{phone.number}<div className="text-xs text-slate-500">{phone.kind}{account.preferredContact ? ` · prefers ${account.preferredContact}` : ""}</div></div></div>
            )}
            {email && (
              <div className="flex gap-2.5"><Icon name="mail" className="mt-0.5 h-4 w-4 text-slate-400" /><div className="min-w-0 break-words">{email.address}<div className="text-xs text-slate-500">{email.kind} email</div></div></div>
            )}
            {address && (
              <div className="flex gap-2.5"><Icon name="pin" className="mt-0.5 h-4 w-4 text-slate-400" /><div>{address.line1}{address.unit ? `, ${address.unit}` : ""}<br />{address.city}, {address.state} {address.zip}{address.county && <div className="text-xs text-slate-500">{address.county} County</div>}</div></div>
            )}
            {address && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] font-medium">
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLine)}`} {...external}>Map <Icon name="external" className="h-3 w-3" /></a>
                <a href={searchUrl(`${addressLine} property records`)} {...external}>Property records <Icon name="external" className="h-3 w-3" /></a>
                {address.county && <a href={searchUrl(`${address.county} County ${address.state} property assessor`)} {...external}>County assessor <Icon name="external" className="h-3 w-3" /></a>}
              </div>
            )}
            {!phone && !email && !address && <p className="text-slate-500">No contact details yet.</p>}
          </div>
          <div className="flex flex-col gap-2 border-b border-slate-200 px-[18px] py-3.5 text-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Household</h3>
            {account.people.map((p) => (
              <div key={p.id}>
                {fullName(p)}
                <div className="text-xs text-slate-500">
                  {p.relationship === "primary" ? "Primary" : "Spouse / co-applicant"}
                  {p.dateOfBirth && ` · born ${p.dateOfBirth.slice(5, 7)}/${p.dateOfBirth.slice(0, 4)}`}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 px-[18px] py-3.5 text-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Agency</h3>
            <div>{account.producerId ? userName.get(account.producerId) : "Unassigned"}<div className="text-xs text-slate-500">Producer</div></div>
            <div>{account.csrId ? userName.get(account.csrId) : "Unassigned"}<div className="text-xs text-slate-500">CSR</div></div>
            <div>{account.leadSource ?? "—"} · since {dateFmt(account.customerSince ?? account.createdAt)}<div className="text-xs text-slate-500">Lead source</div></div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-3">
            {can("accounts:write") && (
              <div className="flex justify-end gap-2">
                <ButtonLink href={`/accounts/${id}/activity`} size="sm" icon="note">Log activity</ButtonLink>
                {can("quotes:run") && <ButtonLink href={`/accounts/${id}/quotes`} size="sm" icon="quotes">Quotes</ButtonLink>}
                <ButtonLink href={`/accounts/${id}/details`} size="sm" variant="primary" icon="note">Edit details</ButtonLink>
              </div>
            )}
            <AccountTabs base={`/accounts/${id}`} counts={{ activity: activities.length, quotes: quoteCount }} />
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
