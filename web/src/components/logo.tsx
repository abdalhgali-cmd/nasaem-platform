import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const LOGO_CLASS =
  "h-11 w-auto shrink-0 transition-transform duration-300 group-hover:scale-[1.03] sm:h-[3.25rem]";

const LOGO_ALT = "نسائم الحرمين للسفر والسياحة";

// The bundled artwork, cropped to the mark itself (public/logo*.png keep a
// wide transparent margin, which made the header logo read as a small icon).
const BUNDLED = { light: "/brand/logo-wide.png", dark: "/brand/logo-wide-dark.png" } as const;

export function Logo({
  className,
  urls,
  tone = "auto",
}: {
  className?: string;
  /** Staff-uploaded replacements from the back-office (see
   * src/lib/site-assets.ts); falls back to the bundled defaults below when
   * not set. Served from the backend, so plain <img> — next/image's
   * optimizer only handles local files or hosts listed in remotePatterns. */
  urls?: { light?: string; dark?: string };
  /** "auto" follows the theme; "dark" always shows the variant made for dark
   * surfaces (the footer is navy in both themes). */
  tone?: "auto" | "dark";
}) {
  const showLight = tone === "auto";
  const lightClass = cn(LOGO_CLASS, "block dark:hidden");
  const darkClass = cn(LOGO_CLASS, showLight ? "hidden dark:block" : "block");

  return (
    <Link
      href="/"
      className={cn("group flex items-center rounded-xl outline-none", className)}
      aria-label={`${LOGO_ALT} — الصفحة الرئيسية`}
    >
      {/* Two color variants swapped by theme, not filters: the logo's navy
          wordmark reads fine on light surfaces but loses contrast against
          dark ones, so the dark variant has that text recolored to white
          (icon artwork unchanged in both). */}
      {!showLight ? null : urls?.light ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urls.light} alt={LOGO_ALT} className={lightClass} />
      ) : (
        <Image src={BUNDLED.light} alt={LOGO_ALT} width={720} height={296} priority className={lightClass} />
      )}
      {urls?.dark ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urls.dark} alt={LOGO_ALT} className={darkClass} />
      ) : (
        <Image src={BUNDLED.dark} alt={LOGO_ALT} width={720} height={296} priority className={darkClass} />
      )}
    </Link>
  );
}
