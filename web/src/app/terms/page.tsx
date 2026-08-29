import type { Metadata } from "next";
import { LegalPlaceholder } from "@/components/sections/legal-placeholder";

export const metadata: Metadata = {
  title: "الشروط والأحكام",
  description: "صفحة الشروط والأحكام في نسائم الحرمين — النص المعتمد سيُنشر قبل الإطلاق العام.",
  robots: { index: false, follow: false },
};

export default function TermsPage() {
  return <LegalPlaceholder title="الشروط والأحكام" description="راجع الشروط الرسمية لاستخدام خدمات نسائم الحرمين بعد اعتمادها ونشرها من الجهة المسؤولة." />;
}
