import type { Metadata } from "next";
import { Award, HeartHandshake, MapPin, ShieldCheck, Sparkles, Target } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { PageHero } from "@/components/sections/page-hero";
import { CountUp } from "@/components/motion/count-up";
import { FadeIn, Stagger } from "@/components/motion/fade-in";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "من نحن",
  description:
    "تعرّف على نسائم الحرمين للسفر والسياحة — قصتنا، قيمنا، وسبب ثقة أكثر من 15,000 عميل بنا على مدار أكثر من عقد من الخدمة.",
};

const values = [
  { icon: ShieldCheck, title: "الأمانة", description: "شفافية كاملة في الأسعار والإجراءات دون أي رسوم مخفية." },
  { icon: Target, title: "الدقة", description: "متابعة كل طلب لحظة بلحظة حتى إنجازه بالكامل." },
  { icon: HeartHandshake, title: "الاهتمام بالعميل", description: "فريق داعم يتعامل مع كل عميل كأنه ضيف عزيز." },
  { icon: Sparkles, title: "الجودة", description: "شراكات مختارة بعناية مع أفضل الفنادق وشركات الطيران." },
];

const milestones = [
  { year: "2014", title: "بداية الرحلة", description: "تأسست نسائم الحرمين في الخرطوم بفريق صغير وشغف كبير." },
  { year: "2017", title: "افتتاح فرع بورتسودان", description: "توسّعنا لخدمة عملاء شرق السودان عبر خط العبّارات إلى جدة." },
  { year: "2020", title: "افتتاح فرع جدة", description: "حضور مباشر في المملكة لتسهيل استقبال ومتابعة عملائنا هناك." },
  { year: "اليوم", title: "أكثر من 15,000 عميل", description: "نواصل النمو بثقة عملائنا وشراكاتنا المتنامية في المنطقة." },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="من نحن"
        breadcrumb="من نحن"
        title="أكثر من عقد من الثقة والخبرة"
        description={`${siteConfig.name} — شريكك الموثوق في كل رحلة، من العمرة إلى أي وجهة حول العالم.`}
      />

      <section className="py-24">
        <Container className="grid items-center gap-14 lg:grid-cols-2">
          <FadeIn>
            <SectionHeading
              align="start"
              eyebrow="قصتنا"
              title="بدأنا بحلم، ووصلنا بثقة عملائنا"
              description="انطلقت نسائم الحرمين للسفر والسياحة من الخرطوم برؤية واضحة: تسهيل رحلة العمرة والسفر على كل عميل، بأسعار عادلة وخدمة صادقة. اليوم، وبعد أكثر من عقد من العمل، نفخر بخدمة آلاف العملاء عبر فروعنا في الخرطوم وبورتسودان وجدة، ونواصل التزامنا بنفس القيم التي بدأنا بها."
            />
          </FadeIn>

          <Stagger className="grid grid-cols-2 gap-5">
            {[
              { value: 15000, suffix: "+", label: "عميل سعيد" },
              { value: 22000, suffix: "+", label: "رحلة مُنجزة" },
              { value: 10, suffix: "+", label: "سنوات خبرة" },
              { value: 3, suffix: "", label: "فروع نشطة" },
            ].map((stat, index) => (
              <FadeIn key={stat.label} delay={index * 0.06}>
                <div className="rounded-3xl border border-border bg-card p-6 text-center shadow-sm">
                  <p className="text-3xl font-extrabold text-primary dark:text-secondary">
                    <CountUp value={stat.value} suffix={stat.suffix} />
                  </p>
                  <span className="mt-1 block text-xs text-muted-foreground">{stat.label}</span>
                </div>
              </FadeIn>
            ))}
          </Stagger>
        </Container>
      </section>

      <section className="bg-section py-24">
        <Container>
          <SectionHeading eyebrow="قيمنا" title="ما الذي يميزنا؟" />
          <Stagger className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((value, index) => (
              <FadeIn key={value.title} delay={index * 0.06}>
                <div className="flex h-full flex-col items-center rounded-3xl border border-border bg-card p-6 text-center shadow-sm">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-secondary">
                    <value.icon className="size-6" />
                  </span>
                  <h3 className="mt-4 text-sm font-bold text-foreground">{value.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{value.description}</p>
                </div>
              </FadeIn>
            ))}
          </Stagger>
        </Container>
      </section>

      <section className="py-24">
        <Container>
          <SectionHeading eyebrow="مسيرتنا" title="محطات في رحلتنا" />
          <div className="relative mt-16">
            <div className="absolute inset-y-0 start-1/2 hidden w-px -translate-x-1/2 bg-border lg:block" />
            <Stagger className="grid gap-8 lg:grid-cols-4">
              {milestones.map((milestone, index) => (
                <FadeIn key={milestone.year} delay={index * 0.08}>
                  <div className="relative rounded-3xl border border-border bg-card p-6 text-center shadow-sm">
                    <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
                      {milestone.year}
                    </span>
                    <h3 className="mt-4 text-sm font-bold text-foreground">{milestone.title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {milestone.description}
                    </p>
                  </div>
                </FadeIn>
              ))}
            </Stagger>
          </div>
        </Container>
      </section>

      <section className="bg-section py-16">
        <Container>
          <FadeIn className="flex flex-wrap items-center justify-center gap-8">
            {siteConfig.branches.map((branch) => (
              <div key={branch} className="flex items-center gap-2 text-sm font-bold text-foreground">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary dark:text-secondary">
                  <MapPin className="size-4" />
                </span>
                فرع {branch}
              </div>
            ))}
            <div className="flex items-center gap-2 text-sm font-bold text-accent-foreground/80 dark:text-accent">
              <Award className="size-4" />
              خبرة تمتد لأكثر من ١٠ سنوات
            </div>
          </FadeIn>
        </Container>
      </section>
    </>
  );
}
