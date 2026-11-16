"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { WhatsAppButton } from "@/components/layout/whatsapp-button";
import { TestDataNotice } from "@/components/layout/test-data-notice";
import type { PublicSiteSettings } from "@/lib/public-settings";

type LogoUrls = { light?: string; dark?: string };

const FORM_ROUTES = ["/umrah", "/track", "/contact", "/flights", "/ferries", "/flight-booking", "/hotels", "/account"];
const FORM_ROUTE_PREFIXES = ["/visas/", "/services/", "/account/"];

export function isFormRoute(pathname: string) {
  return FORM_ROUTES.includes(pathname) || FORM_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function SiteChrome({ children, logoUrls, publicSettings, testData = null }: { children: React.ReactNode; logoUrls: LogoUrls; publicSettings: PublicSiteSettings; testData?: boolean | null }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  // On pages whose main content is a form, the floating button covered
  // fields and the form's own «التالي»/«إرسال» buttons on phones. Those pages
  // keep WhatsApp in the header menu, the footer and (where present) inline,
  // so the floating one is left to larger screens there.
  const bookingForm = isFormRoute(pathname);

  if (isAdmin) return <>{children}</>;

  return <>
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-[100] focus:rounded-full focus:bg-primary focus:px-5 focus:py-3 focus:text-primary-foreground">تخطَّ إلى المحتوى الرئيسي</a>
    <TestDataNotice audience="customer" initial={testData} />
    <SiteHeader logoUrls={logoUrls} contactPhone={publicSettings.phone} />
    <main id="main-content" tabIndex={-1} className="flex-1">{children}</main>
    <SiteFooter logoUrls={logoUrls} publicSettings={publicSettings} />
    <WhatsAppButton whatsapp={publicSettings.whatsapp} hideOnPhones={bookingForm} />
  </>;
}
