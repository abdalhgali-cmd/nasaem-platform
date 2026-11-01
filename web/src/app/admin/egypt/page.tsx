import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { EgyptQueue } from "@/components/admin/egypt/egypt-queue";

export const metadata: Metadata = {
  title: "الموافقة الأمنية لمصر — نسائم الحرمين",
  description: "جدول سفر طلبات الموافقة الأمنية لمصر ومراحلها والإجراء التالي لكل طلب.",
};

export default function EgyptQueuePage() {
  return <AdminShell><EgyptQueue /></AdminShell>;
}
