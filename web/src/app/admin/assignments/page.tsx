import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { AssignmentsManager } from "@/components/admin/assignments-manager";

export const metadata: Metadata = { title: "إسناد الطلبات — مركز التحكم — نسائم الحرمين", description: "إسناد الطلبات إلى موظفي العمليات النشطين." };

export default function AdminAssignmentsPage() {
  return <AdminShell title="الإسناد" description="توزيع الطلبات على الموظفين النشطين مع تسجيل التغيير في سجل النشاط."><AssignmentsManager /></AdminShell>;
}
