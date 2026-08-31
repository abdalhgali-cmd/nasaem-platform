import type { Metadata } from "next";
import { ClipboardCheck, FileText, HeartHandshake, MapPin, MessageCircle, ShieldCheck, Sparkles, Target } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { PageHero } from "@/components/sections/page-hero";
import { FadeIn, Stagger } from "@/components/motion/fade-in";
import { siteConfig } from "@/lib/site-config";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  path: "/about",
  title: "من نحن",
  description: "تعرّف على طريقة عمل نسائم الحرمين في تنظيم طلبات السفر والتأشيرات والعمرة بوضوح ومتابعة مباشرة.",
});

const values = [
  { icon: ShieldCheck, title: "وضوح الإجراءات", description: "نوضح الخطوات والمستندات والتكلفة المنشورة قبل بدء الطلب." },
  { icon: Target, title: "مراجعة دقيقة", description: "يراجع الفريق تفاصيل الطلب والتوفر قبل تقديم عرض أو متابعة الإجراء." },
  { icon: HeartHandshake, title: "تواصل مباشر", description: "يمكنك متابعة طلبك والتواصل مع فريق الدعم عبر القنوات المتاحة." },
  { icon: Sparkles, title: "تنظيم المتابعة", description: "يظهر لكل طلب مرجع وحالة وخطوة تالية كلما توفرت معلومات جديدة." },
];

const workflow = [
  { icon: FileText, step: "١", title: "تقديم الطلب", description: "أرسل بيانات الخدمة أو الوجهة والمعلومات اللازمة لمراجعة أولية." },
  { icon: ClipboardCheck, step: "٢", title: "مراجعة التوفر", description: "يتحقق الفريق من التفاصيل والتوفر قبل إعداد عرض مناسب للحالة." },
  { icon: MessageCircle, step: "٣", title: "العرض والتأكيد", description: "يصلك العرض أو التحديث عبر قنوات التواصل، ثم تحدد الإجراء التالي." },
  { icon: HeartHandshake, step: "٤", title: "المتابعة والتسليم", description: "تستمر المتابعة حتى إكمال المعالجة وتسليم المستندات أو النتائج المتاحة." },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="من نحن"
        breadcrumb="من نحن"
        title="خدمات سفر منظمة وواضحة"
        description={`${siteConfig.name} تساعدك على تقديم طلبات السفر والتأشيرات والعمرة ومتابعتها من خلال مسار واضح وتواصل مباشر.`}
      />

      <section className="py-24">
        <Container className="grid items-center gap-14 lg:grid-cols-2">
          <FadeIn>
            <SectionHeading
              align="start"
              eyebrow="طريقة عملنا"
              title="نعمل معك خطوة بخطوة"
              description="يبدأ التعامل بطلب واضح، ثم مراجعة للتفاصيل والتوفر، ثم عرض أو تحديث مناسب للحالة. لا نعرض توفرًا حيًا أو تأكيدًا تلقائيًا إلا إذا كان مدعومًا من النظام ومصدر الخدمة. يمكنك استخدام رقم الطلب أو حسابك لمتابعة الحالة ومعرفة الخطوة التالية."
            />
          </FadeIn>

          <Stagger className="grid grid-cols-2 gap-5">
            {workflow.map((item, index) => (
              <FadeIn key={item.step} delay={index * 0.06}>
                <div className="rounded-3xl border border-border bg-card p-6 text-center shadow-sm">
                  <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
                    {item.step}
                  </span>
                  <h3 className="mt-4 text-sm font-bold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                </div>
              </FadeIn>
            ))}
          </Stagger>
        </Container>
      </section>

      <section className="bg-section py-24">
        <Container>
          <SectionHeading eyebrow="قيم الخدمة" title="ما الذي نحرص عليه؟" />
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

      <section className="py-16">
        <Container>
          <FadeIn className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-7 text-center shadow-sm">
            <MapPin className="mx-auto size-7 text-primary dark:text-secondary" />
            <h2 className="mt-4 text-xl font-black">تحتاج إلى مساعدة؟</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">تواصل معنا قبل إرسال بياناتك إذا كنت تحتاج إلى معرفة المستندات أو الخطوة المناسبة لطلبك.</p>
          </FadeIn>
        </Container>
      </section>
    </>
  );
}
