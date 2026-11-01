"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, FileWarning, Loader2, Plane, RefreshCw, Search } from "lucide-react";
import { API_URL } from "@/lib/api-url";
import { egyptSignal, formatDay } from "@/components/admin/operations/ops-model";
import { Card, Notice, SignalBadge, btn, cx } from "@/components/admin/operations/ops-ui";
import {
  CIRCULAR_AR,
  EGYPT_PAYMENT_AR,
  EMPTY_FILTERS,
  ENTRY_AR,
  FILTER_AR,
  PRIORITY_AR,
  TICKET_AR,
  entryPointText,
  queueQuery,
  shortRef,
  whenText,
  type EgyptQueueResponse,
  type EgyptQueueRow,
  type QueueFilters,
} from "./egypt-model";

// The Egypt security-approval queue / travel schedule, read from
// GET /contact-requests/egypt/queue. Filtering, ordering ("schedule" = nearest
// travel date first, then priority), stage and next action are all computed by
// the server; this page only displays them and opens the case.

const control = "h-11 w-full rounded-[10px] border border-[var(--nh-line-strong)] bg-background px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring";
// Alert counts shown above the table; each one applies its server filter.
const ALERT_FILTERS = ["PAST_DUE", "URGENT", "WITHIN_3_DAYS", "UNASSIGNED"] as const;

export function egyptCaseHref(id: string) {
  return `/admin/cases?requestId=${encodeURIComponent(id)}&tab=egypt`;
}

function TravelDate({ row }: { row: EgyptQueueRow }) {
  if (row.missingDate || !row.travelDate) {
    return <span className="inline-flex h-6 items-center rounded-md bg-[var(--nh-warning-soft)] px-2 text-xs font-bold text-[var(--nh-warning-ink)]" data-egypt-flag="missing">بلا تاريخ</span>;
  }
  return (
    <span className="flex flex-col">
      <span className="font-bold tabular-nums" dir="ltr">{row.travelDate}</span>
      <span className="text-xs text-muted-foreground">{whenText(row.daysUntil)}</span>
    </span>
  );
}

function Approval({ row }: { row: EgyptQueueRow }) {
  return row.approvalIssued
    ? <span className="text-[var(--nh-success-ink)]">صدرت{row.approvalIssuedOn ? <> <span dir="ltr" className="tabular-nums">{row.approvalIssuedOn}</span></> : null}</span>
    : <span className="text-muted-foreground">لم تصدر</span>;
}

function Documents({ row }: { row: EgyptQueueRow }) {
  if (row.documentIssues?.length) return <span className="text-xs text-[var(--nh-warning-ink)]">{row.documentIssues.join(" ")}</span>;
  if (row.documentsFlagged) return <span className="text-xs text-[var(--nh-warning-ink)]">{row.documentsFlagged} صورة تحتاج تدقيقًا</span>;
  return <span className="text-xs text-[var(--nh-success-ink)]">مكتملة</span>;
}

function Owner({ row }: { row: EgyptQueueRow }) {
  return (
    <span className="flex flex-col gap-1">
      <span className={row.assignedUser ? "font-semibold" : "text-muted-foreground"}>{row.assignedUser?.fullName || "غير مُسند"}</span>
      {row.priority && row.priority !== "NORMAL" ? (
        <span data-egypt-priority={row.priority} className={cx("w-fit rounded-md px-2 text-xs font-bold", row.priority === "URGENT" || row.priority === "HIGH" ? "bg-[var(--nh-warning-soft)] text-[var(--nh-warning-ink)]" : "bg-muted text-muted-foreground")}>
          أولوية {PRIORITY_AR[row.priority] || row.priority}
        </span>
      ) : null}
    </span>
  );
}

function Signal({ row }: { row: EgyptQueueRow }) {
  const signal = egyptSignal(row);
  return signal ? <SignalBadge signal={signal} /> : null;
}

const COLUMNS = "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)]";

function QueueTable({ rows }: { rows: EgyptQueueRow[] }) {
  return (
    <div role="table" aria-label="طلبات الموافقة الأمنية لمصر" className="text-sm">
      <div role="row" className={cx("hidden gap-3 border-b border-border bg-muted px-5 py-2.5 text-xs font-bold text-muted-foreground lg:grid", COLUMNS)}>
        <span role="columnheader">العميل</span>
        <span role="columnheader">تاريخ السفر</span>
        <span role="columnheader">الدخول</span>
        <span role="columnheader">الدفع</span>
        <span role="columnheader">الموافقة / التعميم</span>
        <span role="columnheader">المستندات والتذكرة</span>
        <span role="columnheader">المسؤول</span>
        <span role="columnheader">المرحلة والإجراء التالي</span>
      </div>
      {rows.map((row) => (
        <Link
          key={row.id}
          href={egyptCaseHref(row.id)}
          role="row"
          data-egypt-id={row.id}
          className={cx("grid gap-3 border-b border-border px-5 py-4 transition last:border-b-0 hover:bg-[var(--nh-primary-soft)] focus-visible:bg-[var(--nh-primary-soft)] focus-visible:outline-none", COLUMNS)}
        >
          <span role="cell" className="flex min-w-0 flex-col gap-1">
            <span className="break-words font-bold text-foreground">{row.name}</span>
            <span className="text-xs text-muted-foreground"><span dir="ltr">{row.phone}</span> · <span dir="ltr">{shortRef(row.id)}</span> · {row.travelerCount} مسافر</span>
            <Signal row={row} />
          </span>
          <span role="cell" className="flex items-center justify-between gap-2 lg:block"><span className="text-xs text-muted-foreground lg:hidden">تاريخ السفر</span><TravelDate row={row} /></span>
          <span role="cell" className="flex items-center justify-between gap-2 lg:flex-col lg:items-start lg:justify-start lg:gap-0">
            <span className="text-xs text-muted-foreground lg:hidden">الدخول</span>
            <span>{row.entryMode ? ENTRY_AR[row.entryMode] : "—"}<span className="block text-xs text-muted-foreground" data-egypt-entry-point="1">{entryPointText(row)}</span></span>
          </span>
          <span role="cell" className="flex items-center justify-between gap-2 lg:block"><span className="text-xs text-muted-foreground lg:hidden">الدفع</span>{EGYPT_PAYMENT_AR[row.paymentStatus] || row.paymentStatus}</span>
          <span role="cell" className="flex items-center justify-between gap-2 lg:flex-col lg:items-start lg:justify-start">
            <span className="text-xs text-muted-foreground lg:hidden">الموافقة / التعميم</span>
            <span className="flex flex-col"><Approval row={row} /><span className="text-xs text-muted-foreground">التعميم: {CIRCULAR_AR[row.circularStatus || ""] || "—"}</span></span>
          </span>
          <span role="cell" className="flex items-center justify-between gap-2 lg:flex-col lg:items-start lg:justify-start">
            <span className="text-xs text-muted-foreground lg:hidden">المستندات والتذكرة</span>
            <span className="flex flex-col"><Documents row={row} /><span className="text-xs text-muted-foreground">التذكرة: {row.ticketStatus ? TICKET_AR[row.ticketStatus] || row.ticketStatus : "—"}</span></span>
          </span>
          <span role="cell" className="flex items-center justify-between gap-2 lg:block"><span className="text-xs text-muted-foreground lg:hidden">المسؤول</span><Owner row={row} /></span>
          <span role="cell" className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-muted-foreground">{row.stageLabel}</span>
            <strong className="break-words text-[13px] text-[var(--nh-primary-ink)]">{row.nextAction}</strong>
            {row.dueAt ? <span className="text-xs text-muted-foreground">موعد الإنجاز {formatDay(row.dueAt)}</span> : null}
          </span>
        </Link>
      ))}
    </div>
  );
}

export function EgyptQueue() {
  const [filters, setFilters] = React.useState<QueueFilters>(EMPTY_FILTERS);
  const [search, setSearch] = React.useState("");
  const [data, setData] = React.useState<EgyptQueueResponse | null>(null);
  // The request (query + reload count) whose answer is on screen; any other
  // value means a load is in flight.
  const [settledKey, setSettledKey] = React.useState("");
  const [error, setError] = React.useState("");
  const [reload, setReload] = React.useState(0);
  // Staff seen as assignees in loaded results; lets any role filter by a
  // colleague without needing the admin-only user list.
  const [staff, setStaff] = React.useState<Map<string, string>>(new Map());

  React.useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.search === search ? current : { ...current, search })), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const query = queueQuery(filters);
  const requestKey = `${query}#${reload}`;
  const loading = settledKey !== requestKey;

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/contact-requests/egypt/queue?${query}`, { credentials: "include" });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.success) throw new Error(payload?.message || "تعذر تحميل طلبات الموافقة الأمنية");
        if (cancelled) return;
        const next = payload.data as EgyptQueueResponse;
        setData(next);
        setError("");
        setStaff((current) => {
          const merged = new Map(current);
          for (const row of next.rows) if (row.assignedUser) merged.set(row.assignedUser.id, row.assignedUser.fullName);
          return merged.size === current.size ? current : merged;
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "تعذر تحميل طلبات الموافقة الأمنية");
      } finally {
        if (!cancelled) setSettledKey(requestKey);
      }
    })();
    return () => { cancelled = true; };
  }, [query, requestKey]);

  const set = (key: keyof QueueFilters) => (event: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => setFilters({ ...filters, [key]: event.target.value });
  const filtered = Object.entries(filters).some(([key, value]) => key !== "view" && value);
  const stageLabels = data?.stageLabels || {};

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black"><Plane className="size-6 text-[var(--nh-nile)]" aria-hidden="true" />الموافقة الأمنية لمصر</h1>
          <p className="mt-1 max-w-3xl text-sm leading-7 text-muted-foreground" id="egypt-legend">
            جدول السفر مرتب بأقرب تاريخ ثم بالأولوية. «سفر قريب» = خلال مدة تذكير السفر المحددة في إعدادات التنبيهات{data ? ` (${data.leadDays} أيام)` : ""} بتوقيت الخرطوم. الأحمر فقط لطلب تجاوز موعد إنجازه أو مضى تاريخ سفره وهو مفتوح.
          </p>
        </div>
        <button type="button" onClick={() => setReload((n) => n + 1)} className={cx(btn.base, btn.secondary, btn.md)} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}تحديث
        </button>
      </div>

      {data ? (
        <div className="flex flex-wrap gap-2" aria-label="تنبيهات">
          {ALERT_FILTERS.map((key) => {
            const count = data.filterCounts?.[key] ?? 0;
            const late = key === "PAST_DUE" || key === "URGENT";
            const active = filters.filter === key;
            return (
              <button
                key={key}
                type="button"
                data-egypt-count={key}
                aria-pressed={active}
                onClick={() => setFilters({ ...filters, filter: active ? "" : key })}
                className={cx(
                  "inline-flex h-9 items-center gap-2 rounded-[10px] border px-3 text-[13px] font-bold transition",
                  count && late ? "border-transparent bg-[var(--nh-danger-soft)] text-[var(--nh-danger-ink)]" : count ? "border-transparent bg-[var(--nh-warning-soft)] text-[var(--nh-warning-ink)]" : "border-border bg-card text-muted-foreground",
                  active && "ring-2 ring-ring",
                )}
              >
                {key === "WITHIN_3_DAYS" ? `سفر خلال ${data.leadDays} أيام` : FILTER_AR[key]}
                <span className="tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <Card title="الفلاتر" icon={<Search className="size-4 text-muted-foreground" aria-hidden="true" />} aside={filtered ? <button type="button" className={cx(btn.base, btn.ghost, btn.sm)} onClick={() => { setSearch(""); setFilters({ ...EMPTY_FILTERS, view: filters.view }); }}>مسح الفلاتر</button> : null}>
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-bold text-muted-foreground">بحث
            <input aria-label="بحث" type="search" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={80} placeholder="الاسم أو الهاتف أو المرجع" className={cx(control, "mt-1 font-normal")} />
          </label>
          <label className="text-xs font-bold text-muted-foreground">العرض
            <select aria-label="العرض" value={filters.view} onChange={set("view")} className={cx(control, "mt-1")}><option value="schedule">جدول السفر (الأقرب أولًا)</option><option value="queue">الأحدث أولًا</option></select>
          </label>
          <label className="text-xs font-bold text-muted-foreground">المرحلة
            <select aria-label="المرحلة" value={filters.stage} onChange={set("stage")} className={cx(control, "mt-1")}>
              <option value="">كل المراحل</option>
              {Object.entries(stageLabels).filter(([key]) => key !== "CLOSED").map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-muted-foreground">تصفية تشغيلية
            <select aria-label="تصفية تشغيلية" value={filters.filter} onChange={set("filter")} className={cx(control, "mt-1")}>
              <option value="">بدون</option>
              {Object.entries(FILTER_AR).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-muted-foreground">الموظف المسؤول
            <select aria-label="الموظف المسؤول" value={filters.assignee} onChange={set("assignee")} className={cx(control, "mt-1")}>
              <option value="">الكل</option>
              <option value="mine">طلباتي</option>
              <option value="unassigned">غير مُسند</option>
              {[...staff].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-muted-foreground">طريقة الدخول
            <select aria-label="طريقة الدخول" value={filters.entryMode} onChange={set("entryMode")} className={cx(control, "mt-1")}><option value="">الكل</option><option value="AIR">جوي</option><option value="BORDER">بري</option></select>
          </label>
          <label className="text-xs font-bold text-muted-foreground">السفر من
            <input aria-label="السفر من" type="date" value={filters.from} onChange={set("from")} className={cx(control, "mt-1")} />
          </label>
          <label className="text-xs font-bold text-muted-foreground">السفر إلى
            <input aria-label="السفر إلى" type="date" value={filters.to} min={filters.from || undefined} onChange={set("to")} className={cx(control, "mt-1")} />
          </label>
        </div>
        {data ? (
          <div className="flex flex-wrap gap-2 border-t border-border px-5 py-3" aria-label="عدد الطلبات حسب المرحلة">
            {Object.entries(data.counts).filter(([, count]) => count > 0).map(([key, count]) => (
              <button key={key} type="button" data-egypt-stage-count={key} aria-pressed={filters.stage === key} onClick={() => setFilters({ ...filters, stage: filters.stage === key ? "" : key })} className={cx("inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-bold", filters.stage === key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted")}>
                {stageLabels[key] || key}<span className="tabular-nums">{count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </Card>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <Card
        title={filters.view === "schedule" ? "جدول السفر" : "الطلبات — الأحدث أولًا"}
        icon={<CalendarClock className="size-4 text-[var(--nh-nile)]" aria-hidden="true" />}
        aside={data ? <span className="text-xs font-bold text-muted-foreground">{data.rows.length} طلب</span> : null}
      >
        {loading && !data ? (
          <p className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" />جارٍ التحميل…</p>
        ) : data && data.rows.length ? (
          <QueueTable rows={data.rows} />
        ) : data ? (
          <p className="p-5 text-sm text-muted-foreground">لا توجد طلبات مطابقة.</p>
        ) : null}
        {data?.truncated ? <p className="flex items-center gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground"><FileWarning className="size-4" aria-hidden="true" />النتائج كثيرة؛ ضيّق البحث بالتاريخ أو المرحلة.</p> : null}
      </Card>
    </div>
  );
}
