import type { Metadata } from "next";
import { LegalDocument } from "@/components/sections/legal-document";

export const metadata: Metadata = {
  title: "سياسة الإلغاء",
  description: "توضح هذه الصفحة كيفية إلغاء الطلب وما يترتب عليه.",
};

export default function CancellationPage() {
  return <LegalDocument id="cancellation" />;
}
