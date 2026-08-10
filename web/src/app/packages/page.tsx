import type { Metadata } from "next";
import Link from "next/link";
import { Check, Gem, Heart, Plane, Star, Users } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { PageHero } from "@/components/sections/page-hero";
import { ServiceRequestForm } from "@/components/sections/service-request-form";
import { Button } from "@/components/ui/button";
import { FadeIn, Stagger } from "@/components/motion/fade-in";
import { cn } from "@/lib/utils";
import { getSiteAssetUrls } from "@/lib/site-assets";

export const metadata: Metadata = {
  title: "الباقات الشاملة",
  description:
    "باقات سفر شاملة تجمع الطيران والإقامة والجولات في باقة واحدة — للعائلات وشهر العسل ورحلات العمل.",
};

const packages = [
  {
    icon: Users,
    name: "باقة العائلة",
    price: "2,900",
    unit: "ريال / للفرد",
    description: "رحلة مريحة للعائلات تشمل إقامة مناسبة للأطفال وبرنامج جولات خفيف.",
    features: ["طيران ذهاب وعودة", "إقامة عائلية (غرف مترابطة)", "نقل خاص للمطار والجولات", "برنامج جولات مناسب للأطفال"],
    highlighted: false,
  },
  {
    icon: Heart,
    name: "باقة شهر العسل",
    price: "5,200",
    unit: "ريال / للزوجين",
    description: "أجواء رومانسية في وجهة مميزة، بإقامة فاخرة وتنظيم كامل للتفاصيل.",
    features: ["طيران درجة أعمال (اختياري)", "إقامة في فندق ٥ نجوم", "عشاء رومانسي مُهدى", "جولة خاصة للزوجين"],
    highlighted: true,
  },
  {
    icon: Plane,
    name: "باقة رحلات العمل",
    price: "3,600",
    unit: "ريال / للفرد",
    description: "تنظيم سريع ومرن لرحلات العمل مع إقامة قريبة من مراكز الأعمال.",
    features: ["حجز طيران مرن التعديل", "فندق قريب من مركز الأعمال", "خدمة نقل فوري", "دعم على مدار الساعة أثناء الرحلة"],
    highlighted: false,
  },
];

const whyUs = [
  { icon: Gem, title: "جودة مضمونة", description: "نختار شركاءنا من فنادق وشركات طيران بعناية فائقة." },
  { icon: Star, title: "تجربة متكاملة", description: "كل تفاصيل رحلتك في مكان واحد بدون تشتت." },
  { icon: Check, title: "مرونة في التعديل", description: "إمكانية تعديل الباقة لتناسب احتياجاتك الخاصة." },
];

const packageRequestFields = [
  { name: "packageType", label: "نوع الباقة", type: "select" as const, options: packages.map((p) => p.name) },
  { name: "destination", label: "الوجهة المفضلة", type: "text" as const },
  { name: "travelDate", label: "تاريخ السفر المتوقع", type: "date" as const },
  { name: "travelers", label: "عدد المسافرين", type: "number" as const, min: 1, defaultValue: "1" },
];

export default async function PackagesPage() {
  const assetUrls = await getSiteAssetUrls();

  return (
    <>
      <PageHero
        eyebrow="الباقات الشاملة"
        breadcrumb="الباقات"
        title="باقات سفر جاهزة تناسب كل مناسبة"
        description="اختر من بين باقاتنا المصممة خصيصًا للعائلات، الأزواج، ورحلات العمل — أو اطلب باقة مخصصة."
        imageUrl={assetUrls["hero-background"]}
      />

      <section className="py-24">
        <Container>
          <SectionHeading eyebrow="باقاتنا المميزة" title="اختر الباقة الأنسب لمناسبتك" />

          <Stagger className="mt-14 grid gap-6 lg:grid-cols-3">
            {packages.map((pkg, index) => (
              <FadeIn key={pkg.name} delay={index * 0.08} className="h-full">
                <div
                  className={cn(
                    "relative flex h-full flex-col rounded-3xl border p-8 transition-all duration-300 hover:-translate-y-1.5",
                    pkg.highlighted
                      ? "border-accent bg-gradient-to-b from-primary to-[#0a2f70] text-white shadow-2xl shadow-primary/25"
                      : "border-border bg-card shadow-sm hover:shadow-xl"
                  )}
                >
                  {pkg.highlighted ? (
                    <span className="absolute -top-3.5 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-accent-foreground shadow-lg">
                      <Star className="size-3.5 fill-current" />
                      الأكثر تميزًا
                    </span>
                  ) : null}

                  <pkg.icon className={cn("size-8", pkg.highlighted ? "text-accent" : "text-primary dark:text-secondary")} />
                  <h3 className="mt-4 text-xl font-bold">{pkg.name}</h3>
                  <p className={cn("mt-2 text-sm leading-relaxed", pkg.highlighted ? "text-white/75" : "text-muted-foreground")}>
                    {pkg.description}
                  </p>

                  <div className="mt-6 flex items-baseline gap-2">
                    <span className="text-sm">يبدأ من</span>
                    <span className="text-3xl font-extrabold">{pkg.price}</span>
                    <span className={cn("text-xs", pkg.highlighted ? "text-white/70" : "text-muted-foreground")}>
                      {pkg.unit}
                    </span>
                  </div>

                  <ul className="mt-6 flex-1 space-y-3">
                    {pkg.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm">
                        <Check className={cn("mt-0.5 size-4 shrink-0", pkg.highlighted ? "text-accent" : "text-success")} />
                        <span className={pkg.highlighted ? "text-white/90" : "text-foreground/80"}>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button asChild variant={pkg.highlighted ? "gold" : "primary"} size="lg" className="mt-8 w-full">
                    <Link href="#request">اطلب هذه الباقة</Link>
                  </Button>
                </div>
              </FadeIn>
            ))}
          </Stagger>
        </Container>
      </section>

      <section className="py-24">
        <Container className="max-w-2xl">
          <SectionHeading
            eyebrow="اطلب باقتك"
            title="جاهز؟ اطلب باقتك الآن"
            description="عبّئ بياناتك وسيتواصل معك فريقنا لتصميم رحلتك وتأكيد التفاصيل."
          />
          <FadeIn className="mt-10">
            <ServiceRequestForm id="request" service="باقة سفر شاملة" fields={packageRequestFields} />
          </FadeIn>
        </Container>
      </section>

      <section className="bg-section py-24">
        <Container>
          <SectionHeading eyebrow="لماذا باقاتنا" title="نُخطط، أنت تستمتع فقط" />
          <Stagger className="mt-14 grid gap-6 sm:grid-cols-3">
            {whyUs.map((item, index) => (
              <FadeIn key={item.title} delay={index * 0.08}>
                <div className="flex flex-col items-center rounded-3xl border border-border bg-card p-7 text-center shadow-sm">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-secondary">
                    <item.icon className="size-6" />
                  </span>
                  <h3 className="mt-4 text-base font-bold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </div>
              </FadeIn>
            ))}
          </Stagger>

          <FadeIn className="mt-12 rounded-3xl border border-accent/30 bg-accent/5 p-8 text-center">
            <h3 className="text-lg font-bold text-foreground">تحتاج باقة مخصصة؟</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              أخبرنا بتفاصيل رحلتك ونحن نصمم لك باقة خاصة تناسب ميزانيتك وموعدك.
            </p>
            <Button asChild className="mt-5">
              <Link href="#request">تواصل معنا الآن</Link>
            </Button>
          </FadeIn>
        </Container>
      </section>
    </>
  );
}
