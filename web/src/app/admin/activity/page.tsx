import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { ActivityLogManager } from "@/components/admin/activity-log-manager";

export const metadata: Metadata = { title: "سجل النشاط — مركز التحكم — نسائم الحرمين", description: "مراجعة تغييرات الإدارة المسجلة والمنقحة." };

export default function AdminActivityPage() {
  return <AdminShell title="سجل النشاط" description="مراجعة تغييرات الإدارة الموثقة دون عرض الأسرار أو البيانات الحساسة."><ActivityLogManager /></AdminShell>;
}
