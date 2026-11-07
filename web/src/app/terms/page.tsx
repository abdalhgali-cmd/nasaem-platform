import type { Metadata } from "next";
import { LegalDocument } from "@/components/sections/legal-document";

export const metadata: Metadata = {
  title: "الشروط والأحكام",
  description: "باستخدامك تطبيق «نسائم الحرمين للسفر والسياحة» أو موقعها وتقديم طلب عبرهما، فإنك توافق على الشروط الآتية.",
};

export default function TermsPage() {
  return <LegalDocument id="terms" />;
}
