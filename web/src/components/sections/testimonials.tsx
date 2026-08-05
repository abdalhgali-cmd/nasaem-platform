import { Quote, Star } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { FadeIn, Stagger } from "@/components/motion/fade-in";

const testimonials = [
  {
    name: "محمد الطيب",
    role: "عميل — باقة عمرة مع الخدمات",
    quote:
      "تعامل احترافي من أول اتصال حتى العودة من الرحلة. كل التفاصيل كانت مرتبة والفندق قريب جدًا من الحرم. أنصح بهم بثقة تامة.",
    initials: "مط",
  },
  {
    name: "فاطمة عبدالله",
    role: "عميلة — تأشيرة زيارة عائلية",
    quote:
      "استخرجوا لي التأشيرة خلال يومين فقط، وتابعوا معي كل خطوة. تواصل سريع وواضح على الواتساب طوال الوقت.",
    initials: "فع",
  },
  {
    name: "عمر حسن",
    role: "عميل — حجز طيران وفندق",
    quote:
      "أسعار ممتازة مقارنة بمواقع الحجز الأخرى، والفريق ساعدني في اختيار أفضل موعد للرحلة. سأتعامل معهم مرة أخرى بالتأكيد.",
    initials: "عح",
  },
  {
    name: "سارة إبراهيم",
    role: "عميلة — العمرة الجماعية",
    quote:
      "انضممت لأحد الأفواج المنظمة وكانت تجربة رائعة من ناحية التنظيم والمرشد الديني المرافق طوال الرحلة.",
    initials: "سإ",
  },
];

export function Testimonials() {
  return (
    <section className="py-24">
      <Container>
        <SectionHeading
          eyebrow="آراء عملائنا"
          title="ثقة أكثر من 15,000 عميل"
          description="نفخر بالثقة التي منحنا إياها عملاؤنا على مدار سنوات من الخدمة."
        />

        <Stagger className="mt-14 grid gap-6 sm:grid-cols-2">
          {testimonials.map((t, index) => (
            <FadeIn key={t.name} delay={index * 0.06} className="h-full">
              <figure className="flex h-full flex-col rounded-3xl border border-border bg-card p-7 shadow-sm">
                <Quote className="size-8 text-accent/50" />
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-foreground/85">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <div className="mt-6 flex items-center gap-3 border-t border-border pt-5">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-sm font-bold text-white">
                    {t.initials}
                  </span>
                  <figcaption>
                    <span className="block text-sm font-bold text-foreground">
                      {t.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">{t.role}</span>
                  </figcaption>
                  <span className="ms-auto flex items-center gap-0.5" aria-label="تقييم 5 من 5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="size-3.5 fill-accent text-accent" />
                    ))}
                  </span>
                </div>
              </figure>
            </FadeIn>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}
