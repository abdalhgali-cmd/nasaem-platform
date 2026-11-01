import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { CustomerQuickLookup } from "@/components/sections/customer-quick-lookup";
import { OperationsCenter } from "@/components/sections/operations-center";

export const metadata: Metadata = {
  title: "مركز العمليات — نسائم الحرمين",
  description: "لوحة الإدارة الموحدة لوكالة نسائم الحرمين: متابعة الطلبات والإجراء التالي لكل طلب.",
};

// The unified administration dashboard (owner decision 2026-11-01): /admin is
// the one staff entry point, and staff land here after signing in.
export default function AdminHomePage() {
  return <AdminShell><OperationsCenter /><div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8"><CustomerQuickLookup /></div></AdminShell>;
}
