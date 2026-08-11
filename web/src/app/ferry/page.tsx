import type { Metadata } from "next";
import { Anchor, Clock3, ShieldCheck, Ship, Tag, Users } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { PageHero } from "@/components/sections/page-hero";
import { ServiceRequestForm } from "@/components/sections/service-request-form";
import { FadeIn, Stagger } from "@/components/motion/fade-in";
import { FERRY_ORIGIN_PORTS, FERRY_DESTINATION_PORTS } from "@/lib/ferry-ports";
import { getSiteAssetUrls } from "@/lib/site-assets";

const ferryRequestFields = [
  { name: "from", label: "ميناء الانطلاق", type: "select" as const, options: [...FERRY_ORIGIN_PORTS] },
  { name: "to", label: "ميناء الوصول", type: "select" as const, options: [...FERRY_DESTINATION_PORTS] },
  { name: "date", label: "تاريخ السفر", type: "date" as const, required: true },
  { name: "returnDate", label: "تاريخ العودة", type: "date" as const },
  { name: "passengers", label: "عدد المسافرين", type: "number" as const, min: 1, defaultValue: "1" },
];

export const metadata: Metadata = {
  title: "حجز العبّارات",
  description: "احجز رحلتك عبر العبّارات البحرية بين السودان والسعودية مع نسائم الحرمين — ذهاب فقط أو ذهاب وعودة.",
};

const features = [
  { icon: Tag, title: "أسعار متعددة", description: "نعرض لك أكثر من خيار سعر حسب شركة النقل البحري المتاحة." },
  { icon: ShieldCheck, title: "حجز موثّق", description: "تأكيد رحلتك مع تفاصيل واضحة قبل السداد." },
  { icon: Users, title: "حجوزات جماعية", description: "أسعار خاصة للمجموعات والأفواج." },
  { icon: Clock3, title: "متابعة قبل السفر", description: "نتابع معك موعد الرحلة وأي مستجدات قبل الإبحار." },
];

export default async function FerryPage() {
  const assetUrls = await getSiteAssetUrls();

  return (
    <>
      <PageHero
        eyebrow="حجز العبّارات"
        breadcrumb="العبّارات"
        title="اعبر البحر الأحمر براحة وأمان"
        description="نرتب لك رحلتك عبر العبّارات البحرية بين موانئ السودان والسعودية."
        imageUrl={assetUrls["hero-background"]}
      />

      <section className="py-16">
        <Container>
          <SectionHeading eyebrow="خط الرحلة" title="بين موانئ السودان والسعودية" />
          <Stagger className="mt-14 grid gap-5 sm:grid-cols-2">
            {FERRY_ORIGIN_PORTS.map((origin, index) => (
              <FadeIn key={origin} delay={index * 0.05}>
                <div className="rounded-3xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                  <div className="flex items-center justify-between text-sm font-bold text-foreground">
                    <span className="flex items-center gap-1.5">
                      <Anchor className="size-4 text-primary dark:text-secondary" />
                      {origin}
                    </span>
                    <span className="h-px flex-1 mx-2 bg-border" />
                    <span className="flex items-center gap-1.5">
                      {FERRY_DESTINATION_PORTS.join(" / ")}
                      <Ship className="size-4 text-accent" />
                    </span>
                  </div>
                </div>
              </FadeIn>
            ))}
          </Stagger>
        </Container>
      </section>

      <section className="py-24">
        <Container className="max-w-2xl">
          <SectionHeading
            eyebrow="اطلب حجزك"
            title="جاهز؟ اطلب حجز رحلتك البحرية الآن"
            description="عبّئ بياناتك وسيتواصل معك فريقنا بعروض الأسعار المتاحة."
          />
          <FadeIn className="mt-10">
            <ServiceRequestForm
              id="request"
              service="حجز العبارات"
              fields={ferryRequestFields}
              travelerNames={{ countField: "passengers" }}
              searchParamMap={{ from: "from", to: "to", date: "date", returnDate: "returnDate", guests: "passengers" }}
            />
          </FadeIn>
        </Container>
      </section>

      <section className="bg-section py-24">
        <Container>
          <SectionHeading eyebrow="لماذا الحجز معنا" title="حجز عبّارة بلا قلق" />
          <Stagger className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, index) => (
              <FadeIn key={feature.title} delay={index * 0.06}>
                <div className="flex h-full flex-col items-center rounded-3xl border border-border bg-card p-6 text-center shadow-sm">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-secondary">
                    <feature.icon className="size-6" />
                  </span>
                  <h3 className="mt-4 text-sm font-bold text-foreground">{feature.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{feature.description}</p>
                </div>
              </FadeIn>
            ))}
          </Stagger>
        </Container>
      </section>
    </>
  );
}
