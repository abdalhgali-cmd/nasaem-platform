import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { CaseWorkspace } from "@/components/sections/case-workspace";

export const metadata: Metadata = {
  title: "مساحة عمل الحالات — نسائم الحرمين",
  description: "شاشة عمل موحدة لكل حالة: الجاهزية، المسافرون، المستندات، المهام، والجهة المنفّذة.",
};

export default function CasesPage() {
  return (
    <AdminShell>
      <CaseWorkspace />
    </AdminShell>
  );
}
