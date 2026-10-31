// Operations Center data model. Every value shown on the page comes from an
// existing staff endpoint; nothing here invents dates, deadlines or metrics.
//
//   GET /dashboard/operations            all staff roles: queues + action items
//   GET /contact-requests/egypt/queue    SUPER_ADMIN, ADMIN, EMPLOYEE
//   GET /contact-requests?serviceKind=UMRAH&status=…   same roles
//   GET /contact-requests/queue-summary  same roles

export type StaffRole = "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE" | "ACCOUNTANT" | "CONTENT_MANAGER";
export type CurrentUser = { id: string; fullName: string; role: StaffRole };

export type TransferClaim = { kind?: string; payAmount?: string | number | null; payCurrency?: string | null; rate?: string | number | null; accountChosen?: boolean } | null;

export type OperationItem = {
  source: "contact_request" | "order" | string;
  id: string;
  reference: string;
  customerName: string;
  phone: string;
  service: string;
  serviceId?: string | null;
  status: string;
  paymentStatus: string;
  amount: string | number | null;
  currency: string | null;
  updatedAt: string;
  ageHours?: number;
  assignedUser?: string | null;
  assignedUserId?: string | null;
  hasPaymentUnderReview?: boolean;
  receiptDocumentId?: string | null;
  transferClaim?: TransferClaim;
  needsConfirmReason?: boolean;
  pendingPayment?: { id: string; amount: string | number; currency: string | null } | null;
  nextAction: { key: string; label: string };
};

export type OperationPayload = { queues: Record<string, number>; items: OperationItem[] };

// One row of GET /contact-requests/egypt/queue (egypt-queue.service.js toQueueRow).
export type EgyptRow = {
  id: string;
  name: string;
  phone: string;
  entryMode: "AIR" | "BORDER" | null;
  entryPoint: string | null;
  priority: string;
  dueAt: string | null;
  pastDue: boolean;
  status: string;
  paymentStatus: string;
  stage: string;
  stageLabel: string;
  approvalIssued: boolean;
  circularStatus: string | null;
  travelDate: string | null;
  daysUntil: number | null;
  imminent: boolean;
  overdue: boolean;
  missingDate: boolean;
  documentIssues: string[];
  assignedUser: { id: string; fullName: string } | null;
  nextAction: string;
};
export type EgyptQueue = { rows: EgyptRow[]; counts: Record<string, number>; filterCounts: Record<string, number>; leadDays: number; truncated: boolean };

// One Umrah row of GET /contact-requests (the fields this page reads).
export type UmrahRow = {
  id: string;
  name: string;
  status: string;
  paymentStatus: string;
  updatedAt: string;
  assignedUser: { id: string; fullName: string } | null;
  readiness?: { sla?: string | null } | null;
  umrahQueue?: { nextAction: string; rank: number; preferredTravelDate: string | null } | null;
};

export type QueueSummary = { queues: Record<string, number>; open: number; completed: number; unassigned: number; overdue: number };

export const SERVICE_QUEUE_ROLES: readonly StaffRole[] = ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"];
export const MANAGER_ROLES: readonly StaffRole[] = ["SUPER_ADMIN", "ADMIN"];

export const STATUS_LABEL: Record<string, string> = {
  NEW: "جديد", UNDER_REVIEW: "قيد المراجعة", WAITING_DOCUMENTS: "بانتظار المستندات", PAYMENT_PENDING: "بانتظار الدفع",
  PROCESSING: "قيد التنفيذ", APPROVED: "معتمد", COMPLETED: "مكتمل", REJECTED: "مرفوض", CANCELLED: "ملغي",
  CONTACTED: "قيد المتابعة", CLOSED: "مغلق",
  NOT_REQUIRED: "غير مطلوب", AWAITING_TRANSFER: "بانتظار التحويل", UNDER_REVIEW_PAYMENT: "الدفع قيد المراجعة",
  CONFIRMED: "تم التأكيد", UNPAID: "غير مدفوع", PARTIAL: "جزئي", PAID: "مدفوع",
};
export const PAYMENT_LABEL: Record<string, string> = {
  NOT_REQUIRED: "غير مطلوب", AWAITING_TRANSFER: "بانتظار التحويل", UNDER_REVIEW: "إيصال قيد المراجعة",
  CONFIRMED: "مؤكد", UNPAID: "غير مدفوع", PARTIAL: "مدفوع جزئيًا", PAID: "مدفوع", PENDING: "بانتظار الدفع",
};
export function statusLabel(value: string) { return STATUS_LABEL[value] || value; }
export function paymentLabel(value: string) { return PAYMENT_LABEL[value] || STATUS_LABEL[value] || value; }

export function formatAmount(amount: string | number | null | undefined, currency: string | null | undefined) {
  if (amount == null || amount === "") return "—";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency || ""}`.trim();
}

export function formatDay(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("ar", { day: "numeric", month: "long", timeZone: "UTC", numberingSystem: "latn" });
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" });
}

export function ageText(hours: number | undefined) {
  if (hours == null) return "";
  if (hours < 1) return "منذ أقل من ساعة";
  if (hours < 48) return `منذ ${hours} ساعة`;
  return `منذ ${Math.floor(hours / 24)} يوم`;
}

// ── Existing Operations Center rules (unchanged from operations-center.tsx) ──

export type Priority = "urgent" | "stalled" | "customer" | "normal";
export function priority(item: OperationItem): Priority {
  if (item.nextAction.key === "CONFIRM_PAYMENT" || item.nextAction.key === "DELIVER") return "urgent";
  if ((item.ageHours ?? 0) >= 24) return "stalled";
  if (item.nextAction.key === "CUSTOMER_DECISION") return "customer";
  return "normal";
}
export function nextStatus(item: OperationItem) {
  if (item.source !== "order") return null;
  if (item.nextAction.key === "REVIEW") return "UNDER_REVIEW";
  if (item.nextAction.key === "CLOSE") return "COMPLETED";
  return null;
}
export function actionTarget(item: { source: string; id: string }) {
  return item.source === "order" ? `/admin-dashboard.html?order=${encodeURIComponent(item.id)}` : `/admin/cases?requestId=${encodeURIComponent(item.id)}`;
}
export function caseHref(id: string) { return `/admin/cases?requestId=${encodeURIComponent(id)}`; }

// ── Visual priority (approved rule R2) ──
// late:   a genuinely missed operational deadline → the only red.
// warn:   high priority, approaching date, due today, or 24 h without activity → amber.
// wait:   waiting on the customer → neutral.
// normal: ordinary work → neutral.
export type Level = "late" | "warn" | "wait" | "normal";
export type Signal = { level: Level; label: string; detail?: string };
export const LEVEL_RANK: Record<Level, number> = { late: 0, warn: 1, wait: 2, normal: 3 };

export type ServiceIndex = { egypt: Map<string, EgyptRow>; umrah: Map<string, UmrahRow> };

export function egyptSignal(row: EgyptRow): Signal | null {
  if (row.pastDue) return { level: "late", label: "متأخر عن الموعد", detail: row.dueAt ? `كان الموعد ${formatDay(row.dueAt)}` : undefined };
  if (row.overdue) return { level: "late", label: "تجاوز تاريخ السفر", detail: `السفر كان ${formatDay(row.travelDate)} والطلب مفتوح` };
  if (row.imminent) return { level: "warn", label: row.daysUntil === 0 ? "السفر اليوم" : `السفر خلال ${row.daysUntil} يوم`, detail: formatDay(row.travelDate) };
  return null;
}

export function umrahSignal(row: UmrahRow): Signal | null {
  if (row.readiness?.sla === "OVERDUE") return { level: "late", label: "متأخر عن الموعد" };
  if (row.readiness?.sla === "DUE_TODAY") return { level: "warn", label: "يستحق اليوم" };
  return null;
}

export function itemSignal(item: OperationItem, index: ServiceIndex): Signal {
  const eg = index.egypt.get(item.id);
  const um = index.umrah.get(item.id);
  const service = (eg && egyptSignal(eg)) || (um && umrahSignal(um));
  if (service?.level === "late") return service;
  const p = priority(item);
  if (p === "urgent") return { level: "warn", label: "أولوية عالية" };
  if (service) return service;
  if (p === "stalled") return { level: "warn", label: "بلا نشاط 24 ساعة+", detail: "ليس تأخرًا عن موعد" };
  if (p === "customer") return { level: "wait", label: "لدى العميل" };
  return { level: "normal", label: "عادية" };
}

export function serviceOf(item: { id: string; service?: string }, index: ServiceIndex): "egypt" | "umrah" | null {
  if (index.egypt.has(item.id)) return "egypt";
  if (index.umrah.has(item.id)) return "umrah";
  return null;
}

// The owner of a row: orders carry it; Egypt and Umrah requests take it from
// their service queue; other request types do not expose it on this endpoint.
export function ownerOf(item: OperationItem, index: ServiceIndex): { known: boolean; name: string | null } {
  if (item.source === "order") return { known: true, name: item.assignedUser || null };
  const row = index.egypt.get(item.id) || index.umrah.get(item.id);
  if (row) return { known: true, name: row.assignedUser?.fullName || null };
  return { known: false, name: null };
}

// Workload per employee across the open Egypt and Umrah requests.
export type Workload = { id: string; name: string; open: number; late: number };
export function workload(egypt: EgyptRow[], umrah: UmrahRow[]): { people: Workload[]; unassigned: number } {
  const map = new Map<string, Workload>();
  let unassigned = 0;
  const add = (user: { id: string; fullName: string } | null, late: boolean) => {
    if (!user) { unassigned += 1; return; }
    const entry = map.get(user.id) || { id: user.id, name: user.fullName, open: 0, late: 0 };
    entry.open += 1;
    if (late) entry.late += 1;
    map.set(user.id, entry);
  };
  for (const row of egypt) add(row.assignedUser, egyptSignal(row)?.level === "late");
  for (const row of umrah) add(row.assignedUser, umrahSignal(row)?.level === "late");
  return { people: [...map.values()].sort((a, b) => b.late - a.late || b.open - a.open), unassigned };
}
