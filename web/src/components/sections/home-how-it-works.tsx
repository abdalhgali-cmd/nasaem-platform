import { ClipboardCheck, CreditCard, LayoutGrid, Search, type LucideIcon } from "lucide-react";
import { Container } from "@/components/container";

// The four steps every request goes through on this site, in the order the
// customer meets them. Statements of how the flow works, not marketing claims.
const steps: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: LayoutGrid, title: "اختر الخدمة", body: "العمرة، الموافقة الأمنية لمصر، أو أي خدمة منشورة في الدليل." },
  { icon: ClipboardCheck, title: "أكمل بياناتك ومستنداتك", body: "بيانات المسافرين والمستندات المطلوبة تُرفع داخل الطلب نفسه." },
  { icon: CreditCard, title: "راجع السعر ثم ادفع", body: "يظهر لك السعر النهائي قبل الدفع، ثم ترفع إيصال التحويل." },
  { icon: Search, title: "تابع حالة طلبك", body: "برقم هاتفك من صفحة تتبع الطلب، حتى استلام النتيجة." },
];

export function HomeHowItWorks() {
  return (
    <section className="bg-section py-16 sm:py-20" aria-labelledby="how-it-works-title">
      <Container>
        <div className="max-w-2xl">
          <p className="eyebrow">كيف يتم الطلب</p>
          <h2 id="how-it-works-title" className="mt-3 text-2xl font-extrabold leading-snug text-foreground sm:text-3xl">
            أربع خطوات من الاختيار إلى الاستلام
          </h2>
        </div>

        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ icon: Icon, title, body }, index) => (
            <li key={title} className="relative rounded-3xl border border-border bg-card p-6 shadow-card">
              <div className="flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/[0.07] text-primary dark:bg-secondary/10 dark:text-secondary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span aria-hidden className="text-3xl font-black tabular-nums text-foreground/[0.08]" dir="ltr">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-5 text-base font-extrabold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
