import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { ReportsDashboard } from "@/components/admin/reports-dashboard";

export const metadata: Metadata = { title: "التقارير — مركز التحكم — نسائم الحرمين", description: "تقارير مالية وتشغيلية تفاعلية لوكالة نسائم الحرمين." };

export default function AdminReportsPage() {
  return <AdminShell title="التقارير" description="تابع الإيرادات والتحصيل والطلبات، وقارن الأداء حسب الخدمة أو الموظف أو المورد."><ReportsDashboard /></AdminShell>;
}
