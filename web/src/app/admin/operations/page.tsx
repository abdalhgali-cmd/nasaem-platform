import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { CustomerQuickLookup } from "@/components/sections/customer-quick-lookup";
import { OperationsCenter } from "@/components/sections/operations-center";

export const metadata: Metadata = {
  title: "مركز العمليات — نسائم الحرمين",
  description: "لوحة تشغيل موحدة لمتابعة طلبات وكالة نسائم الحرمين والإجراء التالي لكل طلب.",
};

export default function OperationsPage() {
  return <AdminShell><OperationsCenter /><div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8"><CustomerQuickLookup /></div></AdminShell>;
}
