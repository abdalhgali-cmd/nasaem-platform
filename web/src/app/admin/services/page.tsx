import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { ServiceManager } from "@/components/admin/service-manager";

export const metadata: Metadata = { title: "الخدمات — مركز التحكم — نسائم الحرمين", description: "إدارة الخدمات والكتالوج العام من لوحة التحكم." };

export default function AdminServicesPage() {
  return <AdminShell title="الخدمات" description="أنشئ أو حدّث الخدمات التي يراها العملاء، مع الحفاظ على قواعد المتطلبات والتسعير الحالية."><ServiceManager /></AdminShell>;
}
