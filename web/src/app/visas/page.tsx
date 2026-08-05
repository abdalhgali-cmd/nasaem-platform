import type { Metadata } from "next";
import { Briefcase, Globe2, Plane, Stamp, Users2 } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { PageHero } from "@/components/sections/page-hero";
import { FadeIn, Stagger } from "@/components/motion/fade-in";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "خدمات التأشيرات",
  description:
    "استخراج تأشيرات العمرة، الزيارة العائلية، العمل، والتأشيرات الدولية بمتابعة كاملة من فريق نسائم الحرمين حتى الاستلام.",
};

const visaCategories = [
  {
    icon: Stamp,
    title: "تأشيرة العمرة",
    duration: "٣ - ٧ أيام عمل",
    description: "استخراج تأشيرة عمرة فردية أو جماعية بالتنسيق المباشر مع الجهات المعتمدة.",
    requirements: ["صورة الجواز", "الصورة الشخصية", "صورة إقامة الضامن", "رقم الضامن (أبشر)"],
  },
  {
    icon: Users2,
    title: "الزيارة العائلية",
    duration: "٢٤ - ٧٢ ساعة",
    description: "زيارة الأهل في السعودية حسب صلة القرابة (الأم، الأب، الزوجة، وغيرهم).",
    requirements: [
      "صورة الجواز والصورة الشخصية",
      "مستند الزيارة (الدعوة)",
      "صورة إقامة مرسل الزيارة (من أبشر)",
      "مستندات إضافية حسب صلة القرابة",
    ],
  },
  {
    icon: Briefcase,
    title: "تأشيرة العمل",
    duration: "حسب الجهة المُصدرة",
    description: "استكمال إجراءات عقد العمل، الفحص الطبي، واستخراج الفيش الجنائي.",
    requirements: ["رقم المكتب المفوَّض", "عقد العمل", "صورة الجواز", "الصورة الشخصية"],
  },
  {
    icon: Globe2,
    title: "التأشيرات الدولية",
    duration: "يختلف حسب الدولة",
    description: "الصين، بالي، ودول أفريقيا — نراجع طلبك ونوضح أي مستند إضافي مطلوب.",
    requirements: ["صورة الجواز", "الصورة الشخصية", "دعوة أو حجز الطيران والفندق (حسب الدولة)"],
  },
  {
    icon: Plane,
    title: "الموافقة الأمنية لمصر",
    duration: "٣ - ٥ أيام عمل",
    description: "خطوتك الأولى للسفر إلى مصر عبر الطيران أو أحد المعابر البرية.",
    requirements: ["صورة الجواز", "تذكرة الطيران أو طلب الحجز (أو تحديد اسم المعبر البري)"],
  },
];

export default function VisasPage() {
  return (
    <>
      <PageHero
        eyebrow="خدمات التأشيرات"
        breadcrumb="التأشيرات"
        title="إجراءات تأشيرتك، من الألف إلى الياء"
        description="مهما كان نوع التأشيرة، فريقنا يتابع طلبك خطوة بخطوة حتى الاستلام — بشفافية كاملة في المدة والمستندات."
      />

      <section className="py-24">
        <Container>
          <SectionHeading
            eyebrow="أنواع التأشيرات"
            title="اختر نوع التأشيرة المناسب لرحلتك"
          />

          <Stagger className="mt-14 grid gap-6 lg:grid-cols-2">
            {visaCategories.map((visa, index) => (
              <FadeIn key={visa.title} delay={index * 0.06}>
                <div className="flex h-full flex-col rounded-3xl border border-border bg-card p-7 shadow-sm transition-shadow duration-300 hover:shadow-lg">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-secondary">
                      <visa.icon className="size-6" />
                    </span>
                    <span className="rounded-full bg-accent/10 px-3 py-1 text-[11px] font-bold text-accent-foreground/80 dark:text-accent">
                      {visa.duration}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-foreground">{visa.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {visa.description}
                  </p>
                  <div className="mt-5 border-t border-border pt-4">
                    <span className="text-xs font-bold text-foreground/70">المستندات المطلوبة:</span>
                    <ul className="mt-2.5 grid gap-2 sm:grid-cols-2">
                      {visa.requirements.map((req) => (
                        <li key={req} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                          {req}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </FadeIn>
            ))}
          </Stagger>
        </Container>
      </section>

      <section className="bg-gradient-to-b from-primary to-[#0a2f70] py-16 text-white">
        <Container className="flex flex-col items-center gap-6 text-center">
          <h2 className="text-2xl font-extrabold sm:text-3xl">
            غير متأكد من المستندات المطلوبة لحالتك؟
          </h2>
          <p className="max-w-lg text-white/75">
            راسلنا على الواتساب وسيساعدك فريقنا في تحديد المستندات الدقيقة حسب جنسيتك ونوع طلبك.
          </p>
          <Button asChild variant="gold" size="lg">
            <a href={`https://wa.me/${siteConfig.whatsapp}`} target="_blank" rel="noopener noreferrer">
              اسأل عبر واتساب
            </a>
          </Button>
        </Container>
      </section>
    </>
  );
}
