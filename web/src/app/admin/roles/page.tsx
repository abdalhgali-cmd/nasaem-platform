import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { RolesPermissions } from "@/components/admin/roles-permissions";

export const metadata: Metadata = { title: "الأدوار والصلاحيات — مركز التحكم — نسائم الحرمين", description: "عرض أدوار موظفي نسائم الحرمين وحدود الصلاحيات الخادمية." };

export default function AdminRolesPage() {
  return <AdminShell title="الأدوار والصلاحيات" description="نموذج RBAC الحالي مع ضوابط الخادم الواضحة لكل دور."><RolesPermissions /></AdminShell>;
}
