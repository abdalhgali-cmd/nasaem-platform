"use client";
/* eslint-disable react-hooks/set-state-in-effect -- initial queue data loading synchronizes with the API. */

// Operations Center (design system Phase 2). The daily working dashboard for
// staff, centred on Egypt security approval and Umrah. Every figure comes from
// an existing endpoint (see admin/operations/ops-model.ts); actions are the
// same as before: direct safe status steps and «تعيين لي» on orders, opening a
// request, and payment decisions only on /admin/payment-review.

import * as React from "react";
import Link from "next/link";
import {
  AlarmClock, BarChart3, ChevronLeft, ChevronRight, ClipboardList, CreditCard, ExternalLink, FileSearch, Plane,
  Receipt, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Sparkles, UserRound, UsersRound,
} from "lucide-react";
import { API_URL } from "@/lib/api-url";
import {
  type CurrentUser, type EgyptQueue, type EgyptRow, type Level, type OperationItem, type OperationPayload, type QueueSummary,
  type ServiceIndex, type Signal, type UmrahRow,
  LEVEL_RANK, MANAGER_ROLES, SERVICE_QUEUE_ROLES,
  actionTarget, ageText, caseHref, egyptSignal, formatAmount, formatDateTime, formatDay, itemSignal, nextStatus,
  ownerOf, paymentLabel, priority, serviceOf, statusLabel, umrahSignal, workload,
} from "@/components/admin/operations/ops-model";
import { Avatar, Card, Notice, ServiceTag, SignalBadge, ViewAll, btn, cx } from "@/components/admin/operations/ops-ui";

const PAGE_SIZE = 15;

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { credentials: "include" });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error(payload?.message || `HTTP ${response.status}`);
  return payload as T;
}

type ServiceData = { egypt: EgyptQueue | null; umrah: UmrahRow[] | null; summary: QueueSummary | null; errors: string[] };
const EMPTY_SERVICE: ServiceData = { egypt: null, umrah: null, summary: null, errors: [] };

// The Egypt and Umrah queues are read only for the roles their endpoints
// allow; any one of them failing leaves the rest of the page working.
async function loadServiceQueues(user: CurrentUser | null): Promise<ServiceData> {
  if (!user || !SERVICE_QUEUE_ROLES.includes(user.role)) return EMPTY_SERVICE;
  const [egypt, umrahNew, umrahOpen, summary] = await Promise.allSettled([
    getJson<{ data: EgyptQueue }>("/contact-requests/egypt/queue?view=schedule"),
    getJson<{ data: UmrahRow[] }>("/contact-requests?serviceKind=UMRAH&status=NEW&limit=100"),
    getJson<{ data: UmrahRow[] }>("/contact-requests?serviceKind=UMRAH&status=CONTACTED&limit=100"),
    getJson<{ data: QueueSummary }>("/contact-requests/queue-summary"),
  ]);
  const errors: string[] = [];
  if (egypt.status === "rejected") errors.push("تعذر تحميل قائمة الموافقة الأمنية");
  if (umrahNew.status === "rejected" || umrahOpen.status === "rejected") errors.push("تعذر تحميل قائمة العمرة");
  if (summary.status === "rejected") errors.push("تعذر تحميل ملخص المواعيد");
  const umrah = umrahNew.status === "fulfilled" && umrahOpen.status === "fulfilled" ? [...umrahNew.value.data, ...umrahOpen.value.data] : null;
  return {
    egypt: egypt.status === "fulfilled" ? egypt.value.data : null,
    umrah,
    summary: summary.status === "fulfilled" ? summary.value.data : null,
    errors,
  };
}


export function OperationsCenter() {
  const [data, setData] = React.useState<OperationPayload | null>(null);
  const [service, setService] = React.useState<ServiceData>(EMPTY_SERVICE);
  const [currentUser, setCurrentUser] = React.useState<CurrentUser | null>(null);
  const [loadedAt, setLoadedAt] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [workingId, setWorkingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("ALL");
  const [serviceFilter, setServiceFilter] = React.useState("ALL");
  const [employeeFilter, setEmployeeFilter] = React.useState("ALL");
  const [paymentStatusFilter, setPaymentStatusFilter] = React.useState("ALL");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [showFilters, setShowFilters] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<"priority" | "recent">("priority");
  const [pageIndex, setPageIndex] = React.useState(0);

  async function load() {
    setLoading(true); setError("");
    try {
      const [opsResponse, meResponse] = await Promise.all([
        fetch(`${API_URL}/dashboard/operations`, { credentials: "include" }),
        fetch(`${API_URL}/auth/me`, { credentials: "include" }),
      ]);
      const payload = await opsResponse.json().catch(() => null);
      if (!opsResponse.ok || !payload?.success) throw new Error(payload?.message || "تعذر تحميل مركز العمليات");
      setData(payload.data);
      const mePayload = await meResponse.json().catch(() => null);
      const me: CurrentUser | null = meResponse.ok && mePayload?.success ? mePayload.data : null;
      if (me) setCurrentUser(me);
      setService(await loadServiceQueues(me));
      setLoadedAt(new Date().toISOString());
    } catch (err) { setError(err instanceof Error ? err.message : "تعذر تحميل مركز العمليات"); }
    finally { setLoading(false); }
  }

  async function advanceOrder(item: OperationItem) {
    const status = nextStatus(item); if (!status) return;
    setWorkingId(item.id); setError(""); setSuccess("");
    try {
      const response = await fetch(`${API_URL}/orders/${encodeURIComponent(item.id)}/status`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, notes: `تم التنفيذ من مركز العمليات: ${item.nextAction.label}` }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.message || "تعذر تحديث حالة الطلب");
      setSuccess(`تم تحديث ${item.reference} إلى: ${statusLabel(status)}`); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "تعذر تحديث الطلب"); }
    finally { setWorkingId(null); }
  }

  async function assignToMe(item: OperationItem) {
    if (!currentUser) return;
    setWorkingId(item.id); setError(""); setSuccess("");
    try {
      const response = await fetch(`${API_URL}/orders/${encodeURIComponent(item.id)}/assign`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignedUserId: currentUser.id }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.message || "تعذر إسناد الطلب");
      setSuccess(`تم إسناد ${item.reference} إليك`); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "تعذر إسناد الطلب"); }
    finally { setWorkingId(null); }
  }

  React.useEffect(() => { void load(); }, []);

  const index: ServiceIndex = React.useMemo(() => ({
    egypt: new Map((service.egypt?.rows || []).map((row) => [row.id, row])),
    umrah: new Map((service.umrah || []).map((row) => [row.id, row])),
  }), [service]);

  const items = React.useMemo(() => data?.items || [], [data]);

  const serviceOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) if (item.serviceId && !seen.has(item.serviceId)) seen.set(item.serviceId, item.service);
    return [...seen.entries()];
  }, [items]);

  const employeeOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) if (item.assignedUserId && item.assignedUser && !seen.has(item.assignedUserId)) seen.set(item.assignedUserId, item.assignedUser);
    return [...seen.entries()];
  }, [items]);

  // Only the payment statuses actually present in the current data, so the
  // filter never offers a value that would just show an empty table.
  const paymentStatusOptions = React.useMemo(() => {
    const seen = new Set<string>();
    for (const item of items) if (item.paymentStatus) seen.add(item.paymentStatus);
    return [...seen];
  }, [items]);

  const signals = React.useMemo(() => new Map(items.map((item) => [`${item.source}-${item.id}`, itemSignal(item, index)])), [items, index]);
  const signalOf = React.useCallback((item: OperationItem): Signal => signals.get(`${item.source}-${item.id}`) || itemSignal(item, index), [signals, index]);

  const visibleItems = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom) : null;
    // End-of-day, so a "to" date includes everything that happened on it.
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
    const rows = items.filter((item) => {
      const matchesQuery = !normalized || [item.reference, item.customerName, item.phone, item.service, item.assignedUser || ""].some((value) => value.toLowerCase().includes(normalized));
      const p = priority(item);
      const matchesFilter = filter === "ALL" || (filter === "URGENT" && p === "urgent") || (filter === "STALLED" && p === "stalled") || (filter === "CUSTOMER" && p === "customer") || (filter === "PAYMENT" && (item.hasPaymentUnderReview || item.paymentStatus === "UNDER_REVIEW")) || (filter === "UNASSIGNED" && !item.assignedUser) || (filter === "LATE" && signalOf(item).level === "late");
      const matchesService = serviceFilter === "ALL" || item.serviceId === serviceFilter || (serviceFilter === "EGYPT" && index.egypt.has(item.id)) || (serviceFilter === "UMRAH" && index.umrah.has(item.id));
      const matchesEmployee = employeeFilter === "ALL" || (employeeFilter === "UNASSIGNED" && !item.assignedUserId) || item.assignedUserId === employeeFilter;
      const matchesPaymentStatus = paymentStatusFilter === "ALL" || item.paymentStatus === paymentStatusFilter;
      const updatedAt = new Date(item.updatedAt);
      const matchesDate = (!from || updatedAt >= from) && (!to || updatedAt <= to);
      return matchesQuery && matchesFilter && matchesService && matchesEmployee && matchesPaymentStatus && matchesDate;
    });
    return rows.sort((a, b) => sortBy === "recent"
      ? new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      : LEVEL_RANK[signalOf(a).level] - LEVEL_RANK[signalOf(b).level] || new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
  }, [items, query, filter, serviceFilter, employeeFilter, paymentStatusFilter, dateFrom, dateTo, sortBy, index, signalOf]);

  React.useEffect(() => { setPageIndex(0); }, [query, filter, serviceFilter, employeeFilter, paymentStatusFilter, dateFrom, dateTo, sortBy]);
  const pageCount = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const pageItems = visibleItems.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  const canServiceQueues = Boolean(currentUser && SERVICE_QUEUE_ROLES.includes(currentUser.role));
  const isManager = Boolean(currentUser && MANAGER_ROLES.includes(currentUser.role));
  const egyptRows = React.useMemo(() => service.egypt?.rows || [], [service.egypt]);
  const umrahRows = React.useMemo(() => [...(service.umrah || [])].sort((a, b) => (a.umrahQueue?.rank ?? 5) - (b.umrahQueue?.rank ?? 5) || (a.umrahQueue?.preferredTravelDate || "9999").localeCompare(b.umrahQueue?.preferredTravelDate || "9999")), [service.umrah]);
  const paymentItems = React.useMemo(() => items.filter((item) => item.hasPaymentUnderReview), [items]);
  const queues = data?.queues || {};

  // «ابدأ من هنا»: missed deadlines first, then the amber signals, from the
  // Egypt and Umrah queues and the payment receipts waiting for review.
  const focus = React.useMemo(() => {
    type FocusCard = { key: string; level: Level; kind: "egypt" | "umrah" | null; title: string; signal: Signal; why: string; owner: string | null; ownerKnown: boolean; href: string; action: string };
    const cards: FocusCard[] = [];
    for (const row of egyptRows) {
      const s = egyptSignal(row);
      if (s) cards.push({ key: `eg-${row.id}`, level: s.level, kind: "egypt", title: row.name, signal: s, why: row.nextAction, owner: row.assignedUser?.fullName || null, ownerKnown: true, href: caseHref(row.id), action: "فتح الحالة" });
    }
    for (const row of umrahRows) {
      const s = umrahSignal(row);
      if (s) cards.push({ key: `um-${row.id}`, level: s.level, kind: "umrah", title: row.name, signal: s, why: row.umrahQueue?.nextAction || "مراجعة الطلب", owner: row.assignedUser?.fullName || null, ownerKnown: true, href: caseHref(row.id), action: "فتح الحالة" });
    }
    for (const item of paymentItems) {
      const kind = serviceOf(item, index);
      const owner = ownerOf(item, index);
      cards.push({ key: `pay-${item.source}-${item.id}`, level: "warn", kind, title: item.customerName, signal: { level: "warn", label: "إيصال بانتظار المراجعة" }, why: `${formatAmount(item.pendingPayment?.amount ?? item.amount, item.pendingPayment?.currency ?? item.currency)} · ${ageText(item.ageHours)}`, owner: owner.name, ownerKnown: owner.known, href: "/admin/payment-review", action: "فتح في مراجعة الدفعات" });
    }
    return cards.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
  }, [egyptRows, umrahRows, paymentItems, index]);

  const team = React.useMemo(() => workload(egyptRows, service.umrah || []), [egyptRows, service.umrah]);
  const leadDays = service.egypt?.leadDays ?? 3;

  const tiles: { key: string; label: string; value: number | null; hint?: string; icon: React.ComponentType<{ className?: string }>; tone: string; onClick?: () => void; href?: string; late?: boolean }[] = canServiceQueues
    ? [
        { key: "egypt", label: "الموافقة الأمنية", value: service.egypt ? egyptRows.length : null, hint: service.egypt ? `${service.egypt.filterCounts.WITHIN_3_DAYS ?? 0} سفر خلال ${leadDays} أيام` : undefined, icon: ShieldCheck, tone: "nile", href: "#egypt-queue" },
        { key: "umrah", label: "العمرة", value: service.umrah ? umrahRows.length : null, hint: service.umrah ? `${umrahRows.filter((r) => (r.umrahQueue?.rank ?? 9) <= 3).length} تحتاج إجراءً منا` : undefined, icon: Sparkles, tone: "gold", href: "#umrah-queue" },
        { key: "docs", label: "مستندات للمراجعة", value: service.summary?.queues?.NEEDS_REVIEW ?? null, hint: service.summary ? `${service.summary.queues?.MISSING_DOCUMENTS ?? 0} ناقصة لدى العملاء` : undefined, icon: FileSearch, tone: "info", href: "/admin/cases" },
        { key: "payments", label: "دفعات للمراجعة", value: queues.waitingPaymentReview ?? 0, hint: "تُعتمد في صفحة مراجعة الدفعات", icon: Receipt, tone: "info", onClick: () => setFilter("PAYMENT") },
        { key: "travel", label: "سفر قريب", value: service.egypt ? (service.egypt.filterCounts.WITHIN_3_DAYS ?? 0) : null, hint: `الموافقة الأمنية خلال ${leadDays} أيام`, icon: Plane, tone: "warn", href: "#egypt-queue" },
        { key: "late", label: "متأخرة عن الموعد", value: service.summary ? service.summary.overdue : null, hint: service.summary ? `${service.summary.unassigned} بلا موظف` : undefined, icon: AlarmClock, tone: "danger", late: Boolean(service.summary?.overdue), onClick: () => setFilter("LATE") },
      ]
    : [
        { key: "new", label: "طلبات جديدة", value: queues.newRequests ?? 0, icon: ClipboardList, tone: "info" },
        { key: "payments", label: "دفعات للمراجعة", value: queues.waitingPaymentReview ?? 0, hint: "تُعتمد في صفحة مراجعة الدفعات", icon: Receipt, tone: "info", onClick: () => setFilter("PAYMENT") },
        { key: "docs", label: "بانتظار مستندات", value: queues.waitingDocuments ?? 0, icon: FileSearch, tone: "warn" },
        { key: "customer", label: "بانتظار العميل", value: queues.waitingCustomer ?? 0, icon: UserRound, tone: "warn", onClick: () => setFilter("CUSTOMER") },
        { key: "deliver", label: "جاهزة للتسليم", value: queues.readyToDeliver ?? 0, icon: CreditCard, tone: "success", onClick: () => setFilter("URGENT") },
        { key: "stalled", label: "بلا نشاط 24 ساعة+", value: queues.stalled ?? 0, icon: AlarmClock, tone: "warn", onClick: () => setFilter("STALLED") },
      ];
  const toneStyle: Record<string, string> = {
    nile: "bg-[var(--nh-nile-soft)] text-[var(--nh-nile-ink)]",
    gold: "bg-[var(--nh-gold-50)] text-[var(--nh-gold-700)]",
    info: "bg-[var(--nh-info-soft)] text-[var(--nh-info-ink)]",
    warn: "bg-[var(--nh-warning-soft)] text-[var(--nh-warning-ink)]",
    success: "bg-[var(--nh-success-soft)] text-[var(--nh-success-ink)]",
    danger: "bg-[var(--nh-danger-soft)] text-[var(--nh-danger-ink)]",
  };

  return (
    <main className="min-h-screen bg-section py-7 sm:py-8">
      <div className="mx-auto max-w-[1180px] space-y-6 px-4 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold leading-10 sm:text-[28px]">مركز العمليات</h1>
            <p className="mt-1 text-sm leading-7 text-muted-foreground">
              ما يحتاج إجراءً الآن في <b className="text-foreground">العمرة</b> و<b className="text-foreground">الموافقة الأمنية لمصر</b>{loadedAt ? <> · آخر تحميل <span dir="ltr" className="font-semibold">{new Date(loadedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span></> : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={cx(btn.base, btn.secondary, btn.md)} onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : undefined} />تحديث</button>
            <Link href="/admin/reports" className={cx(btn.base, btn.secondary, btn.md)}><BarChart3 />التقارير</Link>
          </div>
        </div>

        {error ? <Notice tone="error">{error}</Notice> : null}
        {success ? <Notice tone="success">{success}</Notice> : null}
        {service.errors.length ? <Notice tone="info">{service.errors.join(" · ")}. باقي الصفحة يعمل.</Notice> : null}

        {/* ابدأ من هنا */}
        {focus.length ? (
          <section aria-labelledby="focus-title" className="overflow-hidden rounded-[14px] border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <h2 id="focus-title" className="flex items-center gap-2 text-[17px] font-extrabold"><AlarmClock className="size-[18px] text-[var(--nh-gold-700)]" aria-hidden="true" />ابدأ من هنا</h2>
              <span className="text-[13px] text-muted-foreground">{Math.min(3, focus.length)} من {focus.length} {focus.length > 2 ? "نقاط" : "نقطة"} تحتاج انتباهًا</span>
            </div>
            <div className="grid divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0 md:divide-x-reverse">
              {focus.slice(0, 3).map((card) => (
                <div key={card.key} className={cx("grid content-start gap-2.5 p-5", card.level === "late" && "bg-[color-mix(in_srgb,var(--nh-danger-soft)_40%,var(--nh-surface))]")}>
                  <div className="flex flex-wrap items-center justify-between gap-2"><SignalBadge signal={card.signal} /><ServiceTag kind={card.kind} /></div>
                  <div>
                    <p className="text-base font-bold leading-7">{card.title}</p>
                    <p className="text-sm leading-6 text-[var(--nh-ink-secondary)]">{card.signal.detail ? `${card.signal.detail} · ` : ""}{card.why}</p>
                  </div>
                  <p className="text-[13px] text-muted-foreground">المسؤول: {card.ownerKnown ? (card.owner ? <b className="text-foreground">{card.owner}</b> : <b className="text-[var(--nh-warning-ink)]">غير مسند</b>) : <span>يظهر في مساحة العمل</span>}</p>
                  <div><Link href={card.href} className={cx(btn.base, card.level === "late" ? btn.primary : btn.secondary, btn.sm)}>{card.action}</Link></div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Service and work queues */}
        <section aria-label="قوائم العمل" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            const body = (
              <>
                <span className="flex items-center justify-between"><span className={cx("flex size-8 items-center justify-center rounded-[9px]", toneStyle[tile.tone])}><Icon className="size-[17px]" /></span><span className={cx("text-[26px] font-bold leading-8 tabular-nums", tile.late && "text-[var(--nh-danger-ink)]")} dir="ltr">{tile.value ?? "—"}</span></span>
                <span className="text-[13.5px] font-bold leading-5">{tile.label}</span>
                {tile.hint ? <span className="text-xs leading-4 text-muted-foreground">{tile.hint}</span> : null}
              </>
            );
            const cls = "grid gap-2 rounded-[14px] border border-border bg-card p-4 text-start shadow-sm transition hover:border-[var(--nh-line-strong)] hover:shadow-md";
            return tile.href
              ? (tile.href.startsWith("#") ? <a key={tile.key} href={tile.href} className={cls}>{body}</a> : <Link key={tile.key} href={tile.href} className={cls}>{body}</Link>)
              : <button key={tile.key} type="button" onClick={tile.onClick} className={cx(cls, tile.onClick && filter !== "ALL" && ((tile.key === "payments" && filter === "PAYMENT") || (tile.key === "late" && filter === "LATE") || (tile.key === "customer" && filter === "CUSTOMER") || (tile.key === "stalled" && filter === "STALLED") || (tile.key === "deliver" && filter === "URGENT")) && "border-primary ring-1 ring-primary")}>{body}</button>;
          })}
        </section>

        {/* Egypt and Umrah queues */}
        {canServiceQueues ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card id="egypt-queue" title="الموافقة الأمنية — حسب تاريخ السفر" icon={<ShieldCheck className="size-[18px] text-[var(--nh-nile-ink)]" aria-hidden="true" />} aside={<ViewAll href="/admin/cases">كل الحالات</ViewAll>}>
              {!service.egypt ? <p className="p-5 text-sm text-muted-foreground">{loading ? "جاري التحميل…" : "غير متاح."}</p> : egyptRows.length === 0 ? <p className="p-5 text-sm text-muted-foreground">لا توجد طلبات موافقة أمنية مفتوحة.</p> : (
                <ul className="divide-y divide-border">
                  {egyptRows.slice(0, 6).map((row: EgyptRow) => {
                    const s = egyptSignal(row);
                    return (
                      <li key={row.id}>
                        <Link href={caseHref(row.id)} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-5 py-3.5 transition hover:bg-[var(--nh-navy-50)]">
                          <span className="min-w-0 truncate text-[14.5px] font-bold">{row.name}</span>
                          <span className="text-end text-[13px] font-semibold tabular-nums">{row.travelDate ? formatDay(row.travelDate) : <span className="text-muted-foreground">لم يُحدد السفر</span>}</span>
                          <span className="min-w-0 truncate text-[13px] text-muted-foreground">{row.stageLabel} · {row.nextAction}</span>
                          <span className="justify-self-end">{s ? <SignalBadge signal={s} /> : <span className="text-xs text-muted-foreground">{row.entryMode === "AIR" ? "جوي" : row.entryMode === "BORDER" ? "بري" : ""}</span>}</span>
                          <span className="col-span-2 text-xs text-muted-foreground">المسؤول: {row.assignedUser?.fullName || <b className="text-[var(--nh-warning-ink)]">غير مسند</b>}{row.documentIssues.length ? <> · <span className="text-[var(--nh-warning-ink)]">{row.documentIssues[0]}</span></> : null}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              {service.egypt && egyptRows.length > 6 ? <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">و{egyptRows.length - 6} طلبات أخرى في مساحة عمل الحالات{service.egypt.truncated ? " (القائمة مقتطعة)" : ""}.</p> : null}
            </Card>

            <Card id="umrah-queue" title="العمرة — حسب الإجراء المطلوب" icon={<Sparkles className="size-[18px] text-[var(--nh-gold-700)]" aria-hidden="true" />} aside={<ViewAll href="/admin/cases">كل الحالات</ViewAll>}>
              {!service.umrah ? <p className="p-5 text-sm text-muted-foreground">{loading ? "جاري التحميل…" : "غير متاح."}</p> : umrahRows.length === 0 ? <p className="p-5 text-sm text-muted-foreground">لا توجد طلبات عمرة مفتوحة.</p> : (
                <ul className="divide-y divide-border">
                  {umrahRows.slice(0, 6).map((row) => {
                    const s = umrahSignal(row);
                    return (
                      <li key={row.id}>
                        <Link href={caseHref(row.id)} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-5 py-3.5 transition hover:bg-[var(--nh-navy-50)]">
                          <span className="min-w-0 truncate text-[14.5px] font-bold">{row.name}</span>
                          <span className="text-end text-[13px] font-semibold">{row.umrahQueue?.preferredTravelDate ? <>{formatDay(row.umrahQueue.preferredTravelDate)} <span className="text-xs font-normal text-muted-foreground">(مبدئي)</span></> : <span className="text-muted-foreground">بلا تاريخ</span>}</span>
                          <span className="min-w-0 truncate text-[13px] text-muted-foreground">{row.umrahQueue?.nextAction || "مراجعة الطلب"}</span>
                          <span className="justify-self-end">{s ? <SignalBadge signal={s} /> : <span className="text-xs text-muted-foreground">{paymentLabel(row.paymentStatus)}</span>}</span>
                          <span className="col-span-2 text-xs text-muted-foreground">المسؤول: {row.assignedUser?.fullName || <b className="text-[var(--nh-warning-ink)]">غير مسند</b>}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              {service.umrah && umrahRows.length > 6 ? <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">و{umrahRows.length - 6} طلبات أخرى في مساحة عمل الحالات.</p> : null}
            </Card>
          </div>
        ) : null}

        {/* ما يحتاج إجراءً الآن */}
        <section aria-labelledby="actions-title" className="rounded-[14px] border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 id="actions-title" className="text-[17px] font-extrabold">ما يحتاج إجراءً الآن</h2>
              <p className="mt-1 text-[13.5px] leading-6 text-muted-foreground">المتأخر عن موعده أولًا، ثم الدفعات والتسليمات والسفر القريب، ثم بقية الطلبات.</p>
            </div>
            <span className="self-start rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground lg:self-auto">{visibleItems.length} من {items.length} طلب</span>
          </div>

          <div className="space-y-3 border-b border-border px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث بالمرجع أو الاسم أو الهاتف أو الخدمة" aria-label="بحث في الطلبات" className="h-11 w-full rounded-[10px] border border-[var(--nh-line-strong)] bg-background ps-10 pe-3 text-sm outline-none transition focus:border-primary" /></div>
              <div className="flex gap-2">
                <div className="inline-flex rounded-[10px] bg-muted p-1" role="group" aria-label="الترتيب">
                  {([["priority", "الأولوية"], ["recent", "الأحدث نشاطًا"]] as const).map(([key, text]) => <button key={key} type="button" aria-pressed={sortBy === key} onClick={() => setSortBy(key)} className={cx("h-9 rounded-[8px] px-3 text-[13px] font-semibold", sortBy === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>{text}</button>)}
                </div>
                <button type="button" className={cx(btn.base, btn.secondary, "h-11 px-4 text-sm")} aria-expanded={showFilters} onClick={() => setShowFilters((value) => !value)}><SlidersHorizontal />الفلاتر</button>
              </div>
            </div>
            {showFilters ? <div className="grid gap-3 lg:grid-cols-3">
              <select aria-label="نوع الأولوية" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-11 rounded-[10px] border border-[var(--nh-line-strong)] bg-background px-3 text-sm font-semibold outline-none"><option value="ALL">كل الطلبات</option><option value="LATE">متأخرة عن الموعد</option><option value="URGENT">أولوية عالية (دفع أو تسليم)</option><option value="PAYMENT">دفعات للمراجعة</option><option value="STALLED">بلا نشاط 24 ساعة+</option><option value="CUSTOMER">بانتظار العميل</option><option value="UNASSIGNED">بلا موظف (الطلبات المباشرة)</option></select>
              <select aria-label="الخدمة" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="h-11 rounded-[10px] border border-[var(--nh-line-strong)] bg-background px-3 text-sm font-semibold outline-none"><option value="ALL">كل الخدمات</option>{canServiceQueues ? <><option value="EGYPT">الموافقة الأمنية لمصر</option><option value="UMRAH">العمرة</option></> : null}{serviceOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
              <select aria-label="الموظف" value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="h-11 rounded-[10px] border border-[var(--nh-line-strong)] bg-background px-3 text-sm font-semibold outline-none"><option value="ALL">كل الموظفين</option><option value="UNASSIGNED">بلا موظف</option>{employeeOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
            </div> : null}
            {showFilters ? <div className="grid gap-3 sm:grid-cols-3">
              <select aria-label="حالة الدفع" value={paymentStatusFilter} onChange={(e) => setPaymentStatusFilter(e.target.value)} className="h-11 rounded-[10px] border border-[var(--nh-line-strong)] bg-background px-3 text-sm font-semibold outline-none"><option value="ALL">كل حالات الدفع</option>{paymentStatusOptions.map((value) => <option key={value} value={value}>{paymentLabel(value)}</option>)}</select>
              <label className="flex h-11 items-center gap-2 rounded-[10px] border border-[var(--nh-line-strong)] bg-background px-3 text-sm text-muted-foreground">من<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-full flex-1 bg-transparent text-sm text-foreground outline-none" /></label>
              <label className="flex h-11 items-center gap-2 rounded-[10px] border border-[var(--nh-line-strong)] bg-background px-3 text-sm text-muted-foreground">إلى<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-full flex-1 bg-transparent text-sm text-foreground outline-none" /></label>
            </div> : null}
          </div>

          {/* One DOM for every width: a 6-column grid from lg, stacked cards below. */}
          <div role="table" aria-labelledby="actions-title">
            <div role="row" className="hidden border-b border-border bg-muted px-5 py-3 text-[13px] font-semibold text-[var(--nh-ink-secondary)] lg:grid lg:grid-cols-[22%_13%_13%_17%_15%_20%] lg:gap-0">
              <span role="columnheader" className="pe-3">العميل والطلب</span><span role="columnheader" className="pe-3">الأولوية</span><span role="columnheader" className="pe-3">الحالة</span><span role="columnheader" className="pe-3">الدفع</span><span role="columnheader" className="pe-3">الموظف المسؤول</span><span role="columnheader">الإجراء التالي</span>
            </div>
            <div role="rowgroup">
              {loading && !data ? <p className="px-5 py-10 text-center text-muted-foreground">جاري تحميل الطلبات...</p> : null}
              {!loading && visibleItems.length === 0 ? <p className="px-5 py-10 text-center font-semibold text-[var(--nh-success-ink)]">لا توجد طلبات مطابقة للبحث أو الفلتر.</p> : null}
              {pageItems.map((item) => {
                const s = signalOf(item);
                const direct = nextStatus(item);
                const kind = serviceOf(item, index);
                const owner = ownerOf(item, index);
                const canAssignToMe = item.source === "order" && !item.assignedUser && currentUser;
                const claim = item.transferClaim;
                return (
                  <div role="row" key={`${item.source}-${item.id}`} className={cx("grid gap-3 border-b border-border px-5 py-4 last:border-0 lg:grid-cols-[22%_13%_13%_17%_15%_20%] lg:gap-0", s.level === "late" && "bg-[color-mix(in_srgb,var(--nh-danger-soft)_45%,var(--nh-surface))]")}>
                    <div role="cell" className="min-w-0 lg:pe-3">
                      <p className="break-words text-[15px] font-bold leading-6">{item.customerName}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2"><span className="font-mono text-[12.5px] font-semibold text-[var(--nh-ink-secondary)]" dir="ltr">{item.reference}</span><ServiceTag kind={kind} fallback={item.service} /></div>
                      {item.phone ? <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">{item.phone}</p> : null}
                    </div>
                    <div role="cell" className="flex flex-wrap items-center gap-2 lg:block lg:pe-3">
                      <SignalBadge signal={s} />
                      <p className={cx("text-[13px] leading-5 lg:mt-1.5", s.level === "late" ? "font-bold text-[var(--nh-danger-ink)]" : "text-muted-foreground")} title={formatDateTime(item.updatedAt)}>{s.detail || ageText(item.ageHours)}</p>
                    </div>
                    <div role="cell" className="lg:pe-3"><span className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-xs font-semibold text-[var(--nh-ink-secondary)]">{statusLabel(item.status)}</span></div>
                    <div role="cell" className="min-w-0 text-[13px] leading-5 lg:pe-3">
                      <p className={cx("font-bold", item.hasPaymentUnderReview ? "text-[var(--nh-info-ink)]" : item.paymentStatus === "CONFIRMED" || item.paymentStatus === "PAID" ? "text-[var(--nh-success-ink)]" : "text-[var(--nh-ink-secondary)]")}>{item.hasPaymentUnderReview ? "إيصال للمراجعة" : paymentLabel(item.paymentStatus)}</p>
                      <p className="text-muted-foreground"><span dir="ltr" className="font-semibold text-foreground">{formatAmount(item.amount, item.currency)}</span>{claim?.payAmount != null ? <> · حُوِّل <span dir="ltr">{formatAmount(claim.payAmount, claim.payCurrency)}</span></> : null}</p>
                    </div>
                    <div role="cell" className="min-w-0 lg:pe-3">
                      {owner.known
                        ? <div className="flex items-center gap-2"><Avatar name={owner.name || "؟"} tone={owner.name ? (owner.name === currentUser?.fullName ? "gold" : "navy") : "warn"} /><div className="flex min-w-0 items-center gap-1.5"><span className={cx("min-w-0 break-words text-sm font-semibold leading-5", !owner.name && "text-[var(--nh-warning-ink)]")}>{owner.name || "غير مسند"}</span>{owner.name && owner.name === currentUser?.fullName ? <span className="shrink-0 rounded-full bg-[var(--nh-primary-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--nh-primary-ink)]">أنت</span> : null}</div></div>
                        : <p className="text-[13px] text-muted-foreground">يظهر في مساحة العمل</p>}
                    </div>
                    <div role="cell" className="grid justify-items-start gap-1.5">
                      <p className="text-[13.5px] font-bold leading-5 text-[var(--nh-primary-ink)]">{index.egypt.get(item.id)?.nextAction || index.umrah.get(item.id)?.umrahQueue?.nextAction || item.nextAction.label}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {direct ? <button type="button" className={cx(btn.base, btn.primary, btn.sm)} onClick={() => void advanceOrder(item)} disabled={workingId === item.id}>{workingId === item.id ? "جارٍ التنفيذ..." : item.nextAction.label}</button> : null}
                        {item.hasPaymentUnderReview ? <Link href="/admin/payment-review" className={cx(btn.base, btn.secondary, btn.sm)}><Receipt />مراجعة الدفع</Link> : null}
                        {canAssignToMe ? <button type="button" className={cx(btn.base, btn.secondary, btn.sm)} onClick={() => void assignToMe(item)} disabled={workingId === item.id}><UserRound />{workingId === item.id ? "جارٍ الإسناد..." : "تعيين لي"}</button> : null}
                        <Link href={actionTarget(item)} className={cx(btn.base, btn.ghost, btn.sm)} aria-label={`فتح ${item.reference}`}><ExternalLink />فتح</Link>
                      </div>
                      {item.hasPaymentUnderReview ? <p className="text-xs text-muted-foreground">الاعتماد في صفحة مراجعة الدفعات</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {visibleItems.length > PAGE_SIZE ? (
            <nav aria-label="صفحات الطلبات" className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-[13px] text-muted-foreground">
              <span>عرض <span dir="ltr">{currentPage * PAGE_SIZE + 1}–{Math.min(visibleItems.length, (currentPage + 1) * PAGE_SIZE)}</span> من <span dir="ltr">{visibleItems.length}</span></span>
              <div className="flex items-center gap-1">
                <button type="button" aria-label="الصفحة السابقة" className={cx(btn.base, btn.ghost, "size-9")} disabled={currentPage === 0} onClick={() => setPageIndex(currentPage - 1)}><ChevronRight /></button>
                <span className="px-2 font-semibold text-foreground" dir="ltr">{currentPage + 1} / {pageCount}</span>
                <button type="button" aria-label="الصفحة التالية" className={cx(btn.base, btn.ghost, "size-9")} disabled={currentPage >= pageCount - 1} onClick={() => setPageIndex(currentPage + 1)}><ChevronLeft /></button>
              </div>
            </nav>
          ) : null}
        </section>

        {/* Payment summary (read-only) and team workload */}
        <div className={cx("grid gap-6", isManager && canServiceQueues && "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]")}>
          <Card id="payments" title="ملخص الدفعات" icon={<Receipt className="size-[18px] text-[var(--nh-primary-ink)]" aria-hidden="true" />} aside={<span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">للاطلاع</span>}>
            {paymentItems.length === 0 ? <p className="p-5 text-sm text-muted-foreground">لا توجد إيصالات بانتظار المراجعة.</p> : (
              <ul className="divide-y divide-border">
                {paymentItems.slice(0, 5).map((item) => (
                  <li key={`${item.source}-${item.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-5 py-3">
                    <div className="min-w-0"><p className="truncate text-sm font-bold">{item.customerName}</p><p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><ServiceTag kind={serviceOf(item, index)} fallback={item.service} />{ageText(item.ageHours)}{item.needsConfirmReason ? <span className="text-[var(--nh-warning-ink)]">· يحتاج سببًا عند التأكيد</span> : null}</p></div>
                    <div className="text-end"><p className="text-[15px] font-bold tabular-nums" dir="ltr">{formatAmount(item.pendingPayment?.amount ?? item.amount, item.pendingPayment?.currency ?? item.currency)}</p>{item.transferClaim?.payAmount != null ? <p className="text-xs text-muted-foreground">حسب العميل <span dir="ltr">{formatAmount(item.transferClaim.payAmount, item.transferClaim.payCurrency)}</span></p> : null}</div>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-2 rounded-b-[14px] border-t border-border bg-muted px-5 py-4">
              <Link href="/admin/payment-review" className={cx(btn.base, btn.primary, btn.md, "w-full")}><Receipt />فتح صفحة مراجعة الدفعات{paymentItems.length ? ` (${paymentItems.length})` : ""}</Link>
              <p className="text-xs leading-5 text-muted-foreground">الاعتماد والرفض يتمّان في صفحة مراجعة الدفعات فقط، بعد فحص الإيصال، ويصل سبب الرفض للعميل.</p>
            </div>
          </Card>

          {isManager && canServiceQueues ? (
            <Card id="team" title="توزيع العمل" icon={<UsersRound className="size-[18px] text-[var(--nh-primary-ink)]" aria-hidden="true" />} aside={<span className="text-xs text-muted-foreground">العمرة والموافقة الأمنية المفتوحة</span>}>
              {team.people.length === 0 && team.unassigned === 0 ? <p className="p-5 text-sm text-muted-foreground">لا توجد طلبات مفتوحة.</p> : (
                <ul className="divide-y divide-border px-5">
                  {team.people.map((person) => (
                    <li key={person.id} className="flex items-center gap-3 py-3">
                      <Avatar name={person.name} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{person.name}</span>
                      <span className="text-[13px] font-bold tabular-nums">{person.open} مفتوحة{person.late ? <span className="text-[var(--nh-danger-ink)]"> · {person.late} متأخرة</span> : null}</span>
                    </li>
                  ))}
                  {team.unassigned ? <li className="flex items-center gap-3 py-3"><Avatar name="+" tone="warn" /><span className="flex-1 text-sm font-bold text-[var(--nh-warning-ink)]">غير مسندة</span><span className="text-[13px] font-bold tabular-nums">{team.unassigned}</span></li> : null}
                </ul>
              )}
              <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">الإسناد يتم من مساحة عمل الحالات (صلاحية المدير).</p>
            </Card>
          ) : null}
        </div>
      </div>
    </main>
  );
}
