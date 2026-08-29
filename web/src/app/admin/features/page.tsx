import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { FeatureFlagsManager } from "@/components/admin/feature-flags-manager";

export const metadata: Metadata = { title: "الخصائص — مركز التحكم — نسائم الحرمين", description: "إدارة feature flags التشغيلية من الخادم." };

export default function AdminFeaturesPage() {
  return <AdminShell title="الخصائص التشغيلية" description="تحكم في مفاتيح الخصائص المسبقة مع تطبيق التحقق الخادمي."><FeatureFlagsManager /></AdminShell>;
}
