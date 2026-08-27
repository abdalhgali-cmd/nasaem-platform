import type { Metadata } from "next";
import { LegalPlaceholder } from "@/components/sections/legal-placeholder";

export const metadata: Metadata = {
  title: "معلومات الدفع",
  description: "صفحة معلومات الدفع في نسائم الحرمين — التعليمات المعتمدة ستُنشر قبل الإطلاق العام.",
  robots: { index: false, follow: false },
};

export default function PaymentInformationPage() {
  return <LegalPlaceholder title="معلومات الدفع" description="سيتم نشر طرق الدفع وخطوات مراجعة التحويل والإيصالات بعد اعتمادها رسميًا. لا يُعد إرسال الطلب تأكيدًا نهائيًا للحجز." />;
}
