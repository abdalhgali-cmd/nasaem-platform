import Link from "next/link";
import { ArrowLeft, Globe2, Hotel, Landmark, Package, Stamp, Plane, Ship, type LucideIcon } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { FadeIn, Stagger } from "@/components/motion/fade-in";
import { getPublicHomepage } from "@/lib/homepage";
import { resolveHomepageIcon } from "@/lib/homepage-icons";
import { getSiteAssetUrls } from "@/lib/site-assets";

const fallbackServices: {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
}[] = [
  {
    icon: Ship,
    title: "حجز البواخر",
    description: "احجز رحلتك البحرية بين سواكن وجدة، وحدد التاريخ وعدد المسافرين والناقل المفضل ليتابع فريقنا التوفر والإجراءات.",
    href: "/ferries",
  },
  {
    icon: Landmark,
    title: "باقات العمرة",
    description: "تأشيرة فقط أو باقة متكاملة تشمل الطيران والفنادق والنقل — بإشراف كامل من الإدارة حتى العودة.",
    href: "/umrah",
  },
  {
        icon: Stamp,
    title: "التأشيرات",
    description: "زيارة عائلية، تأشيرة عمل، أو تأشيرات دولية — نتابع إجراءاتك بدقة وسرعة حتى الاستلام.",
    href: "/visas",
  },
  {
    icon: Plane,
    title: "حجز الطيران",
    description: "أفضل أسعار تذاكر الطيران الداخلي والدولي على أشهر شركات الطيران، برحلة ذهاب أو ذهاب وعودة.",
    href: "/flights",
  },
  {
    icon: Hotel,
    title: "حجز الفنادق",
    description: "فنادق قريبة من الحرمين الشريفين وفي كل الوجهات، بمستويات مختلفة تناسب كل ميزانية.",
    href: "/hotels",
  },
  {
    icon: Globe2,
    title: "التأشيرات الدولية",
    description: "الصين، بالي، ودول أفريقيا — نوضح لك المستندات المطلوبة قبل بدء الإجراءات.",
    href: "/visas?visaCategory=INTERNATIONAL#book",
  },
  {
    icon: Package,
    title: "باقات السفر الشاملة",
    description: "برامج سياحية جاهزة تجمع الطيران والإقامة والجولات في باقة واحدة بسعر مريح.",
    href: "/packages",
  },
];

export async function Services() {
  const [{ sections }, assetUrls] = await Promise.all([getPublicHomepage(), getSiteAssetUrls()]);

  // Falls back to the bundled defaults when nothing's configured yet (a
  // fresh deploy before an admin — or the seed script — has populated any
  // HomepageSection rows), same resilience posture as site-assets/logo.tsx.
  const displayServices =
    sections.length > 0
      ? sections.map((section) => ({
          key: section.id,
          icon: resolveHomepageIcon(section.iconKey),
          title: section.title,
          description: section.description ?? "",
          href: section.href ?? "#",
          imageUrl: section.imageKey ? assetUrls[section.imageKey] : undefined,
        }))
      : fallbackServices.map((service) => ({ key: service.title, icon: service.icon, title: service.title, description: service.description, href: service.href, imageUrl: undefined }));

  return (
    <section className="bg-section py-24">
      <Container>
        <SectionHeading
          eyebrow="خدماتنا"
          title="كل ما تحتاجه لرحلتك في مكان واحد"
          description="من أول خطوة في التخطيط حتى العودة إلى الوطن، فريقنا يتولى كل التفاصيل نيابة عنك."
        />

        <Stagger className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {displayServices.map((service, index) => {
            const ServiceIcon = service.icon;
            return (
            <FadeIn key={service.key} delay={index * 0.05} className="h-full">
              <Link
                href={service.href}
                className="group flex h-full flex-col rounded-3xl border border-border bg-card p-7 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10"
              >
                {service.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- backend-hosted, dynamic key, not in next.config's remotePatterns (same reasoning as logo.tsx).
                  <img src={service.imageUrl} alt="" className="h-32 w-full rounded-2xl object-cover" />
                ) : (
                  <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 transition-transform duration-300 group-hover:scale-105">
                    <ServiceIcon className="size-10 stroke-[1.7] text-primary" aria-hidden="true" />
                  </span>
                )}
                <h3 className="mt-5 text-lg font-bold text-foreground">
                  {service.title}
                </h3>
                <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {service.description}
                </p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-primary dark:text-secondary">
                  اعرف المزيد
                  <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1" />
                </span>
              </Link>
            </FadeIn>
            );
          })}
        </Stagger>
      </Container>
    </section>
  );
}
