import type { Metadata } from "next";
import { CustomerQuickLookup } from "@/components/sections/customer-quick-lookup";
import { ManagerSnapshot } from "@/components/sections/manager-snapshot";
import { OperationsCenter } from "@/components/sections/operations-center";

export const metadata: Metadata = {
  title: "مركز العمليات — نسائم الحرمين",
  description: "لوحة تشغيل موحدة لمتابعة طلبات وكالة نسائم الحرمين والإجراء التالي لكل طلب.",
};

export default function OperationsPage() {
  return (
    <>
      <OperationsCenter />
      <CustomerQuickLookup />
      <ManagerSnapshot />
    </>
  );
}
