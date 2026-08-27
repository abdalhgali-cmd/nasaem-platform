import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { PricingManager } from "@/components/admin/pricing-manager";

export const metadata: Metadata = { title: "الأسعار والعروض — مركز التحكم — نسائم الحرمين", description: "إدارة الأسعار الحالية والعروض مع حماية القيم التاريخية للطلبات." };

export default function AdminPricingPage() {
  return <AdminShell title="الأسعار والعروض" description="تحديث الأسعار الحالية وإدارة دورة العروض دون تعديل إجماليات الطلبات السابقة."><PricingManager /></AdminShell>;
}
