import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { DocumentsManager } from "@/components/admin/documents-manager";

export const metadata: Metadata = { title: "مستندات العملاء — مركز التحكم — نسائم الحرمين", description: "متابعة metadata مستندات العملاء ضمن الصلاحيات الحالية." };

export default function AdminDocumentsPage() {
  return <AdminShell title="مستندات العملاء" description="متابعة المستندات المستلمة دون كشف روابط عامة أو مسارات تخزين خاصة."><DocumentsManager /></AdminShell>;
}
