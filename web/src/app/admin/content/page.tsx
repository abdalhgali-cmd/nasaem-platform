import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { ContentManager } from "@/components/admin/content-manager";

export const metadata: Metadata = { title: "المحتوى — مركز التحكم — نسائم الحرمين", description: "إدارة Hero وبطاقات الصفحة الرئيسية من لوحة التحكم." };

export default function AdminContentPage() {
  return <AdminShell title="المحتوى" description="تحكم في المحتوى المدعوم حاليًا دون محرر بصري أو روابط خارجية غير موثوقة."><ContentManager /></AdminShell>;
}
