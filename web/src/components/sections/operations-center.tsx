"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardList, CreditCard, FileText, RefreshCw, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";

const queueCards = [
  { key: "newRequests", label: "طلبات جديدة", icon: ClipboardList, tone: "bg-primary/10 text-primary" },
  { key: "waitingPaymentReview", label: "دفعات للمراجعة", icon: CreditCard, tone: "bg-amber-500/10 text-amber-700" },
  { key: "unassignedOrders", label: "طلبات بلا موظف", icon: UserRound, tone: "bg-blue-500/10 text-blue-700" },
  { key: "waitingDocuments", label: "بانتظار مستندات", icon: FileText, tone: "bg-purple-500/10 text-purple-700" },
  { key: "waitingCustomer", label: "بانتظار العميل", icon: AlertCircle, tone: "bg-orange-500/10 text-orange-700" },
  { key: "readyToDeliver", label: "جاهزة للتسليم", icon: CheckCircle2, tone: "bg-emerald-500/10 text-emerald-700" },
] as const;

type OperationItem = {
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
  assignedUser?: string | null;
  nextAction: { key: string; label: string };
};

type OperationPayload = {
  queues: Record<string, number>;
  items: OperationItem[];
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
  NOT_REQUIRED: "غير مطلوب",
  AWAITING_TRANSFER: "بانتظار التحويل",
  UNDER_REVIEW_PAYMENT: "الدفع قيد المراجعة",
  CONFIRMED: "تم التأكيد",
  UNPAID: "غير مدفوع",
  PARTIAL: "جزئي",
  PAID: "مدفوع",
};

function label(value: string) {
  return statusLabel[value] || value;
}

function formatAmount(amount: OperationItem["amount"], currency: string | null) {
  if (amount == null) return "—";
  return `${Number(amount).toLocaleString("en-US")} ${currency || ""}`.trim();
}

function relativeDate(value: string) {
  const date = new Date(value);
  return date.toLocaleString("ar-SD", { dateStyle: "short", timeStyle: "short", calendar: "gregory" });
}

export function OperationsCenter() {
  const [data, setData] = React.useState<OperationPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/dashboard/operations`, { credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.message || "تعذر تحميل مركز العمليات");
      setData(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل مركز العمليات");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  return (
    <main className="min-h-screen bg-section py-8 sm:py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <p className="text-xs font-bold text-muted-foreground">نسائم الحرمين</p>
            <h1 className="mt-1 text-2xl font-black text-foreground sm:text-3xl">مركز العمليات</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
              شاشة واحدة لمعرفة ما يحتاج إجراء الآن، مع اقتراح الخطوة التالية لكل طلب.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
              تحديث
            </Button>
            <Button asChild variant="gold">
              <Link href="/admin-dashboard.html">لوحة الإدارة الكاملة</Link>
            </Button>
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-bold text-destructive">{error}</div>
        ) : null}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {queueCards.map(({ key, label: cardLabel, icon: Icon, tone }) => (
            <div key={key} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className={`flex size-10 items-center justify-center rounded-xl ${tone}`}>
                <Icon className="size-5" />
              </div>
              <p className="mt-4 text-xs font-bold text-muted-foreground">{cardLabel}</p>
              <p className="mt-1 text-3xl font-black text-foreground">{data?.queues?.[key] ?? 0}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">ما يحتاج إجراء الآن</h2>
              <p className="mt-1 text-sm text-muted-foreground">الطلبات الأقدم في الانتظار تظهر أولًا.</p>
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">{data?.items?.length ?? 0} طلب</span>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs text-muted-foreground">
                  <th className="px-3 py-3 text-start">المرجع</th>
                  <th className="px-3 py-3 text-start">العميل</th>
                  <th className="px-3 py-3 text-start">الخدمة</th>
                  <th className="px-3 py-3 text-start">الحالة</th>
                  <th className="px-3 py-3 text-start">المبلغ</th>
                  <th className="px-3 py-3 text-start">آخر تحديث</th>
                  <th className="px-3 py-3 text-start">الإجراء التالي</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">جاري تحميل الطلبات...</td></tr>
                ) : null}
                {!loading && data?.items?.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center font-semibold text-emerald-700">لا توجد طلبات تحتاج تدخلًا الآن.</td></tr>
                ) : null}
                {data?.items?.map((item) => (
                  <tr key={`${item.source}-${item.id}`} className="border-b border-border/70 last:border-0">
                    <td className="px-3 py-4 font-mono font-bold" dir="ltr">{item.reference}</td>
                    <td className="px-3 py-4">
                      <div className="font-bold">{item.customerName}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">{item.phone}</div>
                    </td>
                    <td className="px-3 py-4">{item.service}</td>
                    <td className="px-3 py-4">
                      <div className="font-semibold">{label(item.status)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">الدفع: {label(item.paymentStatus)}</div>
                    </td>
                    <td className="px-3 py-4 font-bold">{formatAmount(item.amount, item.currency)}</td>
                    <td className="px-3 py-4 text-xs text-muted-foreground">{relativeDate(item.updatedAt)}</td>
                    <td className="px-3 py-4">
                      <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">{item.nextAction.label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Button asChild variant="outline" className="h-12 justify-center">
            <Link href="/admin-dashboard.html">إدارة الطلبات والدفعات <ArrowLeft className="size-4" /></Link>
          </Button>
          <Button asChild variant="outline" className="h-12 justify-center">
            <Link href="/flights">فتح صفحة الطيران <ArrowLeft className="size-4" /></Link>
          </Button>
          <Button asChild variant="outline" className="h-12 justify-center">
            <Link href="/track">صفحة متابعة العميل <ArrowLeft className="size-4" /></Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
