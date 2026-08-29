import type { Metadata } from "next";
import { Check, Gem, Star } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { PageHero } from "@/components/sections/page-hero";
import { ServiceIntakeWizard } from "@/components/sections/service-intake-wizard";
import { DynamicUmrahPackages } from "@/components/sections/dynamic-umrah-packages";
import { Button } from "@/components/ui/button";
import { FadeIn, Stagger } from "@/components/motion/fade-in";

export const metadata: Metadata = {
  title: "باقات السفر",
  description: "باقات سفر محدثة من كتالوج نسائم الحرمين الرسمي مع أسعار واضحة وخيارات تناسب احتياجاتك.",
};

const whyUs = [
  { icon: Gem, title: "مراجعة تفاصيل الباقة", description: "نوضح تفاصيل الباقة والخدمات المشمولة قبل اعتماد العرض." },
  { icon: Star, title: "تجربة متكاملة", description: "كل تفاصيل رحلتك في مكان واحد بدون تشتت." },
  { icon: Check, title: "مرونة في التعديل", description: "إمكانية تعديل الباقة لتناسب احتياجاتك الخاصة." },
];

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ package?: string }>;
}) {
  const { package: selectedPackageCode } = await searchParams;

  return (
    <>
      <PageHero
        eyebrow="باقات السفر"
        breadcrumb="الباقات"
        title="باقات سفر محدثة تناسب احتياجاتك"
        description="استعرض الباقات المعتمدة حاليًا، ثم اختر الباقة المناسبة أو اطلب تصميم باقة مخصصة."
      />

      <section className="py-24">
        <Container>
          <SectionHeading eyebrow="باقاتنا المتاحة" title="اختر الباقة الأنسب لرحلتك" />
          <div className="mt-14">
            <DynamicUmrahPackages selectedPackageCode={selectedPackageCode} />
          </div>
        </Container>
      </section>

      <section className="bg-section py-24">
        <Container>
          <SectionHeading eyebrow="لماذا NASAEM" title="نُخطط، أنت تستمتع فقط" />
          <Stagger className="mt-14 grid gap-6 sm:grid-cols-3">
            {whyUs.map((item, index) => (
              <FadeIn key={item.title} delay={index * 0.08}>
                <div className="flex flex-col items-center rounded-3xl border border-border bg-card p-7 text-center shadow-sm">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-secondary"><item.icon className="size-6" /></span>
                  <h3 className="mt-4 text-base font-bold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </div>
              </FadeIn>
            ))}
          </Stagger>

          <FadeIn className="mt-12 rounded-3xl border border-accent/30 bg-accent/5 p-8 text-center">
            <h3 className="text-lg font-bold text-foreground">تحتاج باقة مخصصة؟</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">أخبرنا بتفاصيل رحلتك ونحن نصمم لك باقة خاصة تناسب ميزانيتك وموعدك.</p>
            <Button asChild className="mt-5"><a href="#book">اطلب باقة الآن</a></Button>
          </FadeIn>
        </Container>
      </section>

      <section id="book" className="scroll-mt-24 py-24">
        <Container>
          <SectionHeading eyebrow="الحجز" title="ابدأ طلب الباقة" />
          <div className="mt-12"><ServiceIntakeWizard service="package" initialServiceCode={selectedPackageCode} /></div>
        </Container>
      </section>
    </>
  );
}
