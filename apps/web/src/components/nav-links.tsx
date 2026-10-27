"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

export function NavLinks({ items, variant }: { items: NavItem[]; variant: "sidebar" | "bar" }) {
  const pathname = usePathname();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  if (variant === "bar") {
    return (
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
        {items.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium ${active(n.href) ? "bg-blue-50 text-blue-700" : "text-slate-600"}`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav className="flex flex-col gap-1">
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={active(n.href) ? "page" : undefined}
          className={`flex items-center gap-3 rounded-lg px-2.5 py-2 font-medium ${active(n.href) ? "bg-[#1c2a47] text-white" : "text-[#b6c0d4] hover:bg-[#162238] hover:text-white"}`}
        >
          <Icon name={n.icon} />
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
