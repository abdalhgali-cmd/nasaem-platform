import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { StaffUsersManager } from "@/components/admin/staff-users-manager";

export const metadata: Metadata = {
  title: "المستخدمون — مركز التحكم — نسائم الحرمين",
  description: "إدارة حسابات موظفي نسائم الحرمين وأدوارهم وحالاتهم.",
};

export default function AdminUsersPage() {
  return <AdminShell title="المستخدمون" description="إدارة الموظفين والحسابات الداخلية من خلال الصلاحيات الحالية."><StaffUsersManager /></AdminShell>;
}
