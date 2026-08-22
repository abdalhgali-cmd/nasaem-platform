import type { Metadata } from "next";
import { FileImage, IdCard, MessageSquareText, Phone, Users } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { PageHero } from "@/components/sections/page-hero";
import { FeaturedUmrah } from "@/components/sections/featured-umrah";
import { UmrahBookingSection } from "@/components/sections/umrah-booking-section";
import { FadeIn, Stagger } from "@/components/motion/fade-in";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "باقات العمرة",
  description:
    "باقات عمرة متكاملة: تأشيرة فقط، عمرة مع الخدمات، أو عمرة جماعية ضمن أفواج منظمة — احجز رحلتك إلى بيت الله الحرام بثقة.",
};

const steps = [
  { title: "اختر باقتك", description: "حدد نوع الباقة المناسبة لك من بين خياراتنا المتعددة." },
  { title: "أرسل مستنداتك", description: "شارك المستندات المطلوبة معنا عبر الواتساب أو مكاتبنا." },
  { title: "تأكيد الحجز", description: "نؤكد لك تفاصيل الحجز والدفع خلال ٢٤ ساعة." },
  { title: "استلم تأشيرتك", description: "تصلك التأشيرة وكل التفاصيل جاهزة قبل موعد السفر." },
];

const documents = [
  { icon: FileImage, label: "صورة الجواز ساري المفعول" },
  { icon: IdCard, label: "الصورة الشخصية الحديثة" },
  { icon: Users, label: "بيانات المرافقين (إن وجدوا)" },
  { icon: MessageSquareText, label: "رقم التواصل الفعّال" },
];

export default function UmrahPage() {
  return (
    <>
      <PageHero
        eyebrow="خدمات العمرة"
        breadcrumb="العمرة"
        title="رحلة عمرة بلا تعقيد، من الحجز حتى العودة"
        description="نتولى كل التفاصيل: التأشيرة، الطيران، الفنادق القريبة من الحرمين، والنقل — لتتفرغ أنت للعبادة فقط."
      />

      <FeaturedUmrah />

      <section className="bg-section py-24">
        <Container>
          <SectionHeading eyebrow="خطوات بسيطة" title="كيف تحجز باقتك؟" />
          <Stagger className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <FadeIn key={step.title} delay={index * 0.06}>
                <div className="relative rounded-3xl border border-border bg-card p-6 shadow-sm">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-sm font-extrabold text-primary-foreground">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-base font-bold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                </div>
              </FadeIn>
            ))}
          </Stagger>
        </Container>
      </section>

      <section className="py-24">
        <Container className="grid items-center gap-14 lg:grid-cols-2">
          <FadeIn>
            <SectionHeading
              align="start"
              eyebrow="المستندات المطلوبة"
              title="جهّز هذه المستندات مسبقًا لتسريع الإجراءات"
              description="القائمة الأساسية لكل الباقات — قد تختلف بعض التفاصيل حسب جنسيتك وحالتك."
            />
          </FadeIn>
          <Stagger className="grid gap-4 sm:grid-cols-2">
            {documents.map((doc, index) => (
              <FadeIn key={doc.label} delay={index * 0.06}>
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:text-secondary">
                    <doc.icon className="size-5" />
                  </span>
                  <span className="text-sm font-semibold text-foreground/85">{doc.label}</span>
                </div>
              </FadeIn>
            ))}
          </Stagger>
        </Container>
      </section>

      <section id="book" className="scroll-mt-24 py-24">
        <Container>
          <SectionHeading eyebrow="احجز الآن" title="ابدأ طلب العمرة" />
          <div className="mt-12">
            <UmrahBookingSection />
          </div>
        </Container>
      </section>

      <section className="bg-gradient-to-b from-primary to-[#0a2f70] py-16 text-white">
        <Container className="flex flex-col items-center gap-6 text-center">
          <h2 className="text-2xl font-extrabold sm:text-3xl">لديك استفسار عن باقات العمرة؟</h2>
          <p className="max-w-lg text-white/75">
            فريقنا جاهز للإجابة على كل أسئلتك ومساعدتك في اختيار الباقة الأنسب لك ولعائلتك.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button asChild variant="gold" size="lg">
              <a href="#book">ابدأ الحجز الآن</a>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-white/30 text-white hover:bg-white/10 hover:border-white">
              <a href={`https://wa.me/${siteConfig.whatsapp}`} target="_blank" rel="noopener noreferrer">
                <Phone className="size-4" />
                تواصل واتساب
              </a>
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}
