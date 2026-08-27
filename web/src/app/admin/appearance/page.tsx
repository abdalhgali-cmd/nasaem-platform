import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { AppearanceManager } from "@/components/admin/appearance-manager";

export const metadata: Metadata = { title: "المظهر — مركز التحكم — نسائم الحرمين", description: "إدارة ألوان وهوية واجهة NASAEM ضمن قيم آمنة." };

export default function AdminAppearancePage() {
  return <AdminShell title="المظهر" description="تحرير ألوان الواجهة من خلال design tokens الآمنة فقط."><AppearanceManager /></AdminShell>;
}
