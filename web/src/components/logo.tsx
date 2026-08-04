import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "group flex items-center gap-3 rounded-full outline-none",
        className
      )}
      aria-label="نسائم الحرمين للسفر والسياحة — الصفحة الرئيسية"
    >
      <span className="relative flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-secondary to-primary text-lg font-black text-white shadow-lg shadow-primary/30 transition-transform duration-300 group-hover:scale-105">
        <span className="absolute inset-0 rounded-2xl border border-accent/60" />
        ن
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-base font-extrabold text-foreground sm:text-lg">
          نسائم الحرمين
        </span>
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground">
          للسفر والسياحة
        </span>
      </span>
    </Link>
  );
}
