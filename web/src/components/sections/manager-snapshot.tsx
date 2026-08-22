"use client";

import * as React from "react";
import { BarChart3, CreditCard, FileText, ShoppingBag, Users, WalletCards } from "lucide-react";
import { API_URL } from "@/lib/api-url";

type DashboardStats = {
  customers: number;
  orders: number;
  payments: number;
  offers: number;
  documents: number;
  users: number;
};

const cards = [
  { key: "orders", label: "الطلبات", icon: ShoppingBag },
  { key: "customers", label: "العملاء", icon: Users },
  { key: "payments", label: "عمليات الدفع", icon: CreditCard },
  { key: "documents", label: "المستندات", icon: FileText },
  { key: "offers", label: "العروض", icon: WalletCards },
  { key: "users", label: "المستخدمون", icon: BarChart3 },
] as const;

export function ManagerSnapshot() {
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let active = true;
    fetch(`${API_URL}/dashboard/stats`, { credentials: "include" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success) throw new Error(payload?.message || "تعذر تحميل ملخص المدير");
        return payload.data as DashboardStats;
      })
      .then((data) => { if (active) setStats(data); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "تعذر تحميل ملخص المدير"); });
    return () => { active = false; };
  }, []);

  return (
    <section className="mx-auto mt-6 max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-muted-foreground">للإدارة</p>
            <h2 className="mt-1 text-xl font-black">ملخص التشغيل</h2>
          </div>
          <span className="text-xs text-muted-foreground">بيانات النظام الحالية</span>
        </div>
        {error ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">{error}</div> : null}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {cards.map(({ key, label, icon: Icon }) => (
            <div key={key} className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-4" /></div>
              <p className="mt-3 text-xs font-bold text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-black">{stats?.[key] ?? "—"}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
