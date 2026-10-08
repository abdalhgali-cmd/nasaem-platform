import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { NotificationsManager } from "@/components/admin/notifications-manager";

export const metadata: Metadata = { title: "الإشعارات — مركز التحكم — نسائم الحرمين", description: "إشعاراتك الشخصية: إسناد طلب، تغيير حالة، أو دفعة جديدة." };

export default function AdminNotificationsPage() {
  return <AdminShell title="الإشعارات" description="كل الإشعارات الموجهة لحسابك."><NotificationsManager /></AdminShell>;
}
