import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { FadeIn } from "@/components/motion/fade-in";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "ما هي المدة اللازمة لاستخراج تأشيرة العمرة؟",
    answer:
      "عادة ما تستغرق تأشيرة العمرة من ٣ إلى ٧ أيام عمل بعد استكمال المستندات المطلوبة كاملة. قد تختلف المدة في مواسم الذروة مثل رمضان.",
  },
  {
    question: "ما طرق الدفع المتاحة؟",
    answer:
      "نوفر الدفع النقدي في مكاتبنا، التحويل البنكي، وخيارات دفع إلكترونية. كما يمكن ترتيب الدفع على دفعات لبعض الباقات حسب الاتفاق.",
  },
  {
    question: "هل يمكن إلغاء الحجز أو تعديله؟",
    answer:
      "نعم، يمكن تعديل أو إلغاء معظم الحجوزات وفق سياسة كل خدمة (طيران، فندق، تأشيرة). يُرجى التواصل معنا فور الحاجة لأي تعديل لتقليل أي رسوم محتملة.",
  },
  {
    question: "هل تقدمون خدماتكم لمجموعات وشركات؟",
    answer:
      "بالتأكيد، لدينا برامج مخصصة للمجموعات والأفواج وكذلك اتفاقيات خاصة للشركات الراغبة في تنظيم رحلات عمل أو عمرة لموظفيها.",
  },
  {
    question: "ما المستندات المطلوبة لتأشيرة الزيارة العائلية؟",
    answer:
      "تختلف المستندات حسب صلة القرابة (الأم، الأب، الزوجة...) — يشمل ذلك عادة صورة الجواز، الصورة الشخصية، ومستند الدعوة. يمكن التواصل معنا لمعرفة القائمة الدقيقة لحالتك.",
  },
  {
    question: "كيف أتابع حالة طلبي بعد التقديم؟",
    answer:
      "بمجرد استلام طلبك، سيتواصل معك فريقنا بشكل دوري عبر الهاتف أو الواتساب لتحديثك بكل مستجدات الطلب حتى إنجازه بالكامل.",
  },
];

export function Faq() {
  return (
    <section className="bg-section py-24">
      <Container className="max-w-3xl">
        <SectionHeading
          eyebrow="الأسئلة الشائعة"
          title="إجابات على أكثر الأسئلة تكرارًا"
        />

        <FadeIn className="mt-12 rounded-3xl border border-border bg-card px-6 shadow-sm sm:px-8">
          <Accordion type="single" collapsible>
            {faqs.map((faq) => (
              <AccordionItem key={faq.question} value={faq.question}>
                <AccordionTrigger>{faq.question}</AccordionTrigger>
                <AccordionContent>{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </FadeIn>
      </Container>
    </section>
  );
}
