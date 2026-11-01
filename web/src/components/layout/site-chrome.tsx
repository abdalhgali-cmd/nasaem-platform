"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { WhatsAppButton } from "@/components/layout/whatsapp-button";
import type { PublicSiteSettings } from "@/lib/public-settings";

type LogoUrls = { light?: string; dark?: string };

export function SiteChrome({ children, logoUrls, publicSettings }: { children: React.ReactNode; logoUrls: LogoUrls; publicSettings: PublicSiteSettings }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  // On the Umrah and Egypt booking forms the floating button covered the
  // form's own «التالي»/«إرسال» buttons on phones; both pages carry an inline
  // WhatsApp link, so the floating one is left to larger screens there.
  const bookingForm = pathname === "/umrah" || pathname === "/visas/egypt-security-approval";

  if (isAdmin) return <>{children}</>;

  return <>
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-[100] focus:rounded-full focus:bg-primary focus:px-5 focus:py-3 focus:text-primary-foreground">تخطَّ إلى المحتوى الرئيسي</a>
    <SiteHeader logoUrls={logoUrls} contactPhone={publicSettings.phone} />
    <main id="main-content" className="flex-1">{children}</main>
    <SiteFooter logoUrls={logoUrls} publicSettings={publicSettings} />
    <WhatsAppButton whatsapp={publicSettings.whatsapp} hideOnPhones={bookingForm} />
  </>;
}
