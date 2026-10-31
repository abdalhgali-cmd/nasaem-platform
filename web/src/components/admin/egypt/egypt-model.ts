// Egypt security approval — labels and types for the Next.js admin.
//
// Everything here mirrors the existing back-office (backend/public/assets/
// egypt-view.js) and the backend it reads from:
//   GET /contact-requests/egypt/queue   (egypt-queue.service.js listEgyptQueue)
//   GET /contact-requests/:id/egypt     (egypt-queue.service.js getEgyptWorkspace)
// No state, stage, filter or rule is defined here: stages, stage labels and
// the next action come from the server; these maps only translate enum values
// the server already returns.

import type { EgyptRow } from "@/components/admin/operations/ops-model";

export const ENTRY_AR: Record<string, string> = { AIR: "جوي", BORDER: "بري" };
export const CIRCULAR_AR: Record<string, string> = { NOT_STARTED: "لم يبدأ", PROCESSING: "قيد التجهيز", ISSUED: "صدر" };
export const FLIGHT_CHOICE_AR: Record<string, string> = { REQUEST: "يطلب الحجز عبر نسائم", BOOKED: "حجز بنفسه", LATER: "سيقرر لاحقًا" };
export const REMINDER_AR: Record<string, string> = { SCHEDULED: "مجدول", SENT: "أُرسل", CANCELLED: "أُلغي", SUPERSEDED: "استُبدل بتاريخ أحدث" };
export const REMINDER_KIND_AR: Record<string, string> = { THREE_DAY: "تذكير مسبق", URGENT: "عاجل" };
// Keys of EGYPT_QUEUE_FILTERS in egypt-queue.service.js (the server validates them).
export const FILTER_AR: Record<string, string> = {
  PAYMENT_PENDING: "الدفع معلق",
  PAYMENT_VERIFIED: "الدفع مؤكد",
  AWAITING_TRAVEL_DETAILS: "بانتظار بيانات السفر",
  AWAITING_TICKET: "بانتظار التذكرة",
  WITHIN_3_DAYS: "سفر قريب",
  URGENT: "متأخر أو عاجل",
  UNASSIGNED: "بلا موظف مسؤول",
  HIGH_PRIORITY: "أولوية عالية",
  PAST_DUE: "تجاوز موعد الإنجاز",
};
export const PRIORITY_AR: Record<string, string> = { LOW: "منخفضة", NORMAL: "عادية", HIGH: "عالية", URGENT: "عاجلة" };
export const EGYPT_PAYMENT_AR: Record<string, string> = { NOT_REQUIRED: "لا يوجد سعر", AWAITING_TRANSFER: "بانتظار التحويل", UNDER_REVIEW: "إيصال للمراجعة", CONFIRMED: "مؤكد" };
export const TICKET_AR: Record<string, string> = { AVAILABLE: "متوفرة", BOOKING_REQUESTED: "طلب حجز عبر نسائم", MISSING: "غير مرفوعة" };
export const RECEIPT_EMAIL_AR: Record<string, string> = { PENDING: "بانتظار الإرسال", SENDING: "جارٍ الإرسال", ACCEPTED: "قبله مزود البريد", UNCERTAIN: "غير مؤكد — راجع قبل إعادة الإرسال", FAILED: "فشل", SKIPPED: "لم يُرسل" };
export const RECEIPT_ERROR_AR: Record<string, string> = { NO_RECIPIENT: "لا يوجد بريد إلكتروني للعميل", NOT_CONFIGURED: "خدمة البريد غير مهيأة", RECEIPT_PDF_FAILED: "تعذر إنشاء ملف الإيصال", WAITING_FOR_PDF: "بانتظار ملف الإيصال" };
export const QUALITY_AR: Record<string, string> = {
  LOW_RESOLUTION: "دقة منخفضة",
  TOO_DARK: "مظلمة",
  TOO_BRIGHT: "إضاءة زائدة",
  GLARE: "انعكاس ضوء",
  BLURRY: "غير واضحة",
  CROPPED: "مقصوصة",
  NOT_PASSPORT_PAGE: "قد لا تكون صفحة البيانات",
  PAGE_UNCERTAIN: "تعذر التأكد من الصفحة",
};

/** A queue row (toQueueRow + nextAction). Extends the subset the Operations Center reads. */
export type EgyptQueueRow = EgyptRow & {
  createdAt: string;
  travelerCount: number;
  approvalIssuedOn: string | null;
  ticketStatus: string | null;
  flightInquiryId: string | null;
  documentsFlagged: number;
  preparationComplete: boolean;
  preparationMissing: string[];
};

export type EgyptQueueResponse = {
  rows: EgyptQueueRow[];
  counts: Record<string, number>;
  filterCounts: Record<string, number>;
  stageLabels: Record<string, string>;
  truncated: boolean;
  leadDays: number;
};

export type Deliverable = {
  id: string;
  kind: string;
  version: number;
  label: string;
  issuedOn: string | null;
  publishedAt: string | null;
  supersededAt: string | null;
  travelerIds: string[] | null;
  createdAt: string;
};

export type EgyptWorkspace = EgyptQueueRow & {
  route: { departureCity?: string; arrivalAirport?: string; entryPort?: string } | null;
  flightChoice: string | null;
  approvals: Deliverable[];
  circulars: Deliverable[];
  tickets: Deliverable[];
  linkedInquiry: { id: string } | null;
  reminders: { id: string; travelDate: string; kind: string; status: string; dueAt: string | null; sentAt: string | null }[];
  receipt: { receiptNo: string; pdfStatus: string } | null;
  receiptDeliveries: { id: string; status: string; channel: string; recipient: string | null; lastError: string | null }[];
  passportQuality: { documentId: string; label: string; warnings: string[] }[];
  flightDetails: { flightNumber?: string | null; airline?: string | null; departureTime?: string | null; arrivalTime?: string | null; verifiedAt?: string | null; source?: string | null } | null;
};

/** Today in the agency's timezone (Africa/Khartoum), as the back-office uses for date limits. */
export function egyptToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Khartoum", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Relative wording of the server's `daysUntil`. */
export function whenText(daysUntil: number | null) {
  if (daysUntil === null || daysUntil === undefined) return "";
  if (daysUntil === 0) return "اليوم";
  if (daysUntil === 1) return "غدًا";
  return daysUntil > 1 ? `بعد ${daysUntil} يوم` : `مضى ${-daysUntil} يوم`;
}

export function entryPointText(row: Pick<EgyptQueueRow, "entryMode" | "entryPoint">) {
  return row.entryPoint || (row.entryMode === "BORDER" ? "المنفذ غير محدد" : "المطار غير محدد");
}

export function shortRef(id: string) {
  return id.slice(-8).toUpperCase();
}

export function deliverableFileUrl(apiUrl: string, requestId: string, deliverableId: string) {
  return `${apiUrl}/contact-requests/${encodeURIComponent(requestId)}/deliverables/${encodeURIComponent(deliverableId)}/file`;
}

/** Query string for GET /contact-requests/egypt/queue; empty values are omitted. */
export type QueueFilters = { view: "schedule" | "queue"; stage: string; filter: string; entryMode: string; assignee: string; from: string; to: string; search: string };
export const EMPTY_FILTERS: QueueFilters = { view: "schedule", stage: "", filter: "", entryMode: "", assignee: "", from: "", to: "", search: "" };
export function queueQuery(filters: QueueFilters) {
  const params = new URLSearchParams({ view: filters.view });
  for (const key of ["stage", "filter", "entryMode", "assignee", "from", "to", "search"] as const) {
    const value = filters[key].trim();
    if (value) params.set(key, value);
  }
  return params.toString();
}
