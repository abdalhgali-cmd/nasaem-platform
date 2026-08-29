import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { UmrahManager } from "@/components/admin/umrah-manager";
import { UmrahPackageManager } from "@/components/admin/umrah-package-manager";

export const metadata: Metadata = { title: "مجموعات العمرة — مركز التحكم — نسائم الحرمين", description: "إدارة مجموعات العمرة والجاهزية التشغيلية." };

export default function AdminUmrahPage() {
  return <AdminShell title="إدارة العمرة" description="أنشئ مجموعات تشغيلية واربطها بالعملاء والطلبات الحالية دون اختراع مخزون أو نظام حجوزات غير موجود."><UmrahManager /><div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-10"><UmrahPackageManager /></div></AdminShell>;
}
