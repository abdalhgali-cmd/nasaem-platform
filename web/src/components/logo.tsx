import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const LOGO_CLASS =
  "h-11 w-auto shrink-0 transition-transform duration-300 group-hover:scale-105 sm:h-12";

const LOGO_ALT = "نسائم الحرمين للسفر والسياحة";

export function Logo({
  className,
  urls,
}: {
  className?: string;
  /** Staff-uploaded replacements from the back-office (see
   * src/lib/site-assets.ts); falls back to the bundled defaults below when
   * not set. Served from the backend, so plain <img> — next/image's
   * optimizer only handles local files or hosts listed in remotePatterns. */
  urls?: { light?: string; dark?: string };
}) {
  return (
    <Link
      href="/"
      className={cn(
        "group flex items-center rounded-full outline-none",
        className
      )}
      aria-label={`${LOGO_ALT} — الصفحة الرئيسية`}
    >
      {/* Two color variants swapped by theme, not filters: the logo's navy
          wordmark reads fine on light surfaces but loses contrast against
          the dark theme's near-black background, so the dark variant has
          that text recolored to white (icon artwork unchanged in both). */}
      {urls?.light ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urls.light} alt={LOGO_ALT} className={cn(LOGO_CLASS, "block dark:hidden")} />
      ) : (
        <Image
          src="/logo.png"
          alt={LOGO_ALT}
          width={1536}
          height={1024}
          priority
          className={cn(LOGO_CLASS, "block dark:hidden")}
        />
      )}
      {urls?.dark ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urls.dark} alt={LOGO_ALT} className={cn(LOGO_CLASS, "hidden dark:block")} />
      ) : (
        <Image
          src="/logo-dark.png"
          alt={LOGO_ALT}
          width={1536}
          height={1024}
          priority
          className={cn(LOGO_CLASS, "hidden dark:block")}
        />
      )}
    </Link>
  );
}
