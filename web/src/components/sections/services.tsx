import Link from "next/link";
import { ArrowLeft, BriefcaseBusiness, type LucideIcon } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { FadeIn, Stagger } from "@/components/motion/fade-in";
import { getSiteAssetUrls } from "@/lib/site-assets";
import { getPublicServices, type PublicService } from "@/lib/services";
import { resolveHomepageIcon } from "@/lib/homepage-icons";
import { resolveServiceHref } from "@/lib/service-routes";

type DisplayService = PublicService & { icon: LucideIcon; href: string; imageUrl?: string };

export async function Services() {
  const [services, assetUrls] = await Promise.all([getPublicServices(), getSiteAssetUrls()]);
  const displayServices: DisplayService[] = services.map((service) => ({
    ...service,
    icon: resolveHomepageIcon(service.iconKey),
    href: resolveServiceHref(service),
    imageUrl: service.imageKey ? assetUrls[service.imageKey] : undefined,
  }));

  return (
    <section id="services" className="scroll-mt-24 bg-section py-24">
      <Container>
        <SectionHeading
          eyebrow="خدماتنا"
          title="كل ما تحتاجه لرحلتك في مكان واحد"
          description="اختر الخدمة التي تحتاجها، واطّلع على تفاصيلها وخطوات تقديم الطلب."
        />

        {displayServices.length === 0 ? (
          <div className="mt-14 rounded-3xl border border-border bg-card p-10 text-center">
            <BriefcaseBusiness className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
            <p className="mt-4 font-bold">الخدمات غير ظاهرة الآن</p>
            <p className="mt-2 text-sm text-muted-foreground">تواصل معنا وسنساعدك في معرفة التفاصيل وتقديم طلبك.</p>
            <Link href="/contact" className="mt-5 inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-4">تواصل مع نسائم الحرمين</Link>
          </div>
        ) : (
          <Stagger className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {displayServices.map((service, index) => {
              const ServiceIcon = service.icon;
              return (
                <FadeIn key={service.id} delay={index * 0.05} className="h-full">
                  <Link
                    href={service.href}
                    className="group flex h-full flex-col rounded-3xl border border-border bg-card p-7 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10"
                  >
                    {service.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- backend-hosted, dynamic key, not in next.config's remotePatterns.
                      <img src={service.imageUrl} alt={service.name} className="h-32 w-full rounded-2xl object-cover" />
                    ) : (
                      <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 transition-transform duration-300 group-hover:scale-105">
                        <ServiceIcon className="size-10 stroke-[1.7] text-primary" aria-hidden="true" />
                      </span>
                    )}
                    <h3 className="mt-5 text-lg font-bold text-foreground">{service.name}</h3>
                    <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted-foreground">{service.description || "تفاصيل الخدمة وخطوات طلبها متاحة عبر فريق NASAEM."}</p>
                    <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-primary dark:text-secondary">
                      تفاصيل الخدمة والتقديم
                      <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1" />
                    </span>
                  </Link>
                </FadeIn>
              );
            })}
          </Stagger>
        )}
      </Container>
    </section>
  );
}
