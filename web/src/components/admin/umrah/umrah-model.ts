// Umrah requests — types and labels for the Next.js admin.
//
// The workflow is the existing one: the stage, the steps and their state come
// from backend contact-request-progress/request-progress.js (`progress`), the
// staff next step from backend umrah/umrah-staff-queue.js (`umrahQueue`), and
// the SLA from the readiness policy (`readiness.sla`). Nothing here creates a
// stage or a rule; the maps below only translate values the server returns.

import { umrahPackageDetails, UMRAH_KIND_LABELS } from "@/lib/umrah-package";
import type { Signal } from "@/components/admin/operations/ops-model";

export type ProgressStep = { key: string; label: string; state: "done" | "current" | "upcoming"; status?: string; started?: boolean };
export type Progress = {
  serviceKind?: string;
  stage?: string;
  label?: string;
  pricingMode?: string;
  pricing?: { total: number | string; currency: string; units?: number; priceUnit?: string } | null;
  canStartExecution?: boolean;
  blockers?: { code: string; message: string }[];
  completionBlockers?: { code: string; message: string }[];
  delivery?: { complete: boolean; coveredTravelerIds: string[]; missingTravelerIds: string[] };
  steps?: ProgressStep[];
};

export type UmrahListRow = {
  id: string;
  name: string;
  phone: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
  dueAt: string | null;
  travelerCount?: number | null;
  travelers: { id: string; fullName: string | null }[];
  assignedUser: { id: string; fullName: string } | null;
  serviceRef: { id: string; name: string; category?: string; features?: unknown } | null;
  invoice?: { amount: string | number; currency: string; status?: string } | null;
  readiness?: { sla?: string | null; documentsComplete?: boolean; queue?: string } | null;
  progress?: Progress | null;
  umrahQueue?: { nextAction: string; rank: number; preferredTravelDate: string | null } | null;
  intakeData?: {
    umrahContacts?: { guarantorPhone?: string; guarantorPhoneMissing?: boolean } | null;
    umrahTravel?: { preferredDate?: string; preferredDateMissing?: boolean } | null;
  } | null;
};

// progress.stage values (request-progress.js), as staff read them.
export const STAGE_AR: Record<string, string> = {
  REVIEW: "مراجعة الطلب",
  QUOTE_PENDING: "بانتظار عرض السعر",
  QUOTE_REJECTED: "رُفض عرض السعر",
  AWAITING_DOCUMENT_REVIEW: "بانتظار مراجعة المستندات",
  AWAITING_PAYMENT: "بانتظار الدفع",
  PAYMENT_REVIEW: "مراجعة إيصال الدفع",
  PAYMENT_ACCEPTED: "تم قبول الدفع",
  IN_EXECUTION: "قيد التنفيذ",
  DELIVERED: "تم التسليم",
  CLOSED: "مغلق",
};
export const REQUEST_STATUS_AR: Record<string, string> = { NEW: "جديد", CONTACTED: "قيد المتابعة", CLOSED: "مغلق" };
export const DOCUMENT_STATUS_AR: Record<string, string> = { PENDING: "بانتظار المراجعة", ACCEPTED: "مقبول", REJECTED: "مرفوض" };
export const GUARANTOR_RESIDENCE = "إقامة الضامن";

export function packageKind(row: Pick<UmrahListRow, "serviceRef">) {
  const kind = umrahPackageDetails(row.serviceRef?.features).kind;
  return { kind, label: kind ? UMRAH_KIND_LABELS[kind] : null };
}

export function stageLabel(row: Pick<UmrahListRow, "progress">) {
  const stage = row.progress?.stage || "";
  return STAGE_AR[stage] || stage || "—";
}

/** Hours since the request last changed. */
export function idleHours(row: Pick<UmrahListRow, "updatedAt">, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(row.updatedAt).getTime()) / 3_600_000));
}

/** Waiting on the customer (umrah-staff-queue ranks 5 and 6): not staff's delay. */
export function waitingOnCustomer(row: Pick<UmrahListRow, "umrahQueue">) {
  const rank = row.umrahQueue?.rank;
  return rank === 5 || rank === 6;
}

// Approved rule R2: red only for a genuinely missed deadline (SLA OVERDUE);
// amber for due today or 24 h without activity on staff's side.
export function umrahRowSignal(row: UmrahListRow, now = Date.now()): Signal | null {
  if (row.status === "CLOSED") return null;
  if (row.readiness?.sla === "OVERDUE") return { level: "late", label: "متأخر عن الموعد" };
  if (row.readiness?.sla === "DUE_TODAY") return { level: "warn", label: "يستحق اليوم" };
  if (waitingOnCustomer(row)) return { level: "wait", label: "بانتظار العميل" };
  if (idleHours(row, now) >= 24) return { level: "warn", label: "بلا نشاط 24 ساعة+", detail: "ليس تأخرًا عن موعد" };
  return null;
}

// Manager views (backend umrah-queue-index.js focusWhere), counted by the
// server over every matching request — never one page — under the same
// filters as the list (GET /contact-requests/umrah-focus). PAYMENT_REVIEW is
// the payment-review stage.
export const FOCUS = {
  UNASSIGNED: "بلا موظف",
  AGENCY_OVERDUE: "متأخرة لدى الوكالة",
  WAITING_CUSTOMER: "بانتظار العميل",
  PARTIAL_VISAS: "صدر بعض تأشيراتها",
  PAYMENT_REVIEW: "إيصالات للمراجعة",
} as const;
export type FocusKey = keyof typeof FOCUS;
export const FOCUS_HELP: Record<FocusKey, string> = {
  UNASSIGNED: "طلبات مفتوحة لم يستلمها موظف بعد.",
  AGENCY_OVERDUE: "الإجراء على الوكالة، وتجاوز الطلب موعد الإنجاز أو عليه تأشيرة متأخرة.",
  WAITING_CUSTOMER: "الإجراء التالي على العميل: مستندات أو دفع.",
  PARTIAL_VISAS: "صدرت تأشيرة واحدة على الأقل ولم تصدر كل التأشيرات.",
  PAYMENT_REVIEW: "إيصالات تحويل بانتظار المراجعة.",
};

export type SortKey = "action" | "travel" | "newest";
export const SORT_AR: Record<SortKey, string> = { action: "الإجراء المطلوب أولًا", travel: "أقرب تاريخ سفر", newest: "الأحدث أولًا" };

export type ServerFilters = { search: string; status: string; paymentStatus: string; assignedUserId: string; serviceId: string; createdFrom: string; createdTo: string; stage: string; packageKind: string; page: number };
export const EMPTY_SERVER_FILTERS: ServerFilters = { search: "", status: "", paymentStatus: "", assignedUserId: "", serviceId: "", createdFrom: "", createdTo: "", stage: "", packageKind: "", page: 1 };
export const PAGE_SIZE = 100; // the API's maximum

const FILTER_KEYS = ["search", "status", "paymentStatus", "assignedUserId", "serviceId", "createdFrom", "createdTo", "stage", "packageKind"] as const;

/** The filters alone: the list and its manager counts use exactly these. */
export function filterQuery(filters: ServerFilters) {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = filters[key].trim();
    if (value) params.set(key, value);
  }
  return params;
}

/** One page of the list; the view and order are applied by the server before paging. */
export function listQuery(filters: ServerFilters, focus: FocusKey | "" = "", sort: SortKey = "action") {
  const params = filterQuery(filters);
  params.set("serviceKind", "UMRAH");
  params.set("limit", String(PAGE_SIZE));
  params.set("page", String(filters.page));
  if (focus === "PAYMENT_REVIEW") params.set("stage", "PAYMENT_REVIEW");
  else if (focus) params.set("focus", focus);
  if (sort !== "newest") params.set("sort", sort === "travel" ? "travel" : "queue");
  return params.toString();
}
