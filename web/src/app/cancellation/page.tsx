import type { Metadata } from "next";
import { LegalPlaceholder } from "@/components/sections/legal-placeholder";

export const metadata: Metadata = {
  title: "سياسة الإلغاء",
  description: "صفحة سياسة الإلغاء في نسائم الحرمين — النص المعتمد سيُنشر قبل الإطلاق العام.",
  robots: { index: false, follow: false },
};

export default function CancellationPage() {
  return <LegalPlaceholder title="سياسة الإلغاء" description="سيتم نشر أحكام الإلغاء المعتمدة لكل خدمة بعد مراجعة المالك والمراجع القانوني." />;
}
