import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminToolsIndex } from "@/components/admin/tools/admin-tool-frame";

export const metadata: Metadata = { title: "أدوات الإدارة — نسائم الحرمين" };

export default function AdminToolsPage() {
  return (
    <AdminShell title="أدوات الإدارة" description="السجلات والإعدادات التشغيلية الأخرى للوكالة، ضمن لوحة الإدارة الموحدة.">
      <AdminToolsIndex />
    </AdminShell>
  );
}
