import { ClipboardCheck, MessageCircle, ShieldCheck, UserRoundCheck } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { FadeIn, Stagger } from "@/components/motion/fade-in";

const servicePrinciples = [
  {
    icon: ClipboardCheck,
    title: "تفاصيل واضحة قبل الاعتماد",
    description: "تراجع تفاصيل الخدمة والتكلفة المقترحة قبل الانتقال إلى الخطوة التالية.",
  },
  {
    icon: MessageCircle,
    title: "تواصل مباشر",
    description: "يمكنك متابعة الاستفسار والطلب عبر قنوات التواصل المتاحة مع الفريق.",
  },
  {
    icon: UserRoundCheck,
    title: "متابعة للطلب",
    description: "تحصل على رقم مرجعي وتستطيع متابعة الحالة من صفحة التتبع أو حسابك.",
  },
  {
    icon: ShieldCheck,
    title: "مراجعة قبل التنفيذ",
    description: "تخضع العروض والتوفر والمستندات للمراجعة قبل اعتماد الإجراءات النهائية.",
  },
];

export function Testimonials() {
  return (
    <section className="py-24">
      <Container>
        <SectionHeading
          eyebrow="تجربة واضحة"
          title="خدمة تتابعها خطوة بخطوة"
          description="نركز على وضوح التفاصيل والتواصل والمتابعة بدل عرض أرقام أو تقييمات لم يعتمدها مالك المنصة بعد."
        />

        <Stagger className="mt-14 grid gap-6 sm:grid-cols-2">
          {servicePrinciples.map(({ icon: Icon, title, description }, index) => (
            <FadeIn key={title} delay={index * 0.06} className="h-full">
              <article className="flex h-full flex-col rounded-3xl border border-border bg-card p-7 shadow-sm">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-secondary">
                  <Icon className="size-6" />
                </span>
                <h3 className="mt-5 text-lg font-extrabold text-foreground">{title}</h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
              </article>
            </FadeIn>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}
