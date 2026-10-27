import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Icon, type IconName } from "./icons";

// Shared building blocks styled after docs/mockups.

export function PageHeader({ title, subtitle, actions, crumbs }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; crumbs?: { href: string; label: string }[] }) {
  return (
    <div className="mb-5">
      {crumbs && (
        <nav className="mb-2 text-sm text-slate-500">
          {crumbs.map((c) => (
            <span key={c.href}>
              <Link href={c.href} className="text-blue-700 hover:underline">{c.label}</Link> /{" "}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="ml-auto flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[10px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,.05)] ${className}`}>{children}</section>;
}

export function CardHeader({ title, icon, action }: { title: ReactNode; icon?: IconName; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 px-[18px] py-3.5">
      {icon && <Icon name={icon} className="h-[18px] w-[18px] text-slate-500" />}
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {action && <div className="ml-auto text-sm font-semibold">{action}</div>}
    </div>
  );
}

const TONES = {
  blue: "bg-blue-50 text-blue-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  gray: "bg-slate-100 text-slate-600",
  violet: "bg-violet-50 text-violet-700",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "gray", dot = true, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export const LEAD_STATUS: Record<string, { label: string; tone: Tone }> = {
  NEW: { label: "New lead", tone: "amber" },
  CONTACTED: { label: "Contacted", tone: "blue" },
  QUOTED: { label: "Quoted", tone: "violet" },
  SOLD: { label: "Customer", tone: "green" },
  LOST: { label: "Lost", tone: "red" },
};

export const LOB_LABELS: Record<string, string> = { auto: "Auto", home: "Home", dwelling_fire: "Dwelling Fire" };

const BUTTON = {
  primary: "border-blue-700 bg-blue-700 text-white hover:bg-blue-800",
  secondary: "border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
  danger: "border-red-200 bg-white text-red-700 hover:bg-red-50",
  ghost: "border-transparent bg-transparent text-blue-700 hover:bg-blue-50",
};
export const buttonClass = (variant: keyof typeof BUTTON = "secondary", size: "sm" | "md" = "md") =>
  `inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border font-semibold shadow-[0_1px_2px_rgba(16,24,40,.05)] disabled:cursor-not-allowed disabled:opacity-50 ${
    size === "sm" ? "px-2.5 py-1 text-[13px]" : "px-3.5 py-2 text-sm"
  } ${BUTTON[variant]}`;

export function ButtonLink({ href, variant, size, icon, children, ...rest }: { variant?: keyof typeof BUTTON; size?: "sm" | "md"; icon?: IconName } & ComponentProps<typeof Link>) {
  return (
    <Link href={href} className={buttonClass(variant, size)} {...rest}>
      {icon && <Icon name={icon} className="h-4 w-4" />}
      {children}
    </Link>
  );
}

export function Avatar({ text, tone = "blue", size = "md" }: { text: string; tone?: Tone; size?: "md" | "lg" }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-bold ${TONES[tone]} ${size === "lg" ? "h-16 w-16 text-xl" : "h-[34px] w-[34px] text-xs"}`}>
      {text}
    </span>
  );
}

const AVATAR_TONES: Tone[] = ["blue", "green", "amber", "violet", "red"];
/** Stable color per id, so a client keeps the same avatar color everywhere. */
export const toneFor = (id: string): Tone => AVATAR_TONES[parseInt(id.slice(0, 2), 16) % AVATAR_TONES.length];

export function EmptyState({ icon = "accounts", title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Icon name={icon} className="h-8 w-8 text-slate-400" />
      <p className="font-semibold">{title}</p>
      {children && <div className="text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export const dateFmt = (iso?: string, withTime = false) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleString("en-US", {
        timeZone: "America/New_York",
        dateStyle: "medium",
        ...(withTime ? { timeStyle: "short" } : {}),
      })
    : "—";

/** "3h ago", "2d ago", or a date for older times. */
export function timeAgo(iso: string, now: number): string {
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  if (minutes < 60 * 24 * 14) return `${Math.round(minutes / 1440)}d ago`;
  return dateFmt(iso);
}
