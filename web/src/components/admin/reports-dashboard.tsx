"use client";
/* eslint-disable react-hooks/set-state-in-effect -- report filters intentionally trigger a fresh API read. */

import * as React from "react";
import { BarChart3, CalendarDays, CircleDollarSign, Download, Loader2, ReceiptText, RefreshCw, WalletCards } from "lucide-react";
import { API_URL } from "@/lib/api-url";
import { Button } from "@/components/ui/button";

// Amounts are exact decimal strings in ONE currency per row — currencies are
// never added together (see docs/FINANCIAL_MODEL.md).
type Metrics = { currency: string; ordersCount?: number; revenue: string; paid?: string; outstanding?: string; refunds?: string; unreconciledPayments?: number; supplierCost: string | null; grossProfit: string | null; costCoverage: number };
type Report = { period: { from: string | null; to: string | null; label: string }; totalsByCurrency: Metrics[]; breakdown: { groupBy: string; rows: Array<Metrics & { key: string; label: string }> } | null };

const periods = [{ value: "day", label: "اليوم" }, { value: "week", label: "7 أيام" }, { value: "month", label: "هذا الشهر" }] as const;
const groups = [{ value: "service", label: "حسب الخدمة" }, { value: "employee", label: "حسب الموظف" }, { value: "supplier", label: "حسب المورّد" }, { value: "currency", label: "حسب العملة" }] as const;
const money = (value: number | string | null | undefined) => value == null ? "—" : Number(value).toLocaleString("ar-SD", { maximumFractionDigits: 2 });

export function ReportsDashboard() {
  const [period, setPeriod] = React.useState("month");
  const [groupBy, setGroupBy] = React.useState("service");
  const [report, setReport] = React.useState<Report | null>(null);
  const [currencyChoice, setCurrencyChoice] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${API_URL}/finance/reports?period=${period}&groupBy=${groupBy}`, { credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.message || "تعذر تحميل التقرير");
      setReport(payload.data);
    } catch (err) { setError(err instanceof Error ? err.message : "تعذر تحميل التقرير"); }
    finally { setLoading(false); }
  }, [period, groupBy]);

  React.useEffect(() => { void load(); }, [load]);

  const currencies = report?.totalsByCurrency.map((item) => item.currency) ?? [];
  const currency = currencyChoice && currencies.includes(currencyChoice) ? currencyChoice : currencies[0];
  const totals = report?.totalsByCurrency.find((item) => item.currency === currency);
  const rows = (report?.breakdown?.rows ?? []).filter((row) => row.currency === currency);

  function exportCsv() {
    if (!report?.breakdown?.rows.length) return;
    // The export keeps every currency, one row per (group, currency).
    const csvRows = [["التصنيف", "العملة", "الطلبات", "الإيراد", "المدفوع", "المتبقي", "تكلفة المورد", "هامش الربح"], ...report.breakdown.rows.map((row) => [row.label, row.currency, row.ordersCount ?? "", row.revenue, row.paid ?? "", row.outstanding ?? "", row.supplierCost ?? "", row.grossProfit ?? ""] )];
    const csv = "\uFEFF" + csvRows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `nasaem-report-${period}-${groupBy}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  const maxRevenue = Math.max(...rows.map((row) => Number(row.revenue)), 1);
  const cards = [
    { label: "إجمالي الإيرادات", value: money(totals?.revenue), icon: CircleDollarSign, tone: "bg-emerald-500/10 text-emerald-700" },
    { label: "المبالغ المحصلة", value: money(totals?.paid), icon: WalletCards, tone: "bg-blue-500/10 text-blue-700" },
    { label: "المبالغ المتبقية", value: money(totals?.outstanding), icon: ReceiptText, tone: "bg-amber-500/10 text-amber-700" },
    { label: "عدد الطلبات", value: totals?.ordersCount?.toLocaleString("ar-SD") ?? "—", icon: BarChart3, tone: "bg-primary/10 text-primary" },
  ];

  return <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <div className="flex flex-col gap-4 rounded-3xl bg-gradient-to-l from-primary to-primary/80 p-5 text-primary-foreground shadow-lg sm:flex-row sm:items-center sm:justify-between sm:p-7">
      <div><div className="flex items-center gap-2 text-sm font-bold opacity-80"><CalendarDays className="size-4" />قراءة سريعة لأداء الوكالة</div><h2 className="mt-2 text-2xl font-black">الأرقام المهمة في مكان واحد</h2><p className="mt-2 text-sm opacity-80">غيّر الفترة أو طريقة التجميع، وستتحدث النتائج مباشرة.</p></div>
      <div className="flex gap-2"><Button type="button" variant="outline" className="border-white/30 bg-white text-primary hover:bg-white/90" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}تحديث</Button><Button type="button" variant="outline" className="border-white/30 bg-white text-primary hover:bg-white/90" onClick={exportCsv} disabled={!report?.breakdown?.rows.length}><Download className="size-4" />تنزيل CSV</Button></div>
    </div>
    <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">{periods.map((item) => <button type="button" key={item.value} onClick={() => setPeriod(item.value)} className={`rounded-xl px-4 py-2 text-sm font-black transition ${period === item.value ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{item.label}</button>)}</div>
      <select aria-label="تجميع التقرير" value={groupBy} onChange={(event) => setGroupBy(event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm font-bold outline-none focus:border-primary">{groups.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
    </div>
    {error ? <div className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-bold text-destructive">{error}</div> : null}
    {currencies.length > 0 ? <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label="العملة"><span className="text-sm font-bold text-muted-foreground">العملة:</span>{currencies.map((code) => <button type="button" key={code} onClick={() => setCurrencyChoice(code)} aria-pressed={code === currency} className={`rounded-xl px-4 py-2 text-sm font-black transition ${code === currency ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{code}</button>)}<span className="text-xs text-muted-foreground">لا يتم جمع العملات المختلفة معًا.</span></div> : null}
    {totals?.unreconciledPayments ? <div className="mt-3 rounded-xl bg-amber-500/10 p-3 text-xs font-bold leading-6 text-amber-800">يوجد {totals.unreconciledPayments} دفعة بعملة مختلفة عن عملة الطلب بدون سعر صرف مسجل، ولا تُحتسب في المحصّل حتى تتم مراجعتها.</div> : null}
    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, icon: Icon, tone }) => <div key={label} className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md"><div className={`flex size-11 items-center justify-center rounded-2xl ${tone}`}><Icon className="size-5" /></div><p className="mt-4 text-sm font-bold text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-black" dir="ltr">{loading ? "…" : value}</p></div>)}</div>
    <section className="mt-5 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7"><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-primary">التوزيع</p><h3 className="mt-1 text-xl font-black">{groups.find((item) => item.value === groupBy)?.label}</h3></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">{rows.length} بند</span></div>
      <div className="mt-6 space-y-5">{!loading && !rows.length ? <div className="rounded-2xl bg-muted/40 p-8 text-center text-sm font-bold text-muted-foreground">لا توجد بيانات في هذه الفترة.</div> : rows.slice(0, 12).map((row) => <div key={`${row.key}-${row.currency}`}><div className="mb-2 flex items-center justify-between gap-4 text-sm"><span className="font-black">{row.label}</span><span className="font-bold text-muted-foreground" dir="ltr">{money(row.revenue)} {row.currency}</span></div><div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-l from-primary to-secondary transition-all duration-500" style={{ width: `${Math.max((Number(row.revenue) / maxRevenue) * 100, 3)}%` }} /></div></div>)}</div>
      {totals && totals.grossProfit == null && Number(totals.revenue) ? <p className="mt-6 rounded-xl bg-amber-500/10 p-3 text-xs font-bold leading-6 text-amber-800">هامش الربح لا يظهر حتى تُسجل تكلفة المورد لكل بنود الطلبات. الإيراد المعروض صحيح ولا يُعامل كربح.</p> : null}
    </section>
  </div>;
}
