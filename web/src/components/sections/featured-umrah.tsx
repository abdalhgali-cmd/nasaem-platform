import Link from "next/link";
import { Check, Sparkles, Star } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { Button } from "@/components/ui/button";
import { FadeIn, Stagger } from "@/components/motion/fade-in";
import { cn } from "@/lib/utils";

const packages = [
  {
    code: "SVC-UMRAH-VISA",
    name: "تأشيرة عمرة فقط",
    price: "1,200",
    unit: "ريال / للفرد",
    description: "لمن يرغب بترتيب رحلته بنفسه ويحتاج فقط تأشيرة عمرة.",
    features: ["استخراج تأشيرة العمرة", "متابعة حالة الطلب", "دعم فريق نسائم الحرمين"],
    highlighted: false,
  },
  {
    code: "SVC-UMRAH-SERVICES",
    name: "عمرة مع الخدمات",
    price: "4,500",
    unit: "ريال / للفرد",
    description: "باقة متكاملة تشمل التأشيرة والطيران والإقامة والنقل حسب البرنامج.",
    features: ["تأشيرة العمرة", "تذاكر طيران ذهاب وعودة", "إقامة فندقية", "نقل داخل البرنامج"],
    highlighted: true,
  },
  {
    code: "SVC-UMRAH-GROUP",
    name: "العمرة الجماعية (الأفواج)",
    price: "3,800",
    unit: "ريال / للفرد",
    description: "برنامج فوج منظم بإشراف الفريق حسب الرحلة والموعد المتاح.",
    features: ["برنامج فوج", "إشراف الرحلة", "إقامة وطيران ونقل حسب البرنامج"],
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
          description="الأسعار المعروضة تبدأ من القيم الحالية في الكتالوج، والتكلفة النهائية يحددها الموظف حسب الموسم والخدمات المطلوبة."
        />

        <Stagger className="mt-14 grid gap-6 lg:grid-cols-3">
          {packages.map((pkg, index) => (
            <FadeIn key={pkg.code} delay={index * 0.08} className="h-full">
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

                <Sparkles className={cn("size-8", pkg.highlighted ? "text-accent" : "text-primary dark:text-secondary")} />
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
                  <Link href={`/umrah?package=${encodeURIComponent(pkg.code)}#book`}>احجز هذه الباقة</Link>
                </Button>
              </div>
            </FadeIn>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}
