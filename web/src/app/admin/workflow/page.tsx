import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { WorkflowManager } from "@/components/admin/workflow-manager";

export const metadata: Metadata = { title: "سير العمل — مركز التحكم — نسائم الحرمين", description: "خريطة حالات الطلبات وقواعد انتقالها الآمنة." };

export default function AdminWorkflowPage() {
  return <AdminShell title="سير العمل" description="مراحل الطلبات المدعومة حاليًا مع توضيح ما يبقى محميًا في الخادم."><WorkflowManager /></AdminShell>;
}
