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

export const ALERTS = {
  LATE: "متأخرة عن الموعد",
  DUE_TODAY: "تستحق اليوم",
  PAYMENT_REVIEW: "إيصالات للمراجعة",
  STALLED: "بلا نشاط 24 ساعة+",
  MISSING_INFO: "هاتف الضامن أو تاريخ السفر ناقص",
  UNASSIGNED: "بلا موظف",
} as const;
export type AlertKey = keyof typeof ALERTS;

export function alertMatches(key: AlertKey, row: UmrahListRow, now = Date.now()) {
  if (row.status === "CLOSED") return false;
  switch (key) {
    case "LATE": return row.readiness?.sla === "OVERDUE";
    case "DUE_TODAY": return row.readiness?.sla === "DUE_TODAY";
    case "PAYMENT_REVIEW": return row.progress?.stage === "PAYMENT_REVIEW";
    case "STALLED": return !waitingOnCustomer(row) && idleHours(row, now) >= 24;
    case "MISSING_INFO": return Boolean(row.intakeData?.umrahContacts?.guarantorPhoneMissing || row.intakeData?.umrahTravel?.preferredDateMissing);
    case "UNASSIGNED": return !row.assignedUser;
  }
}

export type SortKey = "action" | "travel" | "newest";
export const SORT_AR: Record<SortKey, string> = { action: "الإجراء المطلوب أولًا", travel: "أقرب تاريخ سفر", newest: "الأحدث أولًا" };

export function sortRows(rows: UmrahListRow[], key: SortKey) {
  const travel = (r: UmrahListRow) => r.umrahQueue?.preferredTravelDate || "9999-12-31";
  const created = (r: UmrahListRow) => r.createdAt;
  return [...rows].sort((a, b) => {
    if (key === "newest") return created(b).localeCompare(created(a));
    if (key === "travel") return travel(a).localeCompare(travel(b)) || (a.umrahQueue?.rank ?? 9) - (b.umrahQueue?.rank ?? 9);
    // Same order as /admin/cases' Umrah view: rank, then the nearest preferred date.
    return (a.umrahQueue?.rank ?? 9) - (b.umrahQueue?.rank ?? 9) || travel(a).localeCompare(travel(b)) || created(b).localeCompare(created(a));
  });
}

export type ServerFilters = { search: string; status: string; paymentStatus: string; assignedUserId: string; serviceId: string; createdFrom: string; createdTo: string; page: number };
export const EMPTY_SERVER_FILTERS: ServerFilters = { search: "", status: "", paymentStatus: "", assignedUserId: "", serviceId: "", createdFrom: "", createdTo: "", page: 1 };
export const PAGE_SIZE = 100; // the API's maximum

export function listQuery(filters: ServerFilters) {
  const params = new URLSearchParams({ serviceKind: "UMRAH", limit: String(PAGE_SIZE), page: String(filters.page) });
  for (const key of ["search", "status", "paymentStatus", "assignedUserId", "serviceId", "createdFrom", "createdTo"] as const) {
    const value = filters[key].trim();
    if (value) params.set(key, value);
  }
  return params.toString();
}
