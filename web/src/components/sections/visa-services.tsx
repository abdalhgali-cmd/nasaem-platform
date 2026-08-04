import Link from "next/link";
import { ArrowLeft, Briefcase, Globe2, Plane, Stamp, Users2 } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { FadeIn, Stagger } from "@/components/motion/fade-in";

const visas = [
  {
    icon: Stamp,
    title: "تأشيرة العمرة",
    duration: "٣ - ٧ أيام عمل",
    description: "استخراج سريع لتأشيرة العمرة بالتنسيق المباشر مع الجهات المعتمدة.",
  },
  {
    icon: Users2,
    title: "الزيارة العائلية",
    duration: "٢٤ - ٧٢ ساعة",
    description: "زيارة الأهل في السعودية وفق صلة القرابة، بمتابعة كاملة للمستندات.",
  },
  {
    icon: Briefcase,
    title: "تأشيرة العمل",
    duration: "حسب الجهة المُصدرة",
    description: "استكمال إجراءات عقد العمل، الفحص الطبي، والفيش الجنائي.",
  },
  {
    icon: Globe2,
    title: "التأشيرات الدولية",
    duration: "يختلف حسب الدولة",
    description: "الصين، بالي، ودول أفريقيا — نوضح المستندات المطلوبة قبل البدء.",
  },
  {
    icon: Plane,
    title: "الموافقة الأمنية لمصر",
    duration: "٣ - ٥ أيام عمل",
    description: "خطوتك الأولى للسفر إلى مصر عبر الطيران أو المعابر البرية.",
  },
];

export function VisaServices() {
  return (
    <section className="py-24">
      <Container>
        <SectionHeading
          eyebrow="خدمات التأشيرات"
          title="نُجهّز أوراقك، وأنت تجهّز حقيبتك"
          description="فريق متخصص يتابع طلبك خطوة بخطوة حتى استلام التأشيرة."
        />

        <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {visas.map((visa, index) => (
            <FadeIn key={visa.title} delay={index * 0.05} className="h-full">
              <div className="flex h-full flex-col rounded-3xl border border-border bg-card p-6 text-center shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg">
                <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-secondary">
                  <visa.icon className="size-6" />
                </span>
                <h3 className="mt-4 text-base font-bold text-foreground">{visa.title}</h3>
                <span className="mt-1.5 inline-block rounded-full bg-accent/10 px-3 py-1 text-[11px] font-bold text-accent-foreground/80 dark:text-accent">
                  {visa.duration}
                </span>
                <p className="mt-3 flex-1 text-xs leading-relaxed text-muted-foreground">
                  {visa.description}
                </p>
              </div>
            </FadeIn>
          ))}
        </Stagger>

        <FadeIn className="mt-10 text-center">
          <Link
            href="/visas"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline dark:text-secondary"
          >
            عرض كل خدمات التأشيرات
            <ArrowLeft className="size-4" />
          </Link>
        </FadeIn>
      </Container>
    </section>
  );
}
