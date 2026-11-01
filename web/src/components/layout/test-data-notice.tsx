"use client";

import * as React from "react";
import { API_URL } from "@/lib/api-url";

// Outside the production deployment the service prices and exchange rates are
// development/test data (owner decision 2026-11-01). The API says which kind
// of deployment it is (/health → pricesAreTestData); production never shows
// this strip, and nothing is shown while the answer is unknown.
let cached: Promise<boolean> | null = null;

function loadTestDataFlag() {
  if (!cached) {
    cached = fetch(`${API_URL}/health`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => body?.pricesAreTestData === true)
      .catch(() => false);
  }
  return cached;
}

export function TestDataNotice({ audience }: { audience: "customer" | "staff" }) {
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    void loadTestDataFlag().then((value) => { if (active) setShow(value); });
    return () => { active = false; };
  }, []);
  if (!show) return null;
  return (
    <div role="status" data-testid="test-data-notice" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-xs font-bold leading-6 text-amber-900">
      {audience === "staff"
        ? "بيئة اختبار: الأسعار وأسعار الصرف بيانات تجريبية وليست أسعارًا نهائية، ويمكن تعديلها من «الأسعار والباقات» و«التأشيرات»."
        : "نسخة تجريبية: الأسعار المعروضة للتجربة فقط وليست أسعارًا نهائية."}
    </div>
  );
}
