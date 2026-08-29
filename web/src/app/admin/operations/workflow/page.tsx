"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Calculator, CreditCard, FileUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminShell } from "@/components/admin/admin-shell";
import { API_URL } from "@/lib/api-url";

type Item = {
  source: string;
  id: string;
  reference: string;
  customerName: string;
  service: string;
  status: string;
  paymentStatus: string;
  amount: string | number | null;
  currency: string | null;
};

type Payload = { items: Item[] };

function amount(item: Item) {
  if (item.amount == null) return "—";
  return `${Number(item.amount).toLocaleString("en-US")} ${item.currency || ""}`.trim();
}

function actionFor(item: Item) {
  if (item.source !== "contact_request") return null;
  if (item.paymentStatus === "UNDER_REVIEW") {
    return { href: "/admin/payment-review", label: "مراجعة الدفع", icon: CreditCard, variant: "gold" as const };
  }
  if (item.status === "NEW" || item.status === "UNDER_REVIEW" || item.status === "PROCESSING") {
    return { href: `/admin/operations/pricing?requestId=${encodeURIComponent(item.id)}&reference=${encodeURIComponent(item.reference)}`, label: "تسعير", icon: Calculator, variant: "primary" as const };
  }
  if (item.paymentStatus === "CONFIRMED" || item.paymentStatus === "PAID" || item.status === "APPROVED") {
    return { href: `/admin/delivery?requestId=${encodeURIComponent(item.id)}&reference=${encodeURIComponent(item.reference)}`, label: "تسليم", icon: FileUp, variant: "outline" as const };
  }
  return null;
}

export default function OperationsWorkflowPage() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/dashboard/operations`, { credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.message || "تعذر تحميل الطلبات");
      setItems(((payload.data as Payload).items || []).filter((item) => item.source === "contact_request"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل الطلبات");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { void load(); }, []);

  return (
    <AdminShell>
      <main className="min-h-screen bg-section py-8 sm:py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div>
              <p className="text-xs font-bold text-muted-foreground">نسائم الحرمين</p>
              <h1 className="mt-1 text-2xl font-black sm:text-3xl">مسار الطلب الموحد</h1>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">من التسعير إلى الدفع ثم التسليم النهائي، مع زر الإجراء المناسب لكل طلب.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />تحديث</Button>
              <Button asChild variant="gold"><Link href="/admin/operations"><ArrowRight className="size-4" />مركز العمليات</Link></Button>
            </div>
          </div>

          {error ? <div className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-bold text-destructive">{error}</div> : null}

          <section className="mt-6 grid gap-4">
            {loading ? <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">جاري تحميل الطلبات...</div> : null}
            {!loading && items.length === 0 ? <div className="rounded-2xl border border-border bg-card p-8 text-center font-semibold text-emerald-700">لا توجد طلبات خدمات حالياً.</div> : null}
            {items.map((item) => {
              const action = actionFor(item);
              const ActionIcon = action?.icon;
              return (
                <article key={item.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="font-black">{item.customerName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{item.service} · {item.reference}</div>
                      <div className="mt-2 text-sm font-bold">{amount(item)}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-black">{item.status}</span>
                      <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">الدفع: {item.paymentStatus}</span>
                      {action && ActionIcon ? <Button asChild size="sm" variant={action.variant}><Link href={action.href}><ActionIcon className="size-4" />{action.label}</Link></Button> : null}
                      <Button asChild size="sm" variant="outline"><Link href={`/admin-dashboard.html?customerRequest=${encodeURIComponent(item.id)}`}>فتح الطلب</Link></Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        </div>
      </main>
    </AdminShell>
  );
}
