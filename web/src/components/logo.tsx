import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "group flex items-center rounded-full outline-none",
        className
      )}
      aria-label="نسائم الحرمين للسفر والسياحة — الصفحة الرئيسية"
    >
      {/* Two color variants swapped by theme, not filters: the logo's navy
          wordmark reads fine on light surfaces but loses contrast against
          the dark theme's near-black background, so logo-dark.png has that
          text recolored to white (icon artwork unchanged in both). */}
      <Image
        src="/logo.png"
        alt="نسائم الحرمين للسفر والسياحة"
        width={1536}
        height={1024}
        priority
        className="block h-11 w-auto shrink-0 transition-transform duration-300 group-hover:scale-105 sm:h-12 dark:hidden"
      />
      <Image
        src="/logo-dark.png"
        alt="نسائم الحرمين للسفر والسياحة"
        width={1536}
        height={1024}
        priority
        className="hidden h-11 w-auto shrink-0 transition-transform duration-300 group-hover:scale-105 sm:h-12 dark:block"
      />
    </Link>
  );
}
