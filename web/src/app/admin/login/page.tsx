import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminLoginForm } from "@/components/admin/admin-login-form";

export const metadata: Metadata = {
  title: "دخول الموظفين — نسائم الحرمين",
  description: "تسجيل دخول موظفي وكالة نسائم الحرمين إلى لوحة الإدارة.",
};

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--nh-sidebar-bg)] px-4 py-10" dir="rtl">
      <Suspense fallback={null}><AdminLoginForm /></Suspense>
    </main>
  );
}
