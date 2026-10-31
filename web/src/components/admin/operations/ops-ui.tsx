import * as React from "react";
import Link from "next/link";
import { AlertCircle, ChevronLeft, Clock3, Hourglass } from "lucide-react";
import type { Level, Signal } from "./ops-model";

// Admin-styled controls for the Operations Center (the shared ui/Button is
// the public website's pill style and is left untouched).
export const btn = {
  base: "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  primary: "bg-primary text-primary-foreground shadow-sm hover:bg-[var(--nh-navy-600)]",
  secondary: "border border-[var(--nh-line-strong)] bg-card text-foreground shadow-sm hover:border-[var(--nh-navy-200)] hover:bg-[var(--nh-primary-soft)] hover:text-[var(--nh-primary-ink)]",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  md: "h-10 px-4 text-sm",
  sm: "h-9 px-3 text-[13px]",
};
export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

const LEVEL_STYLE: Record<Level, string> = {
  late: "bg-[var(--nh-danger)] text-white",
  warn: "bg-[var(--nh-warning-soft)] text-[var(--nh-warning-ink)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--nh-warning)_45%,transparent)]",
  wait: "bg-muted text-[var(--nh-ink-secondary)]",
  normal: "bg-muted text-muted-foreground",
};
const LEVEL_ICON: Record<Level, React.ComponentType<{ className?: string }> | null> = { late: AlertCircle, warn: Clock3, wait: Hourglass, normal: null };

export function SignalBadge({ signal }: { signal: Signal }) {
  const Icon = LEVEL_ICON[signal.level];
  return (
    <span className={cx("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-bold", LEVEL_STYLE[signal.level])}>
      {Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
      {signal.label}
    </span>
  );
}

export function ServiceTag({ kind, fallback }: { kind: "egypt" | "umrah" | null; fallback?: string }) {
  if (kind === "egypt") return <span className="inline-flex h-6 items-center rounded-md bg-[var(--nh-nile-soft)] px-2 text-xs font-bold text-[var(--nh-nile-ink)]">الموافقة الأمنية</span>;
  if (kind === "umrah") return <span className="inline-flex h-6 items-center rounded-md bg-[var(--nh-gold-50)] px-2 text-xs font-bold text-[var(--nh-gold-700)] ring-1 ring-inset ring-[var(--nh-gold-100)]">عمرة</span>;
  return fallback ? <span className="text-xs text-muted-foreground">{fallback}</span> : null;
}

export function Card({ title, icon, aside, children, id, className }: { title: string; icon?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; id?: string; className?: string }) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={cx("min-w-0 rounded-[14px] border border-border bg-card shadow-sm", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 id={headingId} className="flex items-center gap-2 text-base font-extrabold">{icon}{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function ViewAll({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className={cx(btn.base, btn.ghost, btn.sm)}>{children}<ChevronLeft aria-hidden="true" /></Link>;
}

export function Notice({ tone, children }: { tone: "error" | "success" | "info"; children: React.ReactNode }) {
  const style = tone === "error"
    ? "border-destructive/20 bg-destructive/5 text-destructive"
    : tone === "success"
      ? "border-[color-mix(in_srgb,var(--nh-success)_25%,transparent)] bg-[var(--nh-success-soft)] text-[var(--nh-success-ink)]"
      : "border-border bg-muted text-muted-foreground";
  return <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-[14px] border p-4 text-sm font-bold", style)}>{children}</div>;
}

export function Avatar({ name, tone = "navy" }: { name: string; tone?: "navy" | "gold" | "warn" }) {
  const style = tone === "gold" ? "bg-[var(--nh-gold-100)] text-[var(--nh-gold-700)]" : tone === "warn" ? "bg-[var(--nh-warning-soft)] text-[var(--nh-warning-ink)]" : "bg-[var(--nh-navy-100)] text-[var(--nh-primary-ink)]";
  return <span aria-hidden="true" className={cx("flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold", style)}>{name.trim().charAt(0) || "؟"}</span>;
}
