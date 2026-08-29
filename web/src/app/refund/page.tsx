import type { Metadata } from "next";
import { LegalPlaceholder } from "@/components/sections/legal-placeholder";

export const metadata: Metadata = {
  title: "سياسة الاسترداد",
  description: "صفحة سياسة الاسترداد في نسائم الحرمين — النص المعتمد سيُنشر قبل الإطلاق العام.",
  robots: { index: false, follow: false },
};

export default function RefundPage() {
  return <LegalPlaceholder title="سياسة الاسترداد" description="سيتم نشر أحكام الاسترداد المعتمدة بعد تحديدها ومراجعتها واعتمادها من الجهة المسؤولة." />;
}
