import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Container } from "@/components/container";
import { PageHero } from "@/components/sections/page-hero";

export function LegalPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHero eyebrow="معلومات مهمة" breadcrumb={title} title={title} description={description} />
      <section className="py-16 sm:py-24">
        <Container className="max-w-3xl">
          <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-6 sm:p-8" role="status">
            <div className="flex items-start gap-4">
              <AlertTriangle className="mt-1 size-6 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <h2 className="text-xl font-extrabold text-foreground">النص المعتمد قيد الإدخال</h2>
                <p className="mt-3 leading-8 text-muted-foreground">
                  لم يعتمد مالك المنصة أو المراجع القانوني النص النهائي لهذه الصفحة بعد. لا تُعد هذه الصفحة سياسة أو شروطًا نافذة، وسيتم استبدالها بالمحتوى المعتمد قبل الإطلاق العام.
                </p>
                <p className="mt-3 leading-8 text-muted-foreground">
                  إذا كان لديك استفسار عن طلب قائم، تواصل مع الفريق مباشرة عبر صفحة التواصل. لا ترسل مستندات حساسة في الرسائل العامة قبل مراجعة التعليمات المعتمدة.
                </p>
                <Link
                  href="/contact"
                  className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary"
                >
                  تواصل معنا
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
