import Link from "next/link";
import { ArrowLeft, Plane, PlaneLanding, PlaneTakeoff, ShieldCheck, Tag, Clock3 } from "lucide-react";
import { Container } from "@/components/container";
import { Button } from "@/components/ui/button";
import { FadeIn, Stagger } from "@/components/motion/fade-in";

const steps = [
  { icon: PlaneTakeoff, label: "أرسل وجهتك وموعد سفرك" },
  { icon: Tag, label: "نراجع الخيارات والأسعار المتاحة" },
  { icon: ShieldCheck, label: "اعتمد العرض بعد تأكيد التوفر" },
  { icon: Clock3, label: "نساعدك في التعديل والمتابعة" },
];

export function FlightBooking() {
  return (
    <section className="bg-section py-24">
      <Container className="grid items-center gap-14 lg:grid-cols-2">
        <FadeIn>
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-xs font-bold text-accent-foreground/80 dark:text-accent">
            <Plane className="size-3.5" />
            طلب عرض للطيران
          </span>
          <h2 className="mt-4 text-balance text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">
            نساعدك في العثور على الرحلة المناسبة
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
            أرسل تفاصيل رحلتك، وسيراجع فريقنا الخيارات والأسعار المتاحة ثم يتواصل معك بالعرض المناسب. التأكيد النهائي يخضع للمراجعة والتوفر.
          </p>

          <ul className="mt-7 space-y-3">
            {steps.map(({ icon: Icon, label }) => (
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
              أرسل تفاصيل الرحلة
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
        </FadeIn>

        <Stagger className="grid gap-4 sm:grid-cols-2">
          {[
            { icon: PlaneTakeoff, title: "الوجهة", detail: "حدد مدينة المغادرة والوصول" },
            { icon: PlaneLanding, title: "التفاصيل", detail: "أرسل التاريخ وعدد المسافرين" },
            { icon: Tag, title: "العرض", detail: "يصلك السعر بعد المراجعة" },
            { icon: ShieldCheck, title: "التأكيد", detail: "يتم بعد اعتماد العرض وتأكيد التوفر" },
          ].map(({ icon: Icon, title, detail }, index) => (
            <FadeIn key={title} delay={index * 0.06}>
              <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-secondary">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-5 text-lg font-extrabold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{detail}</p>
              </div>
            </FadeIn>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}
