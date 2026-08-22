"use client";

import * as React from "react";
import Link from "next/link";
import { Search, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";

type Customer = {
  id: string;
  customerNo: string;
  fullName: string;
  passportNo: string;
  nationality: string;
  birthDate?: string | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  country?: string | null;
  city?: string | null;
  orders?: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: string | number;
    currency: string;
    createdAt: string;
    items?: Array<{ service?: { name?: string | null } | null }>;
  }>;
};

const statusLabel: Record<string, string> = {
  NEW: "جديد",
  UNDER_REVIEW: "قيد المراجعة",
  WAITING_DOCUMENTS: "بانتظار المستندات",
  PAYMENT_PENDING: "بانتظار الدفع",
  PROCESSING: "قيد التنفيذ",
  APPROVED: "معتمد",
  COMPLETED: "مكتمل",
  REJECTED: "مرفوض",
  CANCELLED: "ملغي",
};

export function CustomerQuickLookup() {
  const [query, setQuery] = React.useState("");
  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  async function search() {
    const value = query.trim();
    if (!value) return;
    setLoading(true);
    setError("");
    setCustomer(null);
    try {
      const params = value.startsWith("249") || /^\+?\d+$/.test(value)
        ? new URLSearchParams({ phone: value })
        : new URLSearchParams({ passportNo: value });
      const response = await fetch(`${API_URL}/customers/lookup?${params.toString()}`, { credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.message || "تعذر البحث عن العميل");
      if (!payload.data) {
        setError("لم يتم العثور على عميل بهذه البيانات.");
        return;
      }
      setCustomer(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر البحث عن العميل");
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setQuery("");
    setCustomer(null);
    setError("");
  }

  return (
    <section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold text-muted-foreground">المرحلة 3–4</p>
          <h2 className="mt-1 text-xl font-black">العثور على العميل وإعادة استخدام بياناته</h2>
          <p className="mt-1 text-sm leading-7 text-muted-foreground">ابحث برقم الجواز أو الهاتف قبل إنشاء طلب جديد حتى لا تعيد إدخال البيانات.</p>
        </div>
        <div className="flex w-full gap-2 sm:max-w-xl">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void search(); }}
              placeholder="رقم الجواز أو الهاتف"
              className="h-11 w-full rounded-xl border border-input bg-background pr-10 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
              inputMode="search"
            />
          </div>
          <Button type="button" onClick={() => void search()} disabled={loading || !query.trim()}>
            {loading ? "جارٍ..." : "بحث"}
          </Button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-semibold text-destructive">{error}</div> : null}

      {customer ? (
        <div className="mt-5 rounded-2xl border border-border bg-muted/20 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserRound className="size-5" /></div>
              <div>
                <h3 className="font-black text-foreground">{customer.fullName}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{customer.customerNo} · {customer.nationality}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={clear}><X className="size-4" />مسح</Button>
              <Button asChild size="sm" variant="gold"><Link href={`/admin-dashboard.html?customer=${encodeURIComponent(customer.id)}`}>فتح ملف العميل</Link></Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div><span className="text-xs text-muted-foreground">الجواز</span><div className="mt-1 font-bold" dir="ltr">{customer.passportNo}</div></div>
            <div><span className="text-xs text-muted-foreground">الهاتف</span><div className="mt-1 font-bold" dir="ltr">{customer.phone || "—"}</div></div>
            <div><span className="text-xs text-muted-foreground">البريد</span><div className="mt-1 font-bold break-all">{customer.email || "—"}</div></div>
            <div><span className="text-xs text-muted-foreground">الموقع</span><div className="mt-1 font-bold">{[customer.city, customer.country].filter(Boolean).join("، ") || "—"}</div></div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-black">آخر الطلبات</h4>
              <span className="rounded-full bg-background px-3 py-1 text-xs font-bold text-muted-foreground">{customer.orders?.length ?? 0}</span>
            </div>
            <div className="mt-3 grid gap-2">
              {(customer.orders || []).slice(0, 5).map((order) => (
                <div key={order.id} className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-bold" dir="ltr">{order.orderNumber}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{order.items?.[0]?.service?.name || "طلب خدمة"} · {new Date(order.createdAt).toLocaleDateString("ar-SD")}</div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 font-bold text-primary">{statusLabel[order.status] || order.status}</span>
                    <span className="font-black">{Number(order.totalAmount).toLocaleString("en-US")} {order.currency}</span>
                  </div>
                </div>
              ))}
              {customer.orders?.length ? null : <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">لا توجد طلبات سابقة.</div>}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
