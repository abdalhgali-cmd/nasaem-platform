import { ClipboardCheck, FileCheck2, MessageCircle, SearchCheck } from "lucide-react";
import { Container } from "@/components/container";
import { GradientBackdrop } from "@/components/decorative/gradient-backdrop";
import { FadeIn, Stagger } from "@/components/motion/fade-in";

export type HighlightItem = {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
};

const defaultSteps = [
  { icon: ClipboardCheck, label: "أرسل طلبك", description: "ابدأ ببيانات الخدمة أو الوجهة التي تحتاجها." },
  { icon: SearchCheck, label: "نراجع التوفر", description: "يتحقق الفريق من التفاصيل قبل تقديم العرض." },
  { icon: MessageCircle, label: "يصلك التحديث", description: "نوضح العرض والخطوة التالية عبر قنوات التواصل." },
  { icon: FileCheck2, label: "نُتابع التنفيذ", description: "تستمر المتابعة حتى المعالجة والتسليم المتاح." },
];

export function Stats({ items = [] }: { items?: HighlightItem[] }) {
  const publishedItems = items.length ? items : defaultSteps.map((step, index) => ({ id: step.label, title: step.label, description: step.description, sortOrder: index }));

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-primary to-[#0a2f70] py-20 text-white">
      <GradientBackdrop variant="dark" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold text-secondary">كيف تسير الخدمة؟</p>
          <h2 className="mt-2 text-2xl font-black sm:text-3xl">مسار واضح من الطلب إلى المتابعة</h2>
        </div>
        <Stagger className="mt-10 grid grid-cols-2 gap-8 lg:grid-cols-4">
          {publishedItems.sort((a, b) => a.sortOrder - b.sortOrder).map((item, index) => (
            <FadeIn key={item.id} delay={index * 0.08} className="text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white/10 text-accent">
                {(() => {
                  const Icon = [ClipboardCheck, SearchCheck, MessageCircle, FileCheck2][index % 4];
                  return <Icon className="size-7" />;
                })()}
              </span>
              <h3 className="mt-4 text-sm font-extrabold">{item.title}</h3>
              <p className="mt-2 text-xs leading-6 text-white/75">{item.description}</p>
            </FadeIn>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}
