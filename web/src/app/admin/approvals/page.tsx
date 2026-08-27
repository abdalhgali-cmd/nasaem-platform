import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { ApprovalsManager } from "@/components/admin/approvals-manager";

export const metadata: Metadata = { title: "الموافقات — مركز التحكم — نسائم الحرمين", description: "طابور الموافقات التشغيلية ومراجعة المدفوعات." };

export default function AdminApprovalsPage() {
  return <AdminShell title="مركز الموافقات" description="مراجعة المدفوعات وعناصر التشغيل عبر قواعد الخادم الحالية."><ApprovalsManager /></AdminShell>;
}
