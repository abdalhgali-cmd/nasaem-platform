import type { Metadata } from "next";
import { LegalDocument } from "@/components/sections/legal-document";

export const metadata: Metadata = {
  title: "سياسة الخصوصية",
  description: "توضح هذه السياسة كيف تجمع «نسائم الحرمين للسفر والسياحة» بياناتك وتستخدمها وتحميها عند استخدامك تطبيقنا أو موقعنا أو التواصل معنا لتقديم طلب سفر.",
};

export default function PrivacyPage() {
  return <LegalDocument id="privacy" />;
}
