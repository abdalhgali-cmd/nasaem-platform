"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RequestConfirmation({ requestId, onNewRequest }: { requestId: string; onNewRequest?: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => { heading.current?.focus(); }, []);

  async function copyReference() {
    try {
      await navigator.clipboard.writeText(requestId);
      setCopyStatus("تم نسخ رقم الطلب");
    } catch {
      setCopyStatus("تعذر النسخ تلقائيًا. يمكنك تحديد رقم الطلب ونسخه يدويًا.");
    }
  }

  return (
    <div className="rounded-3xl border border-success/30 bg-success/5 p-6 text-center sm:p-8">
      <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden="true" />
      <h2 ref={heading} tabIndex={-1} className="mt-4 text-xl font-bold text-foreground">تم استلام طلبك بنجاح</h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">سنراجع التفاصيل ونتواصل معك بشأن التوفر والسعر والخطوة التالية. إرسال الطلب لا يعني تأكيد الحجز أو إتمام الدفع.</p>
      <div className="mt-5 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">رقم الطلب</p>
        <p dir="ltr" className="mt-2 break-all font-mono font-bold text-foreground">{requestId}</p>
        <Button type="button" variant="ghost" className="mt-2" onClick={copyReference}><Copy aria-hidden="true" />نسخ رقم الطلب</Button>
        <p role="status" className="mt-1 text-sm text-muted-foreground">{copyStatus}</p>
      </div>
      <p className="mt-5 text-sm leading-7 text-muted-foreground">للمتابعة، أدخل نفس رقم الهاتف الذي استخدمته في الطلب ثم تحقّق برمز واتساب.</p>
      <Button asChild variant="gold" className="mt-4 w-full"><Link href="/track">تابع طلبك من هنا</Link></Button>
      {onNewRequest ? <Button type="button" variant="outline" className="mt-3 w-full" onClick={onNewRequest}>إرسال طلب آخر</Button> : null}
    </div>
  );
}
