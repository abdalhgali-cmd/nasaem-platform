import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Ship } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { FadeIn, Stagger } from "@/components/motion/fade-in";
import { getSiteAssetUrls, type SiteAssetKey } from "@/lib/site-assets";

const services: {
  key: SiteAssetKey;
  // Not every service has a bundled fallback image (see icon-ferry below) —
  // absent means fall through to a lucide icon instead.
  fallbackIcon?: string;
  title: string;
  description: string;
  href: string;
}[] = [
  {
    key: "icon-umrah",
    fallbackIcon: "/icons/umrah.png",
    title: "باقات العمرة",
    description: "تأشيرة فقط أو باقة متكاملة تشمل الطيران والفنادق والنقل — بإشراف كامل من الإدارة حتى العودة.",
    href: "/umrah",
  },
  {
    key: "icon-visa",
    fallbackIcon: "/icons/visa.png",
    title: "التأشيرات",
    description: "زيارة عائلية، تأشيرة عمل، أو تأشيرات دولية — نتابع إجراءاتك بدقة وسرعة حتى الاستلام.",
    href: "/visas",
  },
  {
    key: "icon-flight",
    fallbackIcon: "/icons/flight.png",
    title: "حجز الطيران",
    description: "أفضل أسعار تذاكر الطيران الداخلي والدولي على أشهر شركات الطيران، برحلة ذهاب أو ذهاب وعودة.",
    href: "/flights",
  },
  {
    key: "icon-hotel",
    fallbackIcon: "/icons/hotel.png",
    title: "حجز الفنادق",
    description: "فنادق قريبة من الحرمين الشريفين وفي كل الوجهات، بمستويات مختلفة تناسب كل ميزانية.",
    href: "/hotels",
  },
  {
    key: "icon-ferry",
    title: "حجز العبّارات",
    description: "رحلات العبّارات بين موانئ السودان والسعودية — بورتسودان وسواكن إلى جدة وينبع، بحجز مؤكد ومتابعة كاملة.",
    href: "/ferry",
  },
  {
    key: "icon-international",
    fallbackIcon: "/icons/international.png",
    title: "التأشيرات الدولية",
    description: "الصين، بالي، ودول أفريقيا — نوضح لك المستندات المطلوبة قبل بدء الإجراءات.",
    href: "/visas",
  },
  {
    key: "icon-packages",
    fallbackIcon: "/icons/packages.png",
    title: "باقات السفر الشاملة",
    description: "برامج سياحية جاهزة تجمع الطيران والإقامة والجولات في باقة واحدة بسعر مريح.",
    href: "/packages",
  },
];

export async function Services() {
  const assetUrls = await getSiteAssetUrls();

  return (
    <section className="bg-section py-24">
      <Container>
        <SectionHeading
          eyebrow="خدماتنا"
          title="كل ما تحتاجه لرحلتك في مكان واحد"
          description="من أول خطوة في التخطيط حتى العودة إلى الوطن، فريقنا يتولى كل التفاصيل نيابة عنك."
        />

        <Stagger className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service, index) => (
            <FadeIn key={service.title} delay={index * 0.05} className="h-full">
              <Link
                href={service.href}
                className="group flex h-full flex-col rounded-3xl border border-border bg-card p-7 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10"
              >
                <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 transition-transform duration-300 group-hover:scale-105">
                  {assetUrls[service.key] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={assetUrls[service.key]} alt="" className="size-11 object-contain" />
                  ) : service.fallbackIcon ? (
                    <Image
                      src={service.fallbackIcon}
                      alt=""
                      width={96}
                      height={96}
                      className="size-11 object-contain"
                    />
                  ) : (
                    <Ship className="size-11 text-primary" />
                  )}
                </span>
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
          ))}
        </Stagger>
      </Container>
    </section>
  );
}
