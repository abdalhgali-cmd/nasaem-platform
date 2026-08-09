import Link from "next/link";
import { Check, Sparkles, Star } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { Button } from "@/components/ui/button";
import { FadeIn, Stagger } from "@/components/motion/fade-in";
import { cn } from "@/lib/utils";

const packages = [
  {
    name: "تأشيرة عمرة فقط",
    price: "1,200",
    unit: "ريال / للفرد",
    description: "لمن يرغب بترتيب رحلته بنفسه ويحتاج فقط تأشيرة عمرة موثوقة وسريعة.",
    features: [
      "استخراج تأشيرة العمرة",
      "متابعة إلكترونية لحالة الطلب",
      "دعم فني على مدار الساعة",
    ],
    highlighted: false,
  },
  {
    name: "عمرة مع الخدمات",
    price: "4,500",
    unit: "ريال / للفرد",
    description: "الباقة الأكثر طلبًا: تشمل كل شيء من التأشيرة حتى الفندق والنقل.",
    features: [
      "تأشيرة العمرة",
      "تذاكر طيران ذهاب وعودة",
      "إقامة فندقية في مكة والمدينة",
      "نقل بالحافلات بين المدينتين",
    ],
    highlighted: true,
  },
  {
    name: "العمرة الجماعية (الأفواج)",
    price: "3,800",
    unit: "ريال / للفرد",
    description: "انضم إلى أفواج منظمة بإشراف مرشدين متخصصين وبرنامج زمني واضح.",
    features: [
      "برنامج فوج كامل ومُنظّم",
      "إشراف مرشد ديني طوال الرحلة",
      "إقامة وطيران ونقل جماعي",
    ],
    highlighted: false,
  },
];

export function FeaturedUmrah() {
  return (
    <section className="py-24">
      <Container>
        <SectionHeading
          eyebrow="باقات العمرة"
          title="اختر الباقة التي تناسب رحلتك"
          description="أسعار تقديرية تبدأ من — التكلفة النهائية تُحدد حسب الموسم والفندق ومدة الإقامة."
        />

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
                    الأكثر طلبًا
                  </span>
                ) : null}

                <Sparkles
                  className={cn(
                    "size-8",
                    pkg.highlighted ? "text-accent" : "text-primary dark:text-secondary"
                  )}
                />
                <h3 className="mt-4 text-xl font-bold">{pkg.name}</h3>
                <p
                  className={cn(
                    "mt-2 text-sm leading-relaxed",
                    pkg.highlighted ? "text-white/75" : "text-muted-foreground"
                  )}
                >
                  {pkg.description}
                </p>

                <div className="mt-6 flex items-baseline gap-2">
                  <span className="text-sm">يبدأ من</span>
                  <span className="text-3xl font-extrabold">{pkg.price}</span>
                  <span
                    className={cn(
                      "text-xs",
                      pkg.highlighted ? "text-white/70" : "text-muted-foreground"
                    )}
                  >
                    {pkg.unit}
                  </span>
                </div>

                <ul className="mt-6 flex-1 space-y-3">
                  {pkg.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm">
                      <Check
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          pkg.highlighted ? "text-accent" : "text-success"
                        )}
                      />
                      <span className={pkg.highlighted ? "text-white/90" : "text-foreground/80"}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  variant={pkg.highlighted ? "gold" : "primary"}
                  size="lg"
                  className="mt-8 w-full"
                >
                  <Link href="/umrah#request">احجز هذه الباقة</Link>
                </Button>
              </div>
            </FadeIn>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}
