import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { FadeIn } from "@/components/motion/fade-in";
import { LegalDisclosure } from "@/components/legal-disclosure";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
};

export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <section className="bg-section py-24">
      <Container className="max-w-3xl">
        <SectionHeading
          eyebrow="الأسئلة الشائعة"
          title="معلومات واضحة قبل بدء الطلب"
          description={items.length ? "إجابات معتمدة ومحدثة حسب المحتوى المنشور من الإدارة." : "نعمل على إعداد إجابات معتمدة ومحدثة لكل خدمة."}
        />

        <FadeIn className="mt-12 rounded-3xl border border-border bg-card px-6 py-7 shadow-sm sm:px-8">
          {items.length ? (
            <Accordion type="single" collapsible>
              {items.map((item) => (
                <AccordionItem key={item.id} value={item.id}>
                  <AccordionTrigger>{item.question}</AccordionTrigger>
                  <AccordionContent>{item.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <div className="rounded-2xl border border-accent/30 bg-accent/5 p-5 text-sm leading-7 text-foreground">
              <h2 className="font-black">المحتوى التفصيلي بانتظار الاعتماد</h2>
              <p className="mt-2 text-muted-foreground">
                تختلف المستندات والتكلفة والتوفر والخطوات التالية حسب نوع الخدمة وحالة الطلب. سيعرض الفريق التفاصيل المناسبة بعد مراجعة البيانات، ولا تمثل هذه الصفحة سياسة دفع أو إلغاء أو استرداد نافذة قبل اعتماد النصوص الرسمية.
              </p>
              <LegalDisclosure />
            </div>
          )}
        </FadeIn>
      </Container>
    </section>
  );
}
