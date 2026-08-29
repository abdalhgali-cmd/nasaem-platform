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
    "اطلب برنامج العمرة المناسب لك، وسيراجع فريقنا التفاصيل والتوفر والتكلفة النهائية قبل اعتماد الخطوات التالية.",
};

const steps = [
  { title: "اطلب عرض الباقة", description: "حدد الباقة أو اطلب برنامجًا مخصصًا حسب احتياجك." },
  { title: "أرسل المستندات عند طلبها", description: "شارك المستندات المطلوبة عبر القناة التي يحددها فريقنا." },
  { title: "راجع العرض والتوفر", description: "يراجع الفريق التكلفة والتوفر ثم يرسل لك الخطوات التالية." },
  { title: "أكمل الإجراءات", description: "تصلك المستندات النهائية بعد اعتماد العرض وإكمال المتطلبات." },
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
        title="رحلة عمرة بمتابعة واضحة من الطلب حتى إكمال الإجراءات"
        description="يساعدك فريقنا في ترتيب تفاصيل التأشيرة والطيران والفنادق والنقل، مع مراجعة التوفر والتكلفة قبل الاعتماد."
      />

      <FeaturedUmrah />

      <section className="bg-section py-24">
        <Container>
          <SectionHeading eyebrow="خطوات بسيطة" title="كيف تبدأ طلب باقتك؟" />
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
          <SectionHeading eyebrow="ابدأ طلبك" title="اطلب عرضًا لبرنامج العمرة" />
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
              <a href="#book">ابدأ طلب العمرة</a>
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
