"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, CreditCard, ExternalLink, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";

type Item = {
  source: string;
  id: string;
  reference: string;
  customerName: string;
  phone: string;
  service: string;
  status: string;
  paymentStatus: string;
  amount: string | number | null;
  currency: string | null;
  updatedAt: string;
  pendingPayment?: { id: string; amount: string | number; currency: string | null } | null;
};

type Payload = { items: Item[] };

function formatAmount(amount: string | number | null | undefined, currency: string | null | undefined) {
  if (amount == null) return "—";
  return `${Number(amount).toLocaleString("en-US")} ${currency || ""}`.trim();
}

export default function PaymentReviewPage() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [workingId, setWorkingId] = React.useState<string | null>(null);
  const [rejectingId, setRejectingId] = React.useState<string | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/dashboard/operations`, { credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.message || "تعذر تحميل الدفعات");
      const data = payload.data as Payload;
      setItems(
        (data.items || []).filter(
          (item) => (item.source === "contact_request" && item.paymentStatus === "UNDER_REVIEW") || (item.source === "order" && item.pendingPayment),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل الدفعات");
    } finally {
      setLoading(false);
    }
  }

  async function confirmPayment(item: Item) {
    setWorkingId(item.id);
    setMessage("");
    setError("");
    try {
      const endpoint =
        item.source === "order" && item.pendingPayment
          ? `${API_URL}/payments/${encodeURIComponent(item.pendingPayment.id)}/confirm`
          : `${API_URL}/contact-requests/${encodeURIComponent(item.id)}/confirm-payment`;
      const response = await fetch(endpoint, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" } });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.message || "تعذر تأكيد الدفع");
      setMessage(`تم تأكيد الدفع للطلب ${item.reference}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تأكيد الدفع");
    } finally {
      setWorkingId(null);
    }
  }

  async function rejectPayment(item: Item) {
    if (!item.pendingPayment) return;
    if (!rejectReason.trim()) {
      setError("يرجى كتابة سبب الرفض");
      return;
    }
    setWorkingId(item.id);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`${API_URL}/payments/${encodeURIComponent(item.pendingPayment.id)}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.message || "تعذر رفض الدفعة");
      setMessage(`تم رفض الدفعة على الطلب ${item.reference}`);
      setRejectingId(null);
      setRejectReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر رفض الدفعة");
    } finally {
      setWorkingId(null);
    }
  }

  React.useEffect(() => { void load(); }, []);

  return (
    <main className="min-h-screen bg-section py-8 sm:py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <p className="text-xs font-bold text-muted-foreground">نسائم الحرمين</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">مراجعة الدفعات</h1>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">طلبات التواصل والطلبات التي أعلن أصحابها عن التحويل وتحتاج تأكيد الموظف أو المحاسب.</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />تحديث</Button>
            <Button asChild variant="gold"><Link href="/admin/operations">مركز العمليات</Link></Button>
          </div>
        </div>

        {message ? <div className="mt-5 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700"><CheckCircle2 className="size-5" />{message}</div> : null}
        {error ? <div className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-bold text-destructive">{error}</div> : null}

        <section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
          {loading ? <div className="py-10 text-center text-sm text-muted-foreground">جاري تحميل الدفعات...</div> : null}
          {!loading && items.length === 0 ? <div className="py-10 text-center font-semibold text-emerald-700">لا توجد دفعات بانتظار المراجعة.</div> : null}
          <div className="grid gap-4">
            {items.map((item) => (
              <article key={`${item.source}-${item.id}`} className="rounded-2xl border border-border bg-background p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700"><CreditCard className="size-5" /></div>
                    <div>
                      <div className="font-black">{item.customerName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{item.service} · {item.reference}</div>
                      <div className="mt-2 text-sm font-bold">{item.pendingPayment ? formatAmount(item.pendingPayment.amount, item.pendingPayment.currency) : formatAmount(item.amount, item.currency)}</div>
                      <div className="mt-1 text-xs text-muted-foreground" dir="ltr">{item.phone}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="gold" onClick={() => void confirmPayment(item)} disabled={workingId === item.id}>
                      <CheckCircle2 className="size-4" />{workingId === item.id ? "جارٍ التأكيد..." : "تأكيد الدفع"}
                    </Button>
                    {item.pendingPayment ? (
                      <Button type="button" variant="outline" className="text-destructive" onClick={() => { setRejectingId(rejectingId === item.id ? null : item.id); setRejectReason(""); }}>
                        <XCircle className="size-4" />رفض
                      </Button>
                    ) : null}
                    <Button asChild type="button" variant="outline">
                      <Link href={item.source === "order" ? `/admin-dashboard.html?order=${encodeURIComponent(item.id)}` : `/admin-dashboard.html?customerRequest=${encodeURIComponent(item.id)}`}><ExternalLink className="size-4" />فتح الطلب</Link>
                    </Button>
                  </div>
                </div>
                {rejectingId === item.id ? (
                  <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
                    <input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="سبب رفض الدفعة (سيصل للعميل)"
                      className="h-11 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                    />
                    <Button type="button" variant="outline" className="text-destructive" onClick={() => void rejectPayment(item)} disabled={workingId === item.id}>
                      {workingId === item.id ? "جارٍ الرفض..." : "تأكيد الرفض"}
                    </Button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
