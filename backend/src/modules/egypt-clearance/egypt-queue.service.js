// Staff queue and travel schedule for Egypt security approval requests of
// one organization. Every stage is derived from the request's stored facts
// with the same rules the customer sees (egypt-approval-rules.js).
import prisma from "../../config/database.js";
import { EGYPT_CLEARANCE_CODE, EGYPT_CLEARANCE_VARIANTS } from "./egypt-clearance-variants.js";
import { approvalIssuedOn, calendarDaysUntil, circularState, isApprovalIssued, linkedFlightInquiry, travelPreparation, REMINDER_DAYS_BEFORE } from "./egypt-approval-rules.js";

const EGYPT_CODES = [EGYPT_CLEARANCE_CODE, ...EGYPT_CLEARANCE_VARIANTS.map((variant) => variant.code)];
export const EGYPT_QUEUE_STAGES = Object.freeze([
  "AWAITING_PAYMENT",
  "APPROVAL_IN_PROGRESS",
  "PREPARATION_INCOMPLETE",
  "CIRCULAR_PENDING",
  "CIRCULAR_PROCESSING",
  "CIRCULAR_ISSUED",
  "CLOSED",
]);
export const EGYPT_STAGE_LABELS = Object.freeze({
  AWAITING_PAYMENT: "بانتظار الدفع",
  APPROVAL_IN_PROGRESS: "جاري إصدار الموافقة",
  PREPARATION_INCOMPLETE: "صدرت الموافقة — تجهيز السفر ناقص",
  CIRCULAR_PENDING: "صدرت الموافقة — التعميم لم يبدأ",
  CIRCULAR_PROCESSING: "التعميم قيد التجهيز",
  CIRCULAR_ISSUED: "صدر التعميم",
  CLOSED: "مغلق",
});

const QUEUE_INCLUDE = {
  visaType: { select: { code: true, name: true } },
  travelers: { select: { id: true, fullName: true }, orderBy: { sortOrder: "asc" } },
  deliverables: { where: { publishedAt: { not: null }, supersededAt: null }, select: { id: true, kind: true, publishedAt: true, supersededAt: true, travelerIds: true, issuedOn: true, label: true, version: true } },
  documents: { where: { supersededAt: null }, select: { id: true, status: true, supersededAt: true, label: true, classification: true, qualitySignal: true } },
  linkedRequests: { select: { id: true, linkKind: true, status: true, paymentStatus: true, createdAt: true, deliverables: { where: { publishedAt: { not: null }, supersededAt: null }, select: { id: true, label: true, publishedAt: true, supersededAt: true } } } },
  customerMessages: { where: { kind: "PAYMENT_RECEIPT" }, select: { status: true, channel: true } },
  paymentReceipt: { select: { receiptNo: true, pdfStatus: true } },
  assignedUser: { select: { id: true, fullName: true } },
};

export function egyptStage(request) {
  if (request.status === "CLOSED") return "CLOSED";
  if (request.paymentStatus !== "CONFIRMED") return "AWAITING_PAYMENT";
  if (!isApprovalIssued(request)) return "APPROVAL_IN_PROGRESS";
  const circular = circularState(request).status;
  if (circular === "ISSUED") return "CIRCULAR_ISSUED";
  if (!travelPreparation(request).complete) return "PREPARATION_INCOMPLETE";
  return circular === "PROCESSING" ? "CIRCULAR_PROCESSING" : "CIRCULAR_PENDING";
}

// imminent: travel within REMINDER_DAYS_BEFORE days; overdue: the date has
// passed while the request is still open.
export function scheduleFlags(travelDate, status, now = new Date()) {
  if (!travelDate) return { daysUntil: null, imminent: false, overdue: false, missingDate: true };
  const daysUntil = calendarDaysUntil(travelDate, now);
  return {
    daysUntil,
    imminent: status !== "CLOSED" && daysUntil !== null && daysUntil >= 0 && daysUntil <= REMINDER_DAYS_BEFORE,
    overdue: status !== "CLOSED" && daysUntil !== null && daysUntil < 0,
    missingDate: false,
  };
}

export function toQueueRow(request, now = new Date()) {
  const preparation = travelPreparation(request);
  const stage = egyptStage(request);
  const linked = linkedFlightInquiry(request);
  const flagged = (request.documents || []).filter((d) => Array.isArray(d.qualitySignal?.warnings) && d.qualitySignal.warnings.length).length;
  return {
    id: request.id,
    name: request.name,
    phone: request.phone,
    email: request.email || null,
    entryMode: preparation.entryMode,
    route: request.intakeData?.egyptRoute || null,
    travelerCount: request.travelers?.length || request.travelerCount || 1,
    travelers: (request.travelers || []).map((t) => t.fullName),
    status: request.status,
    paymentStatus: request.paymentStatus,
    stage,
    stageLabel: EGYPT_STAGE_LABELS[stage],
    approvalIssued: isApprovalIssued(request),
    approvalIssuedOn: approvalIssuedOn(request),
    circularStatus: circularState(request).status,
    travelDate: preparation.travelDate,
    preparationComplete: preparation.complete,
    preparationMissing: preparation.missing.map((m) => m.message),
    flightChoice: request.intakeData?.egyptFlight?.choice || null,
    flightInquiryId: linked?.id || null,
    receiptNo: request.paymentReceipt?.receiptNo || null,
    receiptEmailStatus: request.customerMessages?.find((m) => m.channel === "EMAIL")?.status || null,
    documentsFlagged: flagged,
    assignedUser: request.assignedUser || null,
    createdAt: request.createdAt,
    ...scheduleFlags(preparation.travelDate, request.status, now),
  };
}

// filters: stage, entryMode (AIR|BORDER), from/to (travel date, YYYY-MM-DD),
// search (name, phone, reference), view "schedule" (by nearest travel date,
// dateless last) or default (newest first). Closed requests only on demand.
export async function listEgyptQueue(organizationId, { stage, entryMode, from, to, search, view, includeClosed = false, now = new Date() } = {}) {
  const term = typeof search === "string" ? search.trim() : "";
  const requests = await prisma.contactRequest.findMany({
    where: {
      organizationId,
      visaType: { code: { in: EGYPT_CODES } },
      ...(includeClosed || stage === "CLOSED" ? {} : { status: { not: "CLOSED" } }),
      ...(from || to ? { travelEntryDate: { ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}), ...(to ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}) } } : {}),
      ...(term
        ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { phone: { contains: term } }, { phoneNormalized: { contains: term.replace(/\D/g, "") || term } }, { id: term }] }
        : {}),
    },
    include: QUEUE_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  let rows = requests.map((request) => toQueueRow(request, now));
  if (stage) rows = rows.filter((row) => row.stage === stage);
  if (entryMode) rows = rows.filter((row) => row.entryMode === entryMode);
  if (view === "schedule") {
    rows.sort((a, b) => {
      if (!a.travelDate && !b.travelDate) return 0;
      if (!a.travelDate) return 1;
      if (!b.travelDate) return -1;
      return a.travelDate < b.travelDate ? -1 : a.travelDate > b.travelDate ? 1 : 0;
    });
  }
  const counts = Object.fromEntries(EGYPT_QUEUE_STAGES.map((key) => [key, 0]));
  for (const row of requests.map((request) => toQueueRow(request, now))) counts[row.stage] += 1;
  return { rows, counts, stageLabels: EGYPT_STAGE_LABELS };
}

// The Egypt part of the staff workspace for one request.
export async function getEgyptWorkspace(contactRequestId, organizationId) {
  const request = await prisma.contactRequest.findFirst({
    where: { id: contactRequestId, organizationId, visaType: { code: { in: EGYPT_CODES } } },
    include: {
      ...QUEUE_INCLUDE,
      deliverables: { orderBy: [{ kind: "asc" }, { version: "desc" }], select: { id: true, kind: true, version: true, label: true, fileName: true, mimeType: true, issuedOn: true, publishedAt: true, supersededAt: true, travelerIds: true, createdAt: true } },
      documents: { where: { supersededAt: null, classification: "CUSTOMER_DOCUMENT" }, select: { id: true, label: true, status: true, supersededAt: true, qualitySignal: true, travelerId: true } },
      travelReminders: { orderBy: { createdAt: "desc" }, take: 20 },
      customerMessages: { where: { kind: "PAYMENT_RECEIPT" }, select: { id: true, status: true, channel: true, recipient: true, attempts: true, lastError: true, lastAttemptAt: true, nextAttemptAt: true } },
      paymentReceipt: true,
    },
  });
  if (!request) return null;
  const row = toQueueRow(request);
  const typed = (kind) => request.deliverables.filter((d) => d.kind === kind);
  return {
    ...row,
    approvals: typed("APPROVAL"),
    circulars: typed("CIRCULAR"),
    tickets: typed("TICKET"),
    linkedInquiry: linkedFlightInquiry(request),
    reminders: request.travelReminders.map(({ id, travelDate, kind, status, dueAt, sentAt, revision }) => ({ id, travelDate: travelDate.toISOString().slice(0, 10), kind, status, dueAt, sentAt, revision })),
    receipt: request.paymentReceipt
      ? (({ storagePath, ...receipt }) => receipt)(request.paymentReceipt)
      : null,
    receiptDeliveries: request.customerMessages,
    passportQuality: request.documents.filter((d) => d.qualitySignal).map((d) => ({ documentId: d.id, label: d.label, travelerId: d.travelerId, warnings: d.qualitySignal.warnings || [], checks: d.qualitySignal.checks || null })),
    circularProcessingAt: request.circularProcessingAt,
    travelScheduleRevision: request.travelScheduleRevision,
  };
}
