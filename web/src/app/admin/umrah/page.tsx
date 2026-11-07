import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { UmrahQueue } from "@/components/admin/umrah/umrah-queue";

export const metadata: Metadata = {
  title: "طلبات العمرة — نسائم الحرمين",
  description: "طلبات العمرة ومراحلها والإجراء التالي لكل طلب. المجموعات والباقات في /admin/umrah/groups.",
};

export default function AdminUmrahPage() {
  return <AdminShell><UmrahQueue /></AdminShell>;
}
