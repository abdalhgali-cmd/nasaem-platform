import type { Metadata } from "next";
import { Clock3, PlaneLanding, PlaneTakeoff, ShieldCheck, Tag, Users } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { PageHero } from "@/components/sections/page-hero";
import { BookingSearchWidget } from "@/components/sections/booking-search-widget";
import { FadeIn, Stagger } from "@/components/motion/fade-in";

export const metadata: Metadata = {
  title: "حجز تذاكر الطيران",
  description:
    "احجز تذاكر طيران داخلية ودولية بأفضل الأسعار مع نسائم الحرمين — حجز فردي أو جماعي، ذهاب فقط أو ذهاب وعودة.",
};

const routes = [
  { from: "الخرطوم", to: "جدة", price: "410", duration: "٣ ساعات" },
  { from: "الخرطوم", to: "القاهرة", price: "260", duration: "٢ ساعة ٤٥ دقيقة" },
  { from: "بورتسودان", to: "جدة", price: "195", duration: "ساعة واحدة" },
  { from: "الخرطوم", to: "دبي", price: "520", duration: "٤ ساعات" },
  { from: "الخرطوم", to: "إسطنبول", price: "610", duration: "٥ ساعات ٣٠ دقيقة" },
  { from: "الخرطوم", to: "المدينة المنورة", price: "455", duration: "٣ ساعات ١٥ دقيقة" },
];

const features = [
  { icon: Tag, title: "أفضل الأسعار", description: "مقارنة مستمرة بين شركات الطيران لضمان أفضل سعر متاح." },
  { icon: ShieldCheck, title: "حجز مضمون", description: "تأكيد فوري لحجزك مع رقم تذكرة موثّق مباشرة." },
  { icon: Users, title: "حجوزات جماعية", description: "أسعار خاصة للمجموعات والأفواج والوفود." },
  { icon: Clock3, title: "دعم قبل وبعد السفر", description: "مساعدة في تعديل أو إلغاء الحجز عند الحاجة." },
];

export default function FlightsPage() {
  return (
    <>
      <PageHero
        eyebrow="حجز الطيران"
        breadcrumb="الطيران"
        title="طر إلى أي وجهة بأفضل سعر متاح"
        description="نقارن لك بين شركات الطيران المختلفة لتحصل على أنسب سعر وأفضل مواعيد الرحلات."
      />

      <section className="relative -mt-12 pb-8">
        <Container>
          <FadeIn className="flex justify-center">
            <BookingSearchWidget />
          </FadeIn>
        </Container>
      </section>

      <section className="py-16">
        <Container>
          <SectionHeading eyebrow="وجهات مقترحة" title="أكثر الرحلات طلبًا" />
          <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {routes.map((route, index) => (
              <FadeIn key={`${route.from}-${route.to}`} delay={index * 0.05}>
                <div className="rounded-3xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                  <div className="flex items-center justify-between text-sm font-bold text-foreground">
                    <span className="flex items-center gap-1.5">
                      <PlaneTakeoff className="size-4 text-primary dark:text-secondary" />
                      {route.from}
                    </span>
                    <span className="h-px flex-1 mx-2 bg-border" />
                    <span className="flex items-center gap-1.5">
                      {route.to}
                      <PlaneLanding className="size-4 text-accent" />
                    </span>
                  </div>
                  <div className="mt-5 flex items-end justify-between">
                    <div>
                      <span className="text-xs text-muted-foreground">يبدأ من</span>
                      <p className="text-2xl font-extrabold text-foreground">${route.price}</p>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock3 className="size-3.5" />
                      {route.duration}
                    </span>
                  </div>
                </div>
              </FadeIn>
            ))}
          </Stagger>
        </Container>
      </section>

      <section className="bg-section py-24">
        <Container>
          <SectionHeading eyebrow="لماذا الحجز معنا" title="حجز طيران بلا قلق" />
          <Stagger className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, index) => (
              <FadeIn key={feature.title} delay={index * 0.06}>
                <div className="flex h-full flex-col items-center rounded-3xl border border-border bg-card p-6 text-center shadow-sm">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-secondary">
                    <feature.icon className="size-6" />
                  </span>
                  <h3 className="mt-4 text-sm font-bold text-foreground">{feature.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </FadeIn>
            ))}
          </Stagger>
        </Container>
      </section>
    </>
  );
}
