import type { Metadata } from "next";
import { LegalDocument } from "@/components/sections/legal-document";

export const metadata: Metadata = {
  title: "سياسة الاسترداد",
  description: "توضح هذه الصفحة كيف نتعامل مع طلبات الاسترداد بعد الدفع.",
};

export default function RefundPage() {
  return <LegalDocument id="refund" />;
}
