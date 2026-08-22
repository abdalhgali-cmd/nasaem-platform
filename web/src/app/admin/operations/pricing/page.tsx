import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calculator } from "lucide-react";
import { OperationsPricingPanel } from "@/components/sections/operations-pricing-panel";

export const metadata: Metadata = {
  title: "التسعير — مركز العمليات — نسائم الحرمين",
  description: "تسعير موحد للعروض والفواتير داخل مركز العمليات.",
};

type Props = {
  searchParams: Promise<{ requestId?: string; reference?: string }>;
};

export default async function PricingPage({ searchParams }: Props) {
  const params = await searchParams;
  const requestId = params.requestId?.trim() || "";
  const reference = params.reference?.trim() || requestId;

  return (
    <main className="min-h-screen bg-section py-8 sm:py-10">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-muted-foreground">نسائم الحرمين</p>
              <h1 className="mt-1 flex items-center gap-2 text-2xl font-black sm:text-3xl"><Calculator className="size-6 text-primary" /> مساحة التسعير</h1>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">احسب السعر من تكلفة المورد وسعر الصرف والهامش، ثم أنشئ فاتورة أو عرضًا للعميل.</p>
            </div>
            <Link href="/admin/operations" className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-bold"><ArrowRight className="size-4" />العودة للتشغيل</Link>
          </div>

          {requestId ? (
            <OperationsPricingPanel requestId={requestId} reference={reference} />
          ) : (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-900">
              لم يتم تحديد رقم الطلب. افتح هذه الصفحة من طلب داخل مركز العمليات.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
