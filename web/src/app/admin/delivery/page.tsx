"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OperationsDeliverablePanel } from "@/components/sections/operations-deliverable-panel";

function DeliveryContent() {
  const params = useSearchParams();
  const requestId = params.get("requestId") || "";
  const reference = params.get("reference") || requestId;

  if (!requestId) {
    return (
      <main className="min-h-screen bg-section p-8">
        <div className="mx-auto max-w-3xl rounded-3xl border bg-card p-8 text-center">
          <h1 className="text-2xl font-black">التسليم النهائي</h1>
          <p className="mt-3 text-sm text-muted-foreground">افتح هذه الصفحة من طلب محدد لإرفاق التذكرة أو التأشيرة أو القسيمة.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-section py-10">
      <div className="mx-auto max-w-3xl px-4">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <h1 className="text-2xl font-black">التسليم النهائي</h1>
          <p className="mt-2 text-sm text-muted-foreground">الطلب: {reference}</p>
          <OperationsDeliverablePanel requestId={requestId} reference={reference} />
        </div>
      </div>
    </main>
  );
}

export default function DeliveryPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-section p-8">
          <div className="mx-auto max-w-3xl rounded-3xl border bg-card p-8 text-center">
            <h1 className="text-2xl font-black">التسليم النهائي</h1>
            <p className="mt-3 text-sm text-muted-foreground">جاري تحميل الطلب...</p>
          </div>
        </main>
      }
    >
      <DeliveryContent />
    </Suspense>
  );
}
