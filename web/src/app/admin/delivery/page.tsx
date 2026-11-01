"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { CaseWorkflowPanel } from "@/components/sections/case-workflow-panel";

function DeliveryContent() {
  const params = useSearchParams();
  const requestId = params.get("requestId") || "";
  const reference = params.get("reference") || requestId;

  if (!requestId) {
    return (
      <div className="bg-section p-8">
        <div className="mx-auto max-w-3xl rounded-3xl border bg-card p-8 text-center">
          <h1 className="text-2xl font-black">التسليم النهائي</h1>
          <p className="mt-3 text-sm text-muted-foreground">افتح هذه الصفحة من طلب محدد لإرفاق التذكرة أو التأشيرة أو القسيمة.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-section py-10">
      <div className="mx-auto max-w-3xl px-4">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <h1 className="text-2xl font-black">التسليم النهائي</h1>
          <p className="mt-2 text-sm text-muted-foreground">الطلب: {reference}</p>
          <div className="mt-4"><CaseWorkflowPanel caseId={requestId} onChanged={() => undefined} /></div>
        </div>
      </div>
    </div>
  );
}

export default function DeliveryPage() {
  return (
    <AdminShell>
    <Suspense
      fallback={
        <div className="bg-section p-8">
          <div className="mx-auto max-w-3xl rounded-3xl border bg-card p-8 text-center">
            <h1 className="text-2xl font-black">التسليم النهائي</h1>
            <p className="mt-3 text-sm text-muted-foreground">جاري تحميل الطلب...</p>
          </div>
        </div>
      }
    >
      <DeliveryContent />
    </Suspense>
    </AdminShell>
  );
}
