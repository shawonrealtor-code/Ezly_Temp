import Link from "next/link";
import { ROLE_LABELS, type Permission } from "@ezly/auth";
import { initials } from "@ezly/core";
import { Icon, type IconName } from "@/components/icons";
import { NavLinks } from "@/components/nav-links";
import { buttonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { signOutAction } from "../(public)/actions";

const NAV: { href: string; label: string; icon: IconName; permission: Permission }[] = [
  { href: "/", label: "Dashboard", icon: "dashboard", permission: "dashboard:view" },
  { href: "/accounts", label: "Clients", icon: "accounts", permission: "accounts:read" },
  { href: "/quotes", label: "Quotes", icon: "quotes", permission: "accounts:read" },
  { href: "/settings/users", label: "Users", icon: "users", permission: "users:manage" },
  { href: "/activity", label: "Activity log", icon: "activity", permission: "audit:read" },
];

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Display only; each page enforces its own access with requireUser().
  const { user, can } = await requireUser(undefined, { allowPasswordChange: true });
  const agency = await getStore().agencies.get(user.agencyId);
  const items = user.mustChangePassword ? [] : NAV.filter((n) => can(n.permission)).map(({ href, label, icon }) => ({ href, label, icon }));

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-[232px] shrink-0 flex-col gap-1 bg-[#0f1a2e] px-3 py-4 text-[#b6c0d4] md:flex">
        <Link href="/" className="flex items-center gap-2.5 px-2 pb-4 text-lg font-bold text-white">
          <span className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-gradient-to-br from-[#4f7cff] to-[#2f54eb]">E</span>
          Ezly
        </Link>
        {agency && (
          <div className="mx-1 mb-3 rounded-lg bg-[#1c2a47] p-2.5 text-xs">
            <b className="block text-[13px] text-white">{agency.name}</b>
            {agency.states.length > 0 ? `Personal lines · ${agency.states.join(", ")}` : "Personal lines"}
          </div>
        )}
        <NavLinks items={items} variant="sidebar" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white">
          <div className="flex h-[60px] items-center gap-3 px-4 md:px-6">
            <Link href="/" className="font-bold md:hidden">Ezly</Link>
            {can("accounts:read") && !user.mustChangePassword && (
              <form action="/accounts" className="flex max-w-[520px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-400 focus-within:border-blue-600">
                <Icon name="search" />
                <input
                  name="q"
                  type="search"
                  placeholder="Search clients, phone, email, ZIP…"
                  aria-label="Search clients"
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
              </form>
            )}
            <div className="ml-auto flex items-center gap-2">
              {can("accounts:write") && !user.mustChangePassword && (
                <Link href="/accounts/new" className={`${buttonClass("primary", "sm")} hidden sm:inline-flex`}>
                  <Icon name="plus" className="h-4 w-4" /> New client
                </Link>
              )}
              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-1 py-1 hover:bg-slate-50">
                  <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-blue-100 text-[13px] font-semibold text-blue-700">
                    {initials(user.name)}
                  </span>
                  <span className="hidden text-left text-sm leading-tight lg:block">
                    {user.name}
                    <span className="block text-xs text-slate-500">{ROLE_LABELS[user.role]}</span>
                  </span>
                </summary>
                <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-lg">
                  <Link href="/account/password" className="flex items-center gap-2 rounded px-3 py-2 hover:bg-slate-50">
                    <Icon name="key" className="h-4 w-4" /> Change password
                  </Link>
                  <form action={signOutAction}>
                    <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-slate-50">
                      <Icon name="logout" className="h-4 w-4" /> Sign out
                    </button>
                  </form>
                </div>
              </details>
            </div>
          </div>
          <NavLinks items={items} variant="bar" />
        </header>
        <main className="w-full flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
