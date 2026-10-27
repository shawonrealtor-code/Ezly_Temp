"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AccountTabs({ base, counts }: { base: string; counts: { activity: number } }) {
  const pathname = usePathname();
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/details`, label: "Details" },
    { href: `${base}/lead`, label: "Lead info" },
    { href: `${base}/activity`, label: "Activity", count: counts.activity },
  ];
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Client sections">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 font-semibold ${active ? "border-blue-700 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {t.label}
            {t.count ? <span className="ml-1.5 rounded-full bg-slate-100 px-2 text-xs text-slate-600">{t.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
