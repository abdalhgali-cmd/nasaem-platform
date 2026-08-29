import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { SettingsManager } from "@/components/admin/settings-manager";

export const metadata: Metadata = { title: "إعدادات الموقع — مركز التحكم — نسائم الحرمين", description: "إدارة بيانات التواصل والشبكات الاجتماعية وSEO العامة." };

export default function AdminSettingsPage() {
  return <AdminShell title="إعدادات الموقع" description="معلومات التواصل والشبكات وSEO العامة، مع إبقاء الأسرار خارج لوحة CMS."><SettingsManager /></AdminShell>;
}
