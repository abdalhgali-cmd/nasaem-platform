import type { Metadata } from "next";
import { Hotel, Wifi, Utensils, Car, Wind } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { HotelRequestClient } from "@/components/sections/hotel-request-client";
import { FadeIn, Stagger } from "@/components/motion/fade-in";

export const metadata: Metadata = {
  title: "حجز الفنادق",
  description:
    "اطلب حجز فندق في وجهتك، وسيتحقق فريق نسائم الحرمين من التوفر والسعر ويعود إليك بالعرض المناسب.",
};

const amenities = [
  { icon: Wifi, label: "إنترنت لاسلكي" },
  { icon: Utensils, label: "إفطار حسب الحجز" },
  { icon: Car, label: "خيارات نقل" },
  { icon: Wind, label: "غرف مكيفة" },
];

export default function HotelsPage() {
  return (
    <>
      <HotelRequestClient />

      <section className="py-16">
        <Container>
          <SectionHeading eyebrow="خدمة الفنادق" title="تجهيز الحجز حسب احتياجك" />
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {[
              ["مكة والمدينة", "خيارات قريبة من الحرمين حسب التوفر والميزانية."],
              ["جدة والقاهرة ودبي", "نبحث لك عن الفندق المناسب للمدة والميزانية المطلوبة."],
              ["وجهات أخرى", "أرسل المدينة والتواريخ وسنراجع الخيارات المتاحة."],
            ].map(([title, description], index) => (
              <FadeIn key={title} delay={index * 0.06}>
                <div className="h-full rounded-3xl border border-border bg-card p-6 shadow-sm">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-secondary">
                    <Hotel className="size-6" />
                  </div>
                  <h3 className="mt-4 font-bold text-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{description}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </Container>
      </section>

      <section className="bg-section py-24">
        <Container>
          <SectionHeading eyebrow="مميزات الإقامة" title="طلباتك تصلنا بتفاصيل واضحة" />
          <Stagger className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {amenities.map((item, index) => (
              <FadeIn key={item.label} delay={index * 0.06}>
                <div className="flex flex-col items-center gap-3 rounded-3xl border border-border bg-card p-6 text-center shadow-sm">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-secondary">
                    <item.icon className="size-6" />
                  </span>
                  <span className="text-sm font-semibold text-foreground/85">{item.label}</span>
                </div>
              </FadeIn>
            ))}
          </Stagger>
        </Container>
      </section>
    </>
  );
}
