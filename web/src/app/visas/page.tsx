import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { PageHero } from "@/components/sections/page-hero";
import { ServiceIntakeWizard } from "@/components/sections/service-intake-wizard";
import { DynamicVisaCatalog } from "@/components/sections/dynamic-visa-catalog";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "خدمات التأشيرات",
  description: "استعرض أنواع التأشيرات النشطة وتقدم بطلبك عبر بيانات محدثة من كتالوج NASAEM.",
};

export default async function VisasPage({
  searchParams,
}: {
  searchParams: Promise<{ visaType?: string; visaCategory?: string }>;
}) {
  const { visaType, visaCategory } = await searchParams;

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
          <SectionHeading eyebrow="أنواع التأشيرات" title="اختر نوع التأشيرة المناسب لرحلتك" />
          <div className="mt-8 flex justify-center">
            <Link
              href="/visas/egypt-security-approval"
              className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/5 px-5 py-2.5 text-sm font-bold text-accent-foreground/90 transition hover:border-accent hover:bg-accent/10 dark:text-accent"
            >
              الموافقة الأمنية للسفر إلى مصر — صفحة تفصيلية بالخطوات والمستندات
            </Link>
          </div>
          <div className="mt-14"><DynamicVisaCatalog selectedVisaCode={visaType} selectedCategory={visaCategory} /></div>
        </Container>
      </section>

      <section id="book" className="scroll-mt-24 bg-section py-24">
        <Container>
          <SectionHeading eyebrow="التقديم" title="ابدأ طلب التأشيرة" />
          <div className="mt-12"><ServiceIntakeWizard service="visa" initialServiceCode={visaType} visaCategory={visaCategory} /></div>
        </Container>
      </section>

      <section className="bg-gradient-to-b from-primary to-[#0a2f70] py-16 text-white">
        <Container className="flex flex-col items-center gap-6 text-center">
          <h2 className="text-2xl font-extrabold sm:text-3xl">غير متأكد من المستندات المطلوبة لحالتك؟</h2>
          <p className="max-w-lg text-white/75">راسلنا على الواتساب وسيساعدك فريقنا في تحديد المستندات الدقيقة حسب جنسيتك ونوع طلبك.</p>
          <Button asChild variant="gold" size="lg"><a href={`https://wa.me/${siteConfig.whatsapp}`} target="_blank" rel="noopener noreferrer">اسأل عبر واتساب</a></Button>
        </Container>
      </section>
    </>
  );
}
