import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { VisaManager } from "@/components/admin/visa-manager";

export const metadata: Metadata = { title: "التأشيرات والمتطلبات — مركز التحكم — نسائم الحرمين", description: "إدارة أنواع التأشيرات وتصنيفاتها وقوائم المتطلبات." };

export default function AdminVisasPage() {
  return <AdminShell title="التأشيرات والمتطلبات" description="تحكم في التأشيرات وقوائم المتطلبات مع استمرار الفلترة الخادمية وحماية snapshots التاريخية."><VisaManager /></AdminShell>;
}
