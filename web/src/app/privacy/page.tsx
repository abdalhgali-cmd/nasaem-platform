import type { Metadata } from "next";
import { LegalPlaceholder } from "@/components/sections/legal-placeholder";

export const metadata: Metadata = {
  title: "سياسة الخصوصية",
  description: "صفحة سياسة الخصوصية في نسائم الحرمين — النص المعتمد سيُنشر قبل الإطلاق العام.",
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return <LegalPlaceholder title="سياسة الخصوصية" description="تعرف على كيفية التعامل مع البيانات عند اعتماد النص الرسمي من مالك المنصة والمراجع القانوني." />;
}
