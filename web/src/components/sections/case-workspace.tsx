"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  RefreshCw,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";

// Smart Case Operations — Release C (employee case workspace), with the
// Release E queues/tasks/SLA, Release F provider section and Release G
// warnings rendered in the same place. One screen per case, because an
// employee working a case should not have to reconstruct its state from
// four separate admin pages.
//
// Every number shown here comes from the same server-side readiness engine
// the customer portal and the queue summary use, so staff and customer can
// never be looking at different truths.

type QueueKey =
  | "MISSING_DOCUMENTS"
  | "NEEDS_REVIEW"
  | "WAITING_CUSTOMER"
  | "WAITING_PAYMENT"
  | "READY_FOR_PROCESSING"
  | "WAITING_PROVIDER"
  | "RESULTS_READY"
  | "COMPLETED";

const QUEUE_LABEL: Record<QueueKey, string> = {
  MISSING_DOCUMENTS: "ناقصة المستندات",
  NEEDS_REVIEW: "بحاجة لمراجعة",
  WAITING_CUSTOMER: "بانتظار العميل",
  WAITING_PAYMENT: "بانتظار الدفع",
  READY_FOR_PROCESSING: "جاهزة للتنفيذ",
  WAITING_PROVIDER: "لدى الجهة",
  RESULTS_READY: "النتيجة جاهزة",
  COMPLETED: "مكتملة",
};

const QUEUE_ORDER: QueueKey[] = [
  "NEEDS_REVIEW",
  "MISSING_DOCUMENTS",
  "WAITING_CUSTOMER",
  "WAITING_PAYMENT",
  "READY_FOR_PROCESSING",
  "WAITING_PROVIDER",
  "RESULTS_READY",
];

const SLA_LABEL: Record<string, string> = {
  ON_TIME: "ضمن الموعد",
  DUE_TODAY: "تستحق اليوم",
  OVERDUE: "متأخرة",
};

const SLA_CLASS: Record<string, string> = {
  ON_TIME: "bg-emerald-500/10 text-emerald-700",
  DUE_TODAY: "bg-amber-500/10 text-amber-700",
  OVERDUE: "bg-red-500/10 text-red-700",
};

const DOCUMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "قيد المراجعة",
  ACCEPTED: "مقبول",
  REJECTED: "مرفوض",
};

type Readiness = {
  documentsComplete: boolean;
  answersComplete: boolean;
  paymentReady: boolean;
  documentsUnderReview: boolean;
  awaitingProvider: boolean;
  overall: string;
  queue: QueueKey;
  sla: string | null;
};

type Traveler = {
  id: string;
  fullName: string | null;
  passportNo: string | null;
  nationality: string | null;
  isPrimary: boolean;
};

type CaseDocument = {
  id: string;
  label: string;
  status: string;
  reviewNote: string | null;
  travelerId: string | null;
  requirementId: string | null;
  supersededAt: string | null;
  createdAt: string;
};

type CaseTask = {
  id: string;
  type: string;
  title: string;
  status: string;
  dueAt: string | null;
};

type ProviderSubmission = {
  id: string;
  status: string;
  channel: string;
  submittedAt: string | null;
  externalReference: string | null;
};

type CaseRow = {
  id: string;
  name: string;
  phone: string;
  message: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  dueAt: string | null;
  serviceRef: { name: string } | null;
  visaType: { name: string; country: string } | null;
  assignedUser: { id: string; fullName: string } | null;
  travelers: Traveler[];
  documents: CaseDocument[];
  tasks: CaseTask[];
  providerSubmissions: ProviderSubmission[];
  readiness: Readiness;
};

type Warning = {
  code: string;
  message: string;
  documentId?: string | null;
  entered?: string;
  extracted?: string;
};

type StaffUser = { id: string; fullName: string; role: string };

type TimelineEntry = {
  id: string;
  action: string;
  createdAt: string;
  user: { id: string; fullName: string } | null;
};

// The audit trail records machine actions; staff read Arabic. An action
// with no entry here falls back to its raw name rather than being hidden —
// a timeline that silently drops events it doesn't recognise is worse than
// one that occasionally shows a code.
const ACTION_LABEL: Record<string, string> = {
  CONTACT_REQUEST_RECEIVED: "استلام الطلب",
  CONTACT_REQUEST_STATUS_CHANGED: "تغيير حالة الطلب",
  CONTACT_REQUEST_ASSIGNED: "إسناد الطلب لموظف",
  CONTACT_REQUEST_UNASSIGNED: "إلغاء إسناد الطلب",
  CONTACT_REQUEST_DOCUMENT_UPLOADED: "رفع مستند",
  CONTACT_REQUEST_DOCUMENT_REVIEWED: "مراجعة مستند",
  CONTACT_REQUEST_INVOICE_SET: "تحديد السعر",
  CONTACT_REQUEST_INVOICE_APPROVED: "موافقة العميل على السعر",
  CONTACT_REQUEST_INVOICE_REJECTED: "رفض العميل للسعر",
  CONTACT_REQUEST_OFFER_ADDED: "إضافة عرض",
  CONTACT_REQUEST_OFFER_SELECTED: "اختيار العميل لعرض",
  CONTACT_REQUEST_TRANSFER_MARKED_SENT: "إعلان العميل عن التحويل",
  CONTACT_REQUEST_PAYMENT_RECEIPT_UPLOADED: "رفع إشعار الدفع",
  CONTACT_REQUEST_PAYMENT_CONFIRMED: "تأكيد الدفع",
  CONTACT_REQUEST_AUTO_COMPLETED: "إغلاق تلقائي بعد التسليم",
  TASK_CREATED: "إنشاء مهمة",
  TASK_COMPLETED: "إنهاء مهمة",
  PROVIDER_SUBMISSION_CREATED: "تجهيز إرسال للجهة",
  PROVIDER_SUBMITTED: "إرسال الحالة للجهة",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-SD", { dateStyle: "short", timeStyle: "short", calendar: "gregory" });
}

async function readJson(res: Response) {
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.success === false) {
    throw new Error(payload?.message || "تعذر تنفيذ العملية");
  }
  return payload;
}

export function CaseWorkspace() {
  const [cases, setCases] = React.useState<CaseRow[]>([]);
  const [summary, setSummary] = React.useState<{
    queues: Record<string, number>;
    open: number;
    completed: number;
    unassigned: number;
    overdue: number;
  } | null>(null);
  const [staff, setStaff] = React.useState<StaffUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [queueFilter, setQueueFilter] = React.useState<"ALL" | QueueKey>("ALL");
  const [ownerFilter, setOwnerFilter] = React.useState("ALL");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // The list is loaded by the effect itself rather than by a callback the
  // effect invokes — setState reached synchronously from an effect body
  // causes the cascading render React warns about. `reloadToken` is how a
  // user-initiated refresh (or an action inside a case) asks for a reload.
  const [reloadToken, setReloadToken] = React.useState(0);

  const refresh = React.useCallback(() => {
    setLoading(true);
    setReloadToken((token) => token + 1);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const params = new URLSearchParams({ limit: "50" });
        if (ownerFilter !== "ALL") params.set("assignedUserId", ownerFilter);

        const [listRes, summaryRes] = await Promise.all([
          fetch(`${API_URL}/contact-requests?${params.toString()}`, { credentials: "include" }),
          fetch(`${API_URL}/contact-requests/queue-summary`, { credentials: "include" }),
        ]);
        const listPayload = await readJson(listRes);
        const summaryPayload = await readJson(summaryRes);
        if (cancelled) return;
        setCases(listPayload.data ?? []);
        setSummary(summaryPayload.data ?? null);
        setError("");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "تعذر تحميل الحالات");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ownerFilter, reloadToken]);

  // Loaded once, and separately from the case list: the staff roster changes
  // far less often than the queues, and a failure to load it must only cost
  // the assignment dropdown, not the whole workspace.
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/users?limit=100`, { credentials: "include" });
        const payload = await readJson(res);
        setStaff(payload.data ?? []);
      } catch {
        setStaff([]);
      }
    })();
  }, []);

  const visible = React.useMemo(
    () => (queueFilter === "ALL" ? cases : cases.filter((row) => row.readiness?.queue === queueFilter)),
    [cases, queueFilter]
  );

  const selected = visible.find((row) => row.id === selectedId) ?? null;

  return (
    <main className="min-h-screen bg-section py-8 sm:py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <p className="text-xs font-bold text-muted-foreground">نسائم الحرمين</p>
            <h1 className="mt-1 text-2xl font-black text-foreground sm:text-3xl">مساحة عمل الحالات</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
              كل ما يخص الحالة في شاشة واحدة: الجاهزية، المسافرون، المستندات، المهام، والجهة المنفّذة.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            تحديث
          </Button>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-bold text-destructive">
            {error}
          </div>
        ) : null}

        <QueueSummaryCards
          summary={summary}
          active={queueFilter}
          onSelect={(key) => setQueueFilter((current) => (current === key ? "ALL" : key))}
        />

        <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-black">الحالات ({visible.length})</h2>
              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
                className="h-9 rounded-lg border border-border bg-background px-2 text-xs font-semibold outline-none"
              >
                <option value="ALL">كل الموظفين</option>
                <option value="unassigned">بلا موظف</option>
                {staff.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName}
                  </option>
                ))}
              </select>
            </div>

            <ul className="mt-3 flex max-h-[36rem] flex-col gap-2 overflow-y-auto">
              {loading && cases.length === 0 ? (
                <li className="py-8 text-center text-sm text-muted-foreground">جاري التحميل…</li>
              ) : null}
              {!loading && visible.length === 0 ? (
                <li className="py-8 text-center text-sm font-semibold text-emerald-700">لا توجد حالات في هذا القسم.</li>
              ) : null}
              {visible.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={`w-full rounded-xl border p-3 text-start transition ${
                      selectedId === row.id ? "border-primary bg-primary/5" : "border-border/70 hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-foreground">{row.name}</span>
                      {row.readiness?.sla ? (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${SLA_CLASS[row.readiness.sla]}`}>
                          {SLA_LABEL[row.readiness.sla]}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.serviceRef?.name || row.visaType?.name || "استفسار عام"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="rounded-full bg-muted px-2 py-0.5 font-bold text-muted-foreground">
                        {QUEUE_LABEL[row.readiness?.queue] ?? "—"}
                      </span>
                      <span className="text-muted-foreground">
                        {row.assignedUser?.fullName ?? "بلا موظف"}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {selected ? (
            <CaseDetail key={selected.id} caseRow={selected} staff={staff} onChanged={refresh} />
          ) : (
            <div className="flex items-center justify-center rounded-3xl border border-dashed border-border bg-card p-10 text-sm text-muted-foreground">
              اختر حالة من القائمة لعرض تفاصيلها.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function QueueSummaryCards({
  summary,
  active,
  onSelect,
}: {
  summary: { queues: Record<string, number>; open: number; completed: number; unassigned: number; overdue: number } | null;
  active: "ALL" | QueueKey;
  onSelect: (key: QueueKey) => void;
}) {
  return (
    <>
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "حالات مفتوحة", value: summary?.open ?? 0 },
          { label: "بلا موظف", value: summary?.unassigned ?? 0 },
          { label: "متأخرة", value: summary?.overdue ?? 0 },
          { label: "مكتملة", value: summary?.completed ?? 0 },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-bold text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-3xl font-black text-foreground">{card.value}</p>
          </div>
        ))}
      </section>

      {/* Clicking a queue filters the list to it — the counts and the list
          come from the same readiness computation, so they always agree. */}
      <section className="mt-3 flex flex-wrap gap-2">
        {QUEUE_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
              active === key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {QUEUE_LABEL[key]} ({summary?.queues?.[key] ?? 0})
          </button>
        ))}
      </section>
    </>
  );
}

function CaseDetail({
  caseRow,
  staff,
  onChanged,
}: {
  caseRow: CaseRow;
  staff: StaffUser[];
  onChanged: () => void;
}) {
  const [tab, setTab] = React.useState<"overview" | "travelers" | "documents" | "tasks" | "provider" | "activity">("overview");
  const [warnings, setWarnings] = React.useState<Warning[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState("");

  // Warnings are per case and advisory, so they are fetched with the case
  // detail rather than loaded for every row in the list.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/contact-requests/${caseRow.id}/warnings`, { credentials: "include" });
        const payload = await readJson(res);
        if (!cancelled) setWarnings(payload.data ?? []);
      } catch {
        if (!cancelled) setWarnings([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseRow.id]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setActionError("");
    try {
      await action();
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "تعذر تنفيذ العملية");
    } finally {
      setBusy(false);
    }
  }

  const tabs = [
    { key: "overview" as const, label: "نظرة عامة" },
    { key: "travelers" as const, label: `المسافرون (${caseRow.travelers.length})` },
    { key: "documents" as const, label: `المستندات (${caseRow.documents.filter((d) => !d.supersededAt).length})` },
    { key: "tasks" as const, label: `المهام (${caseRow.tasks.length})` },
    { key: "provider" as const, label: "الجهة المنفّذة" },
    { key: "activity" as const, label: "السجل" },
  ];

  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-foreground">{caseRow.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
            {caseRow.phone}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
            {QUEUE_LABEL[caseRow.readiness?.queue] ?? "—"}
          </span>
          {caseRow.readiness?.sla ? (
            <span className={`rounded-full px-3 py-1 text-xs font-black ${SLA_CLASS[caseRow.readiness.sla]}`}>
              {SLA_LABEL[caseRow.readiness.sla]}
            </span>
          ) : null}
        </div>
      </div>

      {warnings.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="flex items-center gap-2 text-sm font-black text-amber-700">
            <AlertTriangle className="size-4" />
            تنبيهات ({warnings.length})
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-amber-800">
            {warnings.map((warning, index) => (
              <li key={`${warning.code}-${index}`}>
                {warning.message}
                {warning.entered && warning.extracted ? (
                  <span className="text-muted-foreground" dir="ltr">
                    {" "}
                    ({warning.entered} ≠ {warning.extracted})
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-amber-700/80">
            هذه تنبيهات للمراجعة فقط، ولا توقف الحالة تلقائيًا.
          </p>
        </div>
      ) : null}

      {actionError ? (
        <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm font-bold text-destructive">
          {actionError}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 border-b border-border pb-2">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              tab === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "overview" ? <OverviewTab caseRow={caseRow} staff={staff} busy={busy} run={run} /> : null}
        {tab === "travelers" ? <TravelersTab caseRow={caseRow} /> : null}
        {tab === "documents" ? <DocumentsTab caseRow={caseRow} busy={busy} run={run} /> : null}
        {tab === "tasks" ? <TasksTab caseRow={caseRow} busy={busy} run={run} /> : null}
        {tab === "provider" ? <ProviderTab caseRow={caseRow} /> : null}
        {tab === "activity" ? <ActivityTab caseId={caseRow.id} /> : null}
      </div>
    </div>
  );
}

function ReadinessRow({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {done ? (
        <CheckCircle2 className="size-4 text-emerald-600" />
      ) : (
        <ClipboardList className="size-4 text-amber-600" />
      )}
      <span className={done ? "text-muted-foreground" : "font-semibold text-foreground"}>{label}</span>
    </li>
  );
}

function OverviewTab({
  caseRow,
  staff,
  busy,
  run,
}: {
  caseRow: CaseRow;
  staff: StaffUser[];
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const readiness = caseRow.readiness;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-border/70 p-4">
        <h3 className="text-sm font-black">الجاهزية</h3>
        <ul className="mt-2 flex flex-col gap-2">
          <ReadinessRow done={readiness?.documentsComplete} label="المستندات المطلوبة مكتملة" />
          <ReadinessRow done={readiness?.answersComplete} label="البيانات المطلوبة مكتملة" />
          <ReadinessRow done={readiness?.paymentReady} label="الدفع مكتمل أو غير مطلوب" />
          <ReadinessRow done={!readiness?.documentsUnderReview} label="لا توجد مستندات قيد المراجعة" />
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          {readiness?.overall === "READY_FOR_PROCESSING"
            ? "الحالة جاهزة للتنفيذ."
            : "الحالة غير جاهزة للتنفيذ بعد."}
        </p>
      </div>

      <div className="rounded-2xl border border-border/70 p-4">
        <h3 className="text-sm font-black">الإسناد</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {caseRow.assignedUser?.fullName ?? "لم تُسند هذه الحالة لأي موظف بعد."}
        </p>
        <select
          value={caseRow.assignedUser?.id ?? ""}
          disabled={busy}
          onChange={(e) => {
            const assignedUserId = e.target.value || null;
            void run(async () => {
              const res = await fetch(`${API_URL}/contact-requests/${caseRow.id}/assign`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assignedUserId }),
              });
              await readJson(res);
            });
          }}
          className="mt-3 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold outline-none"
        >
          <option value="">بلا موظف</option>
          {staff.map((user) => (
            <option key={user.id} value={user.id}>
              {user.fullName}
            </option>
          ))}
        </select>

        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <dt className="text-muted-foreground">الخدمة</dt>
          <dd className="font-semibold">{caseRow.serviceRef?.name || caseRow.visaType?.name || "—"}</dd>
          <dt className="text-muted-foreground">تاريخ الإنشاء</dt>
          <dd className="font-semibold">{formatDate(caseRow.createdAt)}</dd>
          <dt className="text-muted-foreground">الموعد المتوقع</dt>
          <dd className="font-semibold">{formatDate(caseRow.dueAt)}</dd>
        </dl>
      </div>

      <div className="rounded-2xl border border-border/70 p-4 md:col-span-2">
        <h3 className="text-sm font-black">طلب العميل</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{caseRow.message}</p>
      </div>
    </div>
  );
}

function TravelersTab({ caseRow }: { caseRow: CaseRow }) {
  if (caseRow.travelers.length === 0) {
    return <p className="text-sm text-muted-foreground">لا يوجد مسافرون مسجّلون في هذه الحالة.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {caseRow.travelers.map((traveler) => (
        <li key={traveler.id} className="rounded-xl border border-border/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold">
              {traveler.fullName || "بدون اسم"}
              {traveler.isPrimary ? (
                <span className="ms-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-black text-primary">
                  المسافر الرئيسي
                </span>
              ) : null}
            </span>
            <span className="text-xs text-muted-foreground" dir="ltr">
              {traveler.passportNo || "—"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{traveler.nationality || "الجنسية غير محددة"}</p>
        </li>
      ))}
    </ul>
  );
}

function DocumentsTab({
  caseRow,
  busy,
  run,
}: {
  caseRow: CaseRow;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [noteByDocument, setNoteByDocument] = React.useState<Record<string, string>>({});

  // Grouped per traveler, because that is how a passport-per-person case is
  // actually reviewed. Documents with no traveler (or on a case with none)
  // fall into a final "general" group rather than disappearing.
  const groups: { id: string | null; name: string; documents: CaseDocument[] }[] = [];
  for (const traveler of caseRow.travelers) {
    groups.push({
      id: traveler.id,
      name: traveler.fullName || "مسافر بدون اسم",
      documents: caseRow.documents.filter((d) => d.travelerId === traveler.id),
    });
  }
  const ungrouped = caseRow.documents.filter((d) => !d.travelerId || !caseRow.travelers.some((t) => t.id === d.travelerId));
  if (ungrouped.length > 0) groups.push({ id: null, name: "مستندات عامة", documents: ungrouped });

  async function review(documentId: string, status: "ACCEPTED" | "REJECTED") {
    const reviewNote = noteByDocument[documentId] || "";
    // A rejection the customer can't act on is a wasted round trip, so the
    // reason is required here rather than optional.
    if (status === "REJECTED" && reviewNote.trim().length === 0) {
      throw new Error("يرجى كتابة سبب الرفض ليتمكن العميل من التصحيح");
    }
    const res = await fetch(`${API_URL}/contact-requests/${caseRow.id}/documents/${documentId}/status`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reviewNote }),
    });
    await readJson(res);
  }

  if (caseRow.documents.length === 0) {
    return <p className="text-sm text-muted-foreground">لم يرفع العميل أي مستندات بعد.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.id ?? "general"} className="rounded-2xl border border-border/70 p-3">
          <h3 className="text-sm font-black">{group.name}</h3>
          {group.documents.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">لا توجد مستندات لهذا المسافر.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {group.documents.map((document) => (
                <li
                  key={document.id}
                  className={`rounded-xl border p-3 text-xs ${
                    document.supersededAt ? "border-border/50 bg-muted/30 opacity-70" : "border-border/70"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{document.label}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 font-bold text-muted-foreground">
                      {document.supersededAt
                        ? "نسخة سابقة"
                        : (DOCUMENT_STATUS_LABEL[document.status] ?? document.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{formatDate(document.createdAt)}</p>
                  {document.reviewNote ? (
                    <p className="mt-1 text-muted-foreground">ملاحظة المراجعة: {document.reviewNote}</p>
                  ) : null}

                  {/* A superseded version is history — it is shown for the
                      audit trail but can no longer be reviewed. */}
                  {!document.supersededAt ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <a
                        href={`${API_URL}/contact-requests/${caseRow.id}/documents/${document.id}/file`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 font-bold text-muted-foreground transition hover:bg-muted"
                      >
                        <FileText className="size-3.5" />
                        فتح الملف
                      </a>
                      <input
                        type="text"
                        value={noteByDocument[document.id] ?? ""}
                        onChange={(e) =>
                          setNoteByDocument((current) => ({ ...current, [document.id]: e.target.value }))
                        }
                        placeholder="سبب الرفض (مطلوب عند الرفض)"
                        className="h-8 min-w-48 flex-1 rounded-lg border border-border bg-background px-2 outline-none"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void run(() => review(document.id, "ACCEPTED"))}
                      >
                        قبول
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void run(() => review(document.id, "REJECTED"))}
                      >
                        رفض
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function TasksTab({
  caseRow,
  busy,
  run,
}: {
  caseRow: CaseRow;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [title, setTitle] = React.useState("");

  return (
    <div className="flex flex-col gap-4">
      {caseRow.tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد مهام مفتوحة على هذه الحالة.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {caseRow.tasks.map((task) => (
            <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 p-3">
              <div>
                <p className="text-sm font-semibold">{task.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {task.dueAt ? `تستحق ${formatDate(task.dueAt)}` : "بدون موعد محدد"}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const res = await fetch(
                      `${API_URL}/contact-requests/${caseRow.id}/tasks/${task.id}/complete`,
                      { method: "PATCH", credentials: "include" }
                    );
                    await readJson(res);
                  })
                }
              >
                إنهاء
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim().length < 2) return;
          void run(async () => {
            const res = await fetch(`${API_URL}/contact-requests/${caseRow.id}/tasks`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title, type: "OTHER" }),
            });
            await readJson(res);
            setTitle("");
          });
        }}
      >
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="مهمة جديدة، مثال: الاتصال بالعميل"
          className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none"
        />
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ClipboardList className="size-4" />}
          إضافة
        </Button>
      </form>
    </div>
  );
}

function ProviderTab({ caseRow }: { caseRow: CaseRow }) {
  if (caseRow.providerSubmissions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        <Send className="mx-auto size-5" />
        <p className="mt-2">لم تُرسل هذه الحالة إلى أي جهة منفّذة بعد.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {caseRow.providerSubmissions.map((submission) => (
        <li key={submission.id} className="rounded-xl border border-border/70 p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">
              {submission.channel === "EMAIL" ? "إرسال بالبريد" : "تسليم يدوي / بوابة"}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 font-bold text-muted-foreground">{submission.status}</span>
          </div>
          <p className="mt-1 text-muted-foreground">أُرسلت: {formatDate(submission.submittedAt)}</p>
          {submission.externalReference ? (
            <p className="mt-1 text-muted-foreground" dir="ltr">
              {submission.externalReference}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ActivityTab({ caseId }: { caseId: string }) {
  const [entries, setEntries] = React.useState<TimelineEntry[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/contact-requests/${caseId}/timeline`, { credentials: "include" });
        const payload = await readJson(res);
        if (!cancelled) setEntries(payload.data ?? []);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  if (failed) return <p className="text-sm text-muted-foreground">تعذّر تحميل سجل الحالة.</p>;
  if (entries === null) return <p className="text-sm text-muted-foreground">جاري تحميل السجل…</p>;
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">لا توجد أحداث مسجّلة على هذه الحالة.</p>;

  return (
    <ol className="flex flex-col gap-2">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 p-3 text-xs">
          <span className="text-sm font-semibold">{ACTION_LABEL[entry.action] ?? entry.action}</span>
          <span className="text-muted-foreground">
            {entry.user?.fullName ? `${entry.user.fullName} · ` : ""}
            {formatDate(entry.createdAt)}
          </span>
        </li>
      ))}
    </ol>
  );
}
