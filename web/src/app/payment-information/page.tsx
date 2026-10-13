import type { Metadata } from "next";
import { LegalDocument } from "@/components/sections/legal-document";

export const metadata: Metadata = {
  title: "معلومات الدفع",
  description: "كيف تتم عملية الدفع في نسائم الحرمين خطوةً بخطوة.",
};

export default function PaymentInformationPage() {
  return <LegalDocument id="payment" />;
}
