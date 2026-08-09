import type { Metadata } from "next";
import { Clock3, PlaneLanding, PlaneTakeoff, ShieldCheck, Tag, Users } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { PageHero } from "@/components/sections/page-hero";
import { BookingSearchWidget } from "@/components/sections/booking-search-widget";
import { ServiceRequestForm } from "@/components/sections/service-request-form";
import { FadeIn, Stagger } from "@/components/motion/fade-in";
import { FLIGHT_ROUTES, ORIGIN_CITIES, DESTINATION_CITIES, CABIN_CLASSES } from "@/lib/flight-routes";

const flightRequestFields = [
  { name: "from", label: "من", type: "select" as const, options: [...ORIGIN_CITIES] },
  { name: "to", label: "إلى", type: "select" as const, options: [...DESTINATION_CITIES] },
  { name: "date", label: "تاريخ الذهاب", type: "date" as const, required: true },
  { name: "returnDate", label: "تاريخ العودة", type: "date" as const },
  {
    name: "cabinClass",
    label: "الدرجة",
    type: "select" as const,
    options: CABIN_CLASSES.map((c) => c.label),
  },
  { name: "passengers", label: "عدد المسافرين", type: "number" as const, min: 1, defaultValue: "1" },
];

export const metadata: Metadata = {
  title: "حجز تذاكر الطيران",
  description:
    "احجز تذاكر طيران داخلية ودولية بأفضل الأسعار مع نسائم الحرمين — حجز فردي أو جماعي، ذهاب فقط أو ذهاب وعودة.",
};

const routes = FLIGHT_ROUTES;

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
                      <span className="text-xs text-muted-foreground">ذهاب وعودة، يبدأ من</span>
                      <p className="text-2xl font-extrabold text-foreground">
                        ${route.roundTripPrices.economy}
                      </p>
                      {route.roundTripPrices.business ? (
                        <p className="text-[11px] text-muted-foreground">
                          رجال الأعمال من ${route.roundTripPrices.business}
                        </p>
                      ) : null}
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

      <section className="py-24">
        <Container className="max-w-2xl">
          <SectionHeading
            eyebrow="اطلب حجزك"
            title="جاهز؟ اطلب حجز تذكرتك الآن"
            description="عبّئ بياناتك وسيتواصل معك فريقنا لتأكيد الأسعار والمواعيد."
          />
          <FadeIn className="mt-10">
            <ServiceRequestForm id="request" service="طيران" fields={flightRequestFields} />
          </FadeIn>
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
