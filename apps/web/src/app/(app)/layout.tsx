import Link from "next/link";
import { ROLE_LABELS, type Permission } from "@ezly/auth";
import { requireUser } from "@/lib/auth";
import { signOutAction } from "../(public)/actions";

const NAV: { href: string; label: string; permission: Permission }[] = [
  { href: "/", label: "Dashboard", permission: "dashboard:view" },
  { href: "/accounts", label: "Accounts", permission: "accounts:read" },
  { href: "/rater", label: "Quote Rater", permission: "quotes:run" },
  { href: "/settings/users", label: "Users", permission: "users:manage" },
  { href: "/activity", label: "Activity log", permission: "audit:read" },
];

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Display only; each page enforces its own access with requireUser().
  const { user, can } = await requireUser(undefined, { allowPasswordChange: true });
  return (
    <>
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-slate-800 px-4 py-3 text-white">
        <span className="font-semibold">Ezly</span>
        {!user.mustChangePassword && (
          <nav className="flex flex-wrap gap-4 text-sm">
            {NAV.filter((n) => can(n.permission)).map((n) => (
              <Link key={n.href} href={n.href} className="hover:underline">
                {n.label}
              </Link>
            ))}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span>
            {user.name} <span className="text-slate-300">· {ROLE_LABELS[user.role]}</span>
          </span>
          <Link href="/account/password" className="hover:underline">
            Change password
          </Link>
          <form action={signOutAction}>
            <button className="rounded border border-slate-500 px-2 py-1 hover:bg-slate-700">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4">{children}</main>
    </>
  );
}
