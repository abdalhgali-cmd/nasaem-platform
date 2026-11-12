import Link from "next/link";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarCheck,
  Globe2,
  Package,
  Plane,
  Ship,
  Sparkles,
  Stamp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { FadeIn, Stagger } from "@/components/motion/fade-in";
import { getSiteAssetUrls } from "@/lib/site-assets";
import { getPublicServices, type PublicService } from "@/lib/services";
import { resolveHomepageIcon } from "@/lib/homepage-icons";
import { resolveServiceHref } from "@/lib/service-routes";
import { isActiveServiceRoute } from "@/lib/active-services";
import { formatPrice, formatSdgEquivalent, hasPublishedPrice } from "@/lib/price";

type DisplayService = PublicService & { icon: LucideIcon; href: string; imageUrl?: string; fallbackDescription: string };

// What a card shows when the agency has not set an icon or a description for
// the service yet: an icon and one plain line that fit its category, so the
// directory does not read as a wall of identical boxes. An icon or a
// description set in the back-office always wins.
const CATEGORY_DEFAULTS: Record<string, { icon: LucideIcon; description: string }> = {
  umrah: { icon: Sparkles, description: "باقات العمرة، بيانات المعتمرين ومستنداتهم، والدفع بالسعر المعتمد." },
  egypt_clearance: { icon: Stamp, description: "الموافقة الأمنية لدخول مصر، جوًا أو برًا، مع متابعة الطلب." },
  flight: { icon: Plane, description: "حدّد خط الرحلة والمسافرين، ثم راجع العرض قبل اعتماد الحجز." },
  ferry: { icon: Ship, description: "اختر المسار والتاريخ وعدد المسافرين لمراجعة التوفر." },
  family_visit: { icon: Users, description: "تأشيرة الزيارة العائلية: المتطلبات، المستندات وخطوات التقديم." },
  work_visa: { icon: BriefcaseBusiness, description: "تأشيرة العمل: العقد والمستندات المطلوبة وخطوات التقديم." },
  intl_visa: { icon: Globe2, description: "تأشيرات الوجهات الدولية حسب الوجهة وبلد التقديم." },
  tasheel: { icon: CalendarCheck, description: "حجز موعد لدى مركز تساهيل ومتابعته مع الفريق." },
};
const GENERIC_DEFAULT = { icon: Package, description: "افتح صفحة الخدمة لمعرفة المتطلبات وخطوات الطلب." };

export async function Services({ limit, showAllLink = false }: { limit?: number; showAllLink?: boolean } = {}) {
  const [allServices, assetUrls] = await Promise.all([getPublicServices(), getSiteAssetUrls()]);
  // The homepage's primary services grid is meant to be the small set of
  // top-level entry points (عمرة، فنادق، تأشيرة عمل، ...) a first-time
  // customer scans in seconds — not every priced package/tier underneath
  // one of them (e.g. Umrah's 3 SVC-UMRAH-* sub-packages, seeded under
  // category "package"). Those already get their own presentation via
  // FeaturedUmrah and each package's own page; listing them again here
  // turned this into an 11+ card wall duplicating what's below it.
  const services = allServices.filter(
    (service) =>
      service.category !== "package" &&
      service.category !== "UMRAH_PACKAGE" &&
      !service.code.startsWith("SVC-UMRAH-") &&
      // Only the approved customer services (Umrah, Egypt security approval).
      isActiveServiceRoute(resolveServiceHref(service))
  );
  const uniqueServices = Array.from(
    new Map(services.map((service) => [resolveServiceHref(service), service])).values()
  );
  const displayServices: DisplayService[] = uniqueServices.slice(0, limit).map((service) => {
    const defaults = CATEGORY_DEFAULTS[service.category.toLowerCase()] ?? GENERIC_DEFAULT;
    return {
      ...service,
      icon: resolveHomepageIcon(service.iconKey, defaults.icon),
      fallbackDescription: defaults.description,
      href: resolveServiceHref(service),
      imageUrl: service.imageKey ? assetUrls[service.imageKey] : undefined,
    };
  });

  return (
    <section id="services" className="scroll-mt-24 bg-section py-16 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="خدماتنا"
          title="كل ما تحتاجه لرحلتك في مكان واحد"
          description="استعرض الخدمات المتاحة حاليًا من كتالوج نسائم الحرمين، ثم اختر المسار المناسب لطلبك."
        />

        {displayServices.length === 0 ? (
          <div className="mt-14 rounded-3xl border border-border bg-card p-10 text-center">
            <BriefcaseBusiness className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
            <p className="mt-4 font-bold">لا توجد خدمات متاحة حاليًا</p>
            <p className="mt-2 text-sm text-muted-foreground">سيظهر الكتالوج هنا فور تفعيل الخدمات من لوحة الإدارة.</p>
          </div>
        ) : (
          <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {displayServices.map((service, index) => {
              const ServiceIcon = service.icon;
              return (
                <FadeIn key={service.id} delay={index * 0.05} className="h-full">
                  <Link
                    href={service.href}
                    className="group flex h-full flex-col rounded-3xl border border-border bg-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-accent/60 hover:shadow-card-hover motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-7"
                  >
                    {service.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- backend-hosted, dynamic key, not in next.config's remotePatterns.
                      <img src={service.imageUrl} alt={service.name} className="h-32 w-full rounded-2xl object-cover" />
                    ) : (
                      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/[0.07] text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground dark:bg-secondary/10 dark:text-secondary">
                        <ServiceIcon className="size-6 stroke-[1.8]" aria-hidden="true" />
                      </span>
                    )}
                    <h3 className="mt-5 text-lg font-extrabold text-foreground">{service.name}</h3>
                    <p className="mt-2 flex-1 text-sm leading-7 text-muted-foreground">{service.description || service.fallbackDescription}</p>
                    {service.pricingMode === "FIXED" && hasPublishedPrice(service.basePrice) ? (
                      <>
                        <p className="mt-3 text-sm font-extrabold text-primary dark:text-secondary" dir="ltr">
                          {formatPrice(service.basePrice, service.currency)}
                        </p>
                        {formatSdgEquivalent(service.priceSdg) ? (
                          <p className="text-xs text-muted-foreground">{formatSdgEquivalent(service.priceSdg)}</p>
                        ) : null}
                      </>
                    ) : service.pricingMode === "FIXED" ? (
                      <p className="mt-3 text-sm font-extrabold text-destructive">غير متاح للحجز</p>
                    ) : (
                      <p className="mt-4 inline-flex w-fit rounded-full bg-section px-3 py-1 text-xs font-bold text-muted-foreground">السعر بعد مراجعة الطلب</p>
                    )}
                    <span className="mt-5 inline-flex items-center gap-1.5 border-t border-border pt-4 text-sm font-bold text-primary dark:text-secondary">
                      اعرف المزيد
                      <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1" />
                    </span>
                  </Link>
                </FadeIn>
              );
            })}
          </Stagger>
        )}

        {showAllLink && uniqueServices.length > displayServices.length ? (
          <div className="mt-10 text-center">
            <Link
              href="/services"
              className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card px-6 py-3 text-sm font-bold text-primary transition hover:border-primary hover:bg-primary/5 dark:text-secondary"
            >
              عرض كل الخدمات
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
          </div>
        ) : null}
      </Container>
    </section>
  );
}
