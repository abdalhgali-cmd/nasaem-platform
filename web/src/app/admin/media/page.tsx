import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { MediaManager } from "@/components/admin/media-manager";

export const metadata: Metadata = { title: "الوسائط — مركز التحكم — نسائم الحرمين", description: "إدارة الأصول العامة والمعاينات الآمنة." };

export default function AdminMediaPage() {
  return <AdminShell title="مكتبة الوسائط" description="رفع ومعاينة الأصول العامة فقط، مع عدم كشف مستندات العملاء الخاصة."><MediaManager /></AdminShell>;
}
