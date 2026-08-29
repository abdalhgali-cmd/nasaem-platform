import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { PricingManager } from "@/components/admin/pricing-manager";

export const metadata: Metadata = { title: "الأسعار والباقات — مركز التحكم — نسائم الحرمين", description: "إدارة أسعار الباقات والكوبونات والخصومات والعروض." };

export default function AdminPricingPage() {
  return <AdminShell title="الأسعار والباقات" description="عدّل أسعار الباقات يدويًا واربطها بالكوبونات والخصومات، دون تغيير إجماليات الطلبات السابقة."><PricingManager /></AdminShell>;
}

