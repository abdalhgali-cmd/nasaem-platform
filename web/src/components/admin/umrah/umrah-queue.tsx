"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Layers, Loader2, Moon, RefreshCw, Search, Users } from "lucide-react";
import { API_URL } from "@/lib/api-url";
import { formatAmount, formatDay, paymentLabel, type StaffRole } from "@/components/admin/operations/ops-model";
import { Card, Notice, SignalBadge, btn, cx } from "@/components/admin/operations/ops-ui";
import {
  EMPTY_SERVER_FILTERS,
  FOCUS,
  FOCUS_HELP,
  REQUEST_STATUS_AR,
  SORT_AR,
  STAGE_AR,
  filterQuery,
  listQuery,
  packageKind,
  stageLabel,
  umrahRowSignal,
  type FocusKey,
  type ServerFilters,
  type SortKey,
  type UmrahListRow,
} from "./umrah-model";

// Umrah requests, read from GET /contact-requests?serviceKind=UMRAH. Every
// filter, manager view and order is applied by the server over all matching
// requests before paging (100 per page — the API maximum), and the view counts
// come from GET /contact-requests/umrah-focus under the same filters, so a
// count always opens exactly its list. Stage and next step are the server's.
//
// Roles (backend contact-requests.routes.js): SUPER_ADMIN, ADMIN and EMPLOYEE
// work requests and open the case; ACCOUNTANT may only read the list (payment
// context) and reviews receipts on /admin/payment-review.

const control = "mt-1 h-11 w-full rounded-[10px] border border-[var(--nh-line-strong)] bg-background px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CASE_ROLES: readonly StaffRole[] = ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"];

export function umrahCaseHref(id: string) {
  return `/admin/cases?requestId=${encodeURIComponent(id)}&tab=umrah`;
}

function Row({ row, canOpen, now }: { row: UmrahListRow; canOpen: boolean; now: number }) {
  const signal = umrahRowSignal(row, now);
  const kind = packageKind(row);
  const travel = row.umrahQueue?.preferredTravelDate;
  const pilgrims = row.travelers?.length || row.travelerCount || 1;
  const amount = row.invoice ? formatAmount(row.invoice.amount, row.invoice.currency) : row.progress?.pricing ? formatAmount(row.progress.pricing.total, row.progress.pricing.currency) : null;
  const cells = (
    <>
      <span role="cell" className="flex min-w-0 flex-col gap-1">
        <span className="break-words font-bold text-foreground">{row.name}</span>
        <span className="text-xs text-muted-foreground"><span dir="ltr">{row.phone}</span> · <span dir="ltr">{row.id.slice(-8).toUpperCase()}</span> · {pilgrims} معتمر</span>
        {signal ? <SignalBadge signal={signal} /> : null}
      </span>
      <span role="cell" className="flex min-w-0 flex-col">
        <span className="break-words">{row.serviceRef?.name || "—"}</span>
        {kind.label ? <span className="text-xs text-muted-foreground" data-umrah-kind={kind.kind}>{kind.label}</span> : null}
      </span>
      <span role="cell" className="flex items-center justify-between gap-2 lg:flex-col lg:items-start lg:justify-start">
        <span className="text-xs text-muted-foreground lg:hidden">السفر المفضل</span>
        {travel ? <span className="flex flex-col"><span dir="ltr" className="font-bold tabular-nums">{travel}</span><span className="text-xs text-muted-foreground">مبدئي، ليس حجزًا</span></span>
          : row.intakeData?.umrahTravel?.preferredDateMissing ? <span className="text-xs font-bold text-[var(--nh-warning-ink)]">لم يُحدد</span> : <span className="text-xs text-muted-foreground">تأشيرة فقط / غير مطلوب</span>}
      </span>
      <span role="cell" className="flex items-center justify-between gap-2 lg:flex-col lg:items-start lg:justify-start">
        <span className="text-xs text-muted-foreground lg:hidden">الدفع</span>
        <span className="flex flex-col"><span>{paymentLabel(row.paymentStatus)}</span>{amount ? <span className="text-xs tabular-nums text-muted-foreground" dir="ltr">{amount}</span> : null}</span>
      </span>
      <span role="cell" className="flex items-center justify-between gap-2 lg:block">
        <span className="text-xs text-muted-foreground lg:hidden">المسؤول</span>
        <span className={row.assignedUser ? "font-semibold" : "text-muted-foreground"}>{row.assignedUser?.fullName || "غير مُسند"}</span>
      </span>
      <span role="cell" className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-muted-foreground" data-umrah-stage={row.progress?.stage}>{stageLabel(row)}</span>
        <strong className="break-words text-[13px] text-[var(--nh-primary-ink)]" data-umrah-next="1">{row.umrahQueue?.nextAction || "—"}</strong>
        {row.dueAt ? <span className="text-xs text-muted-foreground">موعد الإنجاز {formatDay(row.dueAt)}</span> : null}
      </span>
    </>
  );
  const grid = "grid gap-3 border-b border-border px-5 py-4 last:border-b-0 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.5fr)]";
  if (canOpen) {
    return <Link href={umrahCaseHref(row.id)} role="row" data-umrah-id={row.id} className={cx(grid, "transition hover:bg-[var(--nh-primary-soft)] focus-visible:bg-[var(--nh-primary-soft)] focus-visible:outline-none")}>{cells}</Link>;
  }
  return <div role="row" data-umrah-id={row.id} className={grid}>{cells}</div>;
}

export function UmrahQueue() {
  const [role, setRole] = React.useState<StaffRole | null>(null);
  const [filters, setFilters] = React.useState<ServerFilters>(EMPTY_SERVER_FILTERS);
  const [search, setSearch] = React.useState("");
  const [focus, setFocus] = React.useState<FocusKey | "">("");
  const [sort, setSort] = React.useState<SortKey>("action");
  const [rows, setRows] = React.useState<UmrahListRow[] | null>(null);
  const [counts, setCounts] = React.useState<Record<FocusKey, number> | null>(null);
  // When the rows were loaded: the reference time for «24 h without activity».
  const [loadedAt, setLoadedAt] = React.useState(0);
  const [meta, setMeta] = React.useState<{ total: number; totalPages: number } | null>(null);
  const [error, setError] = React.useState("");
  const [reload, setReload] = React.useState(0);
  const [settledKey, setSettledKey] = React.useState("");
  // Staff and packages seen in loaded results (no admin-only lists needed).
  const [staff, setStaff] = React.useState<Map<string, string>>(new Map());
  const [packages, setPackages] = React.useState<Map<string, string>>(new Map());

  React.useEffect(() => {
    fetch(`${API_URL}/auth/me`, { credentials: "include" }).then((r) => r.json()).then((p) => { if (p?.success) setRole(p.data.role); }).catch(() => undefined);
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.search === search ? current : { ...current, search, page: 1 })), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // View, filters and order are decided by the server over the whole result set.
  const query = listQuery(filters, focus, sort);
  const countsQuery = filterQuery(filters).toString();
  const requestKey = `${query}#${reload}`;
  const loading = settledKey !== requestKey;

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/contact-requests?${query}`, { credentials: "include" });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.success) throw new Error(payload?.message || "تعذر تحميل طلبات العمرة");
        if (cancelled) return;
        const data = payload.data as UmrahListRow[];
        setRows(data);
        setLoadedAt(Date.now());
        setMeta({ total: payload.meta?.total ?? data.length, totalPages: payload.meta?.totalPages ?? 1 });
        setError("");
        setStaff((current) => {
          const merged = new Map(current);
          for (const row of data) if (row.assignedUser) merged.set(row.assignedUser.id, row.assignedUser.fullName);
          return merged.size === current.size ? current : merged;
        });
        setPackages((current) => {
          const merged = new Map(current);
          for (const row of data) if (row.serviceRef) merged.set(row.serviceRef.id, row.serviceRef.name);
          return merged.size === current.size ? current : merged;
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "تعذر تحميل طلبات العمرة");
      } finally {
        if (!cancelled) setSettledKey(requestKey);
      }
    })();
    return () => { cancelled = true; };
  }, [query, requestKey]);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/contact-requests/umrah-focus?${countsQuery}`, { credentials: "include" })
      .then((r) => r.json())
      .then((payload) => { if (!cancelled && payload?.success) setCounts(payload.data.counts); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [countsQuery, reload]);

  const set = (key: keyof ServerFilters) => (event: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => setFilters({ ...filters, [key]: event.target.value, page: 1 });
  const canOpen = role ? CASE_ROLES.includes(role) : false;
  const now = loadedAt;
  const visible = rows || [];
  const filtered = Boolean(search || focus || Object.entries(filters).some(([key, value]) => key !== "page" && value));
  const chooseFocus = (key: FocusKey) => { setFocus(focus === key ? "" : key); setFilters((current) => (current.page === 1 ? current : { ...current, page: 1 })); };

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black"><Moon className="size-6 text-[var(--nh-gold-700)]" aria-hidden="true" />طلبات العمرة</h1>
          <p className="mt-1 max-w-3xl text-sm leading-7 text-muted-foreground">
            المرحلة والإجراء التالي يحسبهما الخادم من المستندات والدفع والتنفيذ. تاريخ السفر هو تفضيل العميل المبدئي وليس حجزًا. الأحمر فقط لطلب تجاوز موعده؛ «بلا نشاط 24 ساعة» تنبيه وليس تأخرًا.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canOpen ? <Link href="/admin/umrah/groups" className={cx(btn.base, btn.secondary, btn.md)}><Layers aria-hidden="true" />المجموعات والباقات</Link> : null}
          {role === "ACCOUNTANT" ? <Link href="/admin/payment-review" className={cx(btn.base, btn.secondary, btn.md)}>مراجعة الدفعات</Link> : null}
          <button type="button" onClick={() => setReload((n) => n + 1)} className={cx(btn.base, btn.secondary, btn.md)} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}تحديث
          </button>
        </div>
      </div>

      {role === "ACCOUNTANT" ? <Notice tone="info">عرض للاطلاع فقط: مراجعة إيصالات الدفع وقبولها تتم من صفحة «مراجعة الدفعات».</Notice> : null}

      <div className="flex flex-wrap gap-2" role="group" aria-label="متابعة المدير">
        {(Object.keys(FOCUS) as FocusKey[]).map((key) => {
          const count = counts ? counts[key] ?? 0 : null;
          const active = focus === key;
          return (
            <button key={key} type="button" data-umrah-alert={key} aria-pressed={active} title={FOCUS_HELP[key]} onClick={() => chooseFocus(key)}
              className={cx("inline-flex h-9 items-center gap-2 rounded-[10px] border px-3 text-[13px] font-bold transition",
                count && key === "AGENCY_OVERDUE" ? "border-transparent bg-[var(--nh-danger-soft)] text-[var(--nh-danger-ink)]" : count ? "border-transparent bg-[var(--nh-warning-soft)] text-[var(--nh-warning-ink)]" : "border-border bg-card text-muted-foreground",
                active && "ring-2 ring-ring")}>
              {FOCUS[key]}<span className="tabular-nums" data-umrah-count>{count ?? "…"}</span>
            </button>
          );
        })}
      </div>

      <Card title="الفلاتر" icon={<Search className="size-4 text-muted-foreground" aria-hidden="true" />} aside={filtered ? <button type="button" className={cx(btn.base, btn.ghost, btn.sm)} onClick={() => { setSearch(""); setFocus(""); setFilters(EMPTY_SERVER_FILTERS); }}>مسح الفلاتر</button> : null}>
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-bold text-muted-foreground">بحث<input aria-label="بحث" type="search" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={100} placeholder="الاسم أو الهاتف أو المرجع" className={cx(control, "font-normal")} /></label>
          <label className="text-xs font-bold text-muted-foreground">الترتيب<select aria-label="الترتيب" value={sort} onChange={(e) => { setSort(e.target.value as SortKey); setFilters((current) => (current.page === 1 ? current : { ...current, page: 1 })); }} className={control}>{(Object.keys(SORT_AR) as SortKey[]).map((key) => <option key={key} value={key}>{SORT_AR[key]}</option>)}</select></label>
          <label className="text-xs font-bold text-muted-foreground">المرحلة<select aria-label="المرحلة" value={filters.stage} onChange={set("stage")} className={control}>
            <option value="">كل المراحل</option>
            {Object.entries(STAGE_AR).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          <label className="text-xs font-bold text-muted-foreground">حالة الطلب<select aria-label="حالة الطلب" value={filters.status} onChange={set("status")} className={control}><option value="">الكل</option>{Object.entries(REQUEST_STATUS_AR).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="text-xs font-bold text-muted-foreground">الدفع<select aria-label="الدفع" value={filters.paymentStatus} onChange={set("paymentStatus")} className={control}><option value="">الكل</option>{["AWAITING_TRANSFER", "UNDER_REVIEW", "CONFIRMED", "NOT_REQUIRED"].map((key) => <option key={key} value={key}>{paymentLabel(key)}</option>)}</select></label>
          <label className="text-xs font-bold text-muted-foreground">الموظف المسؤول<select aria-label="الموظف المسؤول" value={filters.assignedUserId} onChange={set("assignedUserId")} className={control}>
            <option value="">الكل</option><option value="mine">طلباتي</option><option value="unassigned">غير مُسند</option>
            {[...staff].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select></label>
          <label className="text-xs font-bold text-muted-foreground">الباقة<select aria-label="الباقة" value={filters.serviceId} onChange={set("serviceId")} className={control}><option value="">كل الباقات</option>{[...packages].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label className="text-xs font-bold text-muted-foreground">نوع الباقة<select aria-label="نوع الباقة" value={filters.packageKind} onChange={set("packageKind")} className={control}><option value="">الكل</option><option value="VISA_ONLY">تأشيرة فقط</option><option value="AIR">مع خدمات الطيران</option><option value="SEA">مع خدمات البحر</option></select></label>
          <label className="text-xs font-bold text-muted-foreground">تاريخ التقديم من<input aria-label="تاريخ التقديم من" type="date" value={filters.createdFrom} onChange={set("createdFrom")} className={control} /></label>
          <label className="text-xs font-bold text-muted-foreground">تاريخ التقديم إلى<input aria-label="تاريخ التقديم إلى" type="date" value={filters.createdTo} min={filters.createdFrom || undefined} onChange={set("createdTo")} className={control} /></label>
        </div>
      </Card>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <Card title="الطلبات" icon={<Users className="size-4 text-[var(--nh-gold-700)]" aria-hidden="true" />}
        aside={meta ? <span className="text-xs font-bold text-muted-foreground" data-umrah-total={meta.total}>{focus ? `${FOCUS[focus]} · ` : ""}{meta.total} طلب{meta.totalPages > 1 ? ` · صفحة ${filters.page} من ${meta.totalPages}` : ""}</span> : null}>
        {loading && !rows ? (
          <p className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" />جارٍ التحميل…</p>
        ) : visible.length ? (
          <div role="table" aria-label="طلبات العمرة" className="text-sm">
            <div role="row" className="hidden gap-3 border-b border-border bg-muted px-5 py-2.5 text-xs font-bold text-muted-foreground lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.5fr)]">
              <span role="columnheader">العميل</span><span role="columnheader">الباقة</span><span role="columnheader">السفر المفضل</span><span role="columnheader">الدفع</span><span role="columnheader">المسؤول</span><span role="columnheader">المرحلة والإجراء التالي</span>
            </div>
            {visible.map((row) => <Row key={row.id} row={row} canOpen={canOpen} now={now} />)}
          </div>
        ) : rows ? (
          <p className="p-5 text-sm text-muted-foreground">لا توجد طلبات مطابقة.</p>
        ) : null}
        {meta && meta.totalPages > 1 ? (
          <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
            <button type="button" className={cx(btn.base, btn.secondary, btn.sm)} disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}><ChevronRight aria-hidden="true" />السابق</button>
            <span className="text-xs text-muted-foreground">الترتيب والفلاتر محسوبة على كل الطلبات المطابقة قبل تقسيمها إلى صفحات.</span>
            <button type="button" className={cx(btn.base, btn.secondary, btn.sm)} disabled={filters.page >= meta.totalPages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>التالي<ChevronLeft aria-hidden="true" /></button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
