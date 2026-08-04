import Link from "next/link";
import { ArrowLeft, Plane, PlaneLanding, PlaneTakeoff, ShieldCheck, Tag, Clock3 } from "lucide-react";
import { Container } from "@/components/container";
import { Button } from "@/components/ui/button";
import { FadeIn, Stagger } from "@/components/motion/fade-in";

const routes = [
  { from: "الخرطوم", to: "جدة", price: "410" },
  { from: "الخرطوم", to: "القاهرة", price: "260" },
  { from: "بورتسودان", to: "جدة", price: "195" },
  { from: "الخرطوم", to: "دبي", price: "520" },
];

const perks = [
  { icon: Tag, label: "أسعار تنافسية مقارنة بالسوق" },
  { icon: ShieldCheck, label: "حجز موثوق وتأكيد فوري" },
  { icon: Clock3, label: "دعم لتغيير وإلغاء الحجوزات" },
];

export function FlightBooking() {
  return (
    <section className="bg-section py-24">
      <Container className="grid items-center gap-14 lg:grid-cols-2">
        <FadeIn>
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-xs font-bold text-accent-foreground/80 dark:text-accent">
            <Plane className="size-3.5" />
            حجز الطيران
          </span>
          <h2 className="mt-4 text-balance text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">
            طر إلى وجهتك بأفضل سعر متاح
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
            نقارن لك بين شركات الطيران المختلفة لنؤمّن لك أفضل الأسعار على
            الرحلات الداخلية والدولية، مع إمكانية الحجز الفردي أو الجماعي.
          </p>

          <ul className="mt-7 space-y-3">
            {perks.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm font-medium text-foreground/80">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary dark:text-secondary">
                  <Icon className="size-[18px]" />
                </span>
                {label}
              </li>
            ))}
          </ul>

          <Button asChild size="lg" className="mt-8">
            <Link href="/flights">
              ابحث عن رحلتك
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
        </FadeIn>

        <Stagger className="grid gap-4 sm:grid-cols-2">
          {routes.map((route, index) => (
            <FadeIn key={`${route.from}-${route.to}`} delay={index * 0.06}>
              <div className="group rounded-3xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                <div className="flex items-center justify-between gap-2 text-sm font-bold text-foreground">
                  <span className="flex items-center gap-1.5">
                    <PlaneTakeoff className="size-4 text-primary dark:text-secondary" />
                    {route.from}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                  <span className="flex items-center gap-1.5">
                    {route.to}
                    <PlaneLanding className="size-4 text-accent" />
                  </span>
                </div>
                <div className="mt-5 flex items-end justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground">يبدأ من</span>
                    <p className="text-2xl font-extrabold text-foreground">
                      ${route.price}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:text-secondary">
                    اعرض الرحلات ←
                  </span>
                </div>
              </div>
            </FadeIn>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}
