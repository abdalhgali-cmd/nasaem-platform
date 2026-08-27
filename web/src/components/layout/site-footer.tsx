import Link from "next/link";
import {
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Clock,
  BadgeCheck,
} from "lucide-react";
import { Container } from "@/components/container";
import { Logo } from "@/components/logo";
import { mainNav, siteConfig } from "@/lib/site-config";
import type { PublicSiteSettings } from "@/lib/public-settings";

const serviceLinks = [
  { label: "باقات العمرة", href: "/umrah" },
  { label: "تأشيرات الزيارة والعمل", href: "/visas" },
  { label: "حجز تذاكر الطيران", href: "/flights" },
  { label: "حجز الفنادق", href: "/hotels" },
  { label: "باقات السفر الشاملة", href: "/packages" },
];

const trustBadges = [
  { icon: ShieldCheck, label: "معلومات واضحة قبل اعتماد العرض" },
  { icon: Clock, label: "متابعة للطلب خطوة بخطوة" },
  { icon: BadgeCheck, label: "تواصل مباشر مع الفريق" },
];

const legalLinks = [
  { label: "سياسة الخصوصية", href: "/privacy" },
  { label: "الشروط والأحكام", href: "/terms" },
  { label: "سياسة الإلغاء", href: "/cancellation" },
  { label: "سياسة الاسترداد", href: "/refund" },
  { label: "معلومات الدفع", href: "/payment-information" },
];

// lucide-react dropped brand/logo icons (trademark reasons), so social links
// use plain text monograms instead of guessing at reproduced logo glyphs.

export function SiteFooter({
  logoUrls,
  publicSettings,
}: {
  logoUrls?: { light?: string; dark?: string };
  publicSettings?: PublicSiteSettings;
}) {
  const phone = publicSettings?.phone ?? siteConfig.phone;
  const email = publicSettings?.email ?? siteConfig.email;
  const address = publicSettings?.address ?? siteConfig.address;
  const socialLinks = [
    { mark: "f", href: publicSettings?.social.facebook ?? siteConfig.social.facebook, label: "فيسبوك" },
    { mark: "IG", href: publicSettings?.social.instagram ?? siteConfig.social.instagram, label: "إنستغرام" },
    { mark: "X", href: publicSettings?.social.twitter ?? siteConfig.social.twitter, label: "إكس" },
  ].filter((item) => item.href);

  return (
    <footer className="border-t border-border bg-section text-foreground">
      <Container className="grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <Logo urls={logoUrls} />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted-foreground">
            {publicSettings?.seoDescription || siteConfig.description}
          </p>
          {socialLinks.length > 0 ? (
            <div className="mt-6 flex items-center gap-3">
              {socialLinks.map(({ mark, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-xs font-bold text-foreground/70 transition hover:border-primary hover:text-primary"
                >
                  {mark}
                </a>
              ))}
            </div>
          ) : null}
        </div>

        <nav aria-label="روابط سريعة">
          <h3 className="text-sm font-bold text-foreground">روابط سريعة</h3>
          <ul className="mt-4 space-y-3">
            {mainNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-sm text-muted-foreground transition hover:text-primary"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="خدماتنا">
          <h3 className="text-sm font-bold text-foreground">خدماتنا</h3>
          <ul className="mt-4 space-y-3">
            {serviceLinks.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-sm text-muted-foreground transition hover:text-primary"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h3 className="text-sm font-bold text-foreground">تواصل معنا</h3>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
              <span>
                {address}
                <br />
                فروعنا: {siteConfig.branches.join(" • ")}
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <Phone className="size-4 shrink-0 text-accent" />
              <a href={`tel:${phone.replace(/\s/g, "")}`} dir="ltr" className="hover:text-primary">
                {phone}
              </a>
            </li>
            <li className="flex items-center gap-2.5">
              <Mail className="size-4 shrink-0 text-accent" />
              <a href={`mailto:${email}`} className="hover:text-primary">
                {email}
              </a>
            </li>
          </ul>
        </div>
      </Container>

      <div className="border-t border-border">
        <Container className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 py-6">
          {trustBadges.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Icon className="size-4 text-primary dark:text-secondary" />
              {label}
            </div>
          ))}
        </Container>
      </div>

      <div className="border-t border-border bg-background/40">
        <Container className="flex flex-col items-center justify-between gap-3 py-6 text-xs text-muted-foreground sm:flex-row">
          <p>
            © {new Date().getFullYear()} {siteConfig.name}. جميع الحقوق محفوظة.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:justify-end">
            {legalLinks.map((item) => (
              <Link key={item.href} href={item.href} className="font-medium underline-offset-4 hover:text-primary hover:underline">
                {item.label}
              </Link>
            ))}
            <p className="font-medium">{siteConfig.nameEn}</p>
          </div>
        </Container>
      </div>
    </footer>
  );
}
