// Staff queue and travel schedule for Egypt security approval requests of
// one organization. Every stage is derived from the request's stored facts
// with the same rules the customer sees (egypt-approval-rules.js).
import prisma from "../../config/database.js";
import { evaluateReadiness } from "../contact-request-workflow/workflow-policy.js";
import { EGYPT_CLEARANCE_CODE, EGYPT_CLEARANCE_VARIANTS } from "./egypt-clearance-variants.js";
import { alertSettings } from "./alert-settings.service.js";
import { approvalIssuedOn, calendarDaysUntil, circularState, isApprovalIssued, linkedFlightInquiry, travelPreparation, travelTickets, REMINDER_DAYS_BEFORE } from "./egypt-approval-rules.js";

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

// Open Egypt requests are expected in the hundreds; beyond this the answer
// says it was truncated (and filters narrow it) rather than silently cutting.
const QUEUE_LIMIT = 2000;

const QUEUE_INCLUDE = {
  visaType: { select: { code: true, name: true } },
  travelers: { select: { id: true, fullName: true }, orderBy: { sortOrder: "asc" } },
  deliverables: { where: { publishedAt: { not: null }, supersededAt: null }, select: { id: true, kind: true, publishedAt: true, supersededAt: true, travelerIds: true, issuedOn: true, label: true, version: true } },
  documents: { where: { supersededAt: null }, select: { id: true, status: true, supersededAt: true, label: true, classification: true, qualitySignal: true, requirementId: true, travelerId: true } },
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

// imminent: travel within the reminder lead time (administrator setting,
// default REMINDER_DAYS_BEFORE days); overdue: the date has passed while
// the request is still open.
export function scheduleFlags(travelDate, status, now = new Date(), leadDays = REMINDER_DAYS_BEFORE) {
  if (!travelDate) return { daysUntil: null, imminent: false, overdue: false, missingDate: true };
  const daysUntil = calendarDaysUntil(travelDate, now);
  return {
    daysUntil,
    imminent: status !== "CLOSED" && daysUntil !== null && daysUntil >= 0 && daysUntil <= leadDays,
    overdue: status !== "CLOSED" && daysUntil !== null && daysUntil < 0,
    missingDate: false,
  };
}

// What staff should do next, from the same facts (one line for the queue).
export function nextStaffAction(request, row) {
  if (row.stage === "CLOSED") return "لا إجراء — الطلب مغلق";
  if (request.paymentStatus === "UNDER_REVIEW") return "مراجعة إيصال الدفع وتأكيده";
  if (request.paymentStatus !== "CONFIRMED") return "بانتظار تحويل العميل";
  if (!row.approvalIssued) return row.documentsFlagged ? "تدقيق صور الجواز ثم إصدار الموافقة" : "إصدار الموافقة ورفع صورتها";
  if (row.circularStatus === "ISSUED") return row.overdue ? "تأكيد السفر وإغلاق الطلب" : "متابعة السفر";
  if (!row.preparationComplete) return `استكمال بيانات السفر: ${row.preparationMissing.join("، ")}`;
  return row.circularStatus === "PROCESSING" ? "رفع ملف التعميم" : "بدء تجهيز التعميم";
}

export function ticketStatus(request, preparation) {
  if (preparation.entryMode !== "AIR") return null;
  const tickets = travelTickets(request);
  if (tickets.length) return "AVAILABLE";
  if (request.intakeData?.egyptFlight?.choice === "REQUEST") return "BOOKING_REQUESTED";
  return "MISSING";
}

// Operational filters of the queue (in addition to the stage).
export const EGYPT_QUEUE_FILTERS = Object.freeze({
  PAYMENT_PENDING: (row) => row.paymentStatus !== "CONFIRMED" && row.status !== "CLOSED",
  PAYMENT_VERIFIED: (row) => row.paymentStatus === "CONFIRMED",
  AWAITING_TRAVEL_DETAILS: (row) => row.approvalIssued && !row.preparationComplete,
  AWAITING_TICKET: (row) => row.ticketStatus === "MISSING" || row.ticketStatus === "BOOKING_REQUESTED",
  WITHIN_3_DAYS: (row) => row.imminent,
  URGENT: (row) => row.overdue || row.priority === "URGENT" || (row.imminent && row.circularStatus !== "ISSUED"),
  UNASSIGNED: (row) => !row.assignedUser && row.status !== "CLOSED",
  HIGH_PRIORITY: (row) => row.priority === "HIGH" || row.priority === "URGENT",
  PAST_DUE: (row) => row.pastDue,
});

const PRIORITY_RANK = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

// Where the traveler enters Egypt: the crossing (overland) or the arrival
// airport given with the request (air).
export function entryPoint(preparation, route) {
  if (preparation.entryMode === "BORDER") return route?.entryPort || null;
  if (preparation.entryMode === "AIR") return route?.arrivalAirport || null;
  return null;
}

export function toQueueRow(request, now = new Date(), leadDays = REMINDER_DAYS_BEFORE) {
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
    entryPoint: entryPoint(preparation, request.intakeData?.egyptRoute),
    priority: request.priority || "NORMAL",
    dueAt: request.dueAt || null,
    pastDue: Boolean(request.dueAt) && request.status !== "CLOSED" && new Date(request.dueAt) < now,
    flightDetailsVerified: Boolean(request.intakeData?.egyptTravel?.flightDetails?.verifiedAt),
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
    ticketStatus: ticketStatus(request, preparation),
    // Required documents still missing, rejected or waiting for review.
    documentIssues: evaluateReadiness(request).reasons.filter((r) => r.code.startsWith("DOCUMENTS_")).map((r) => r.message),
    ...scheduleFlags(preparation.travelDate, request.status, now, leadDays),
  };
}

function withNextAction(request, now, leadDays) {
  const row = toQueueRow(request, now, leadDays);
  return { ...row, nextAction: nextStaffAction(request, row) };
}

// filters: stage, entryMode (AIR|BORDER), from/to (travel date, YYYY-MM-DD),
// search (name, phone, reference), view "schedule" (by nearest travel date,
// dateless last) or default (newest first). Closed requests only on demand.
// assignee: "mine" (with `userId`), "unassigned" or a user id.
export async function listEgyptQueue(organizationId, { stage, filter, entryMode, from, to, search, view, assignee, userId = null, includeClosed = false, now = new Date() } = {}) {
  const term = typeof search === "string" ? search.trim() : "";
  const { travelReminderDaysBefore: leadDays } = await alertSettings();
  const assigneeWhere = assignee === "unassigned" ? { assignedUserId: null } : assignee === "mine" ? { assignedUserId: userId } : assignee ? { assignedUserId: assignee } : {};
  const requests = await prisma.contactRequest.findMany({
    where: {
      organizationId,
      visaType: { code: { in: EGYPT_CODES } },
      ...assigneeWhere,
      ...(includeClosed || stage === "CLOSED" ? {} : { status: { not: "CLOSED" } }),
      ...(from || to ? { travelEntryDate: { ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}), ...(to ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}) } } : {}),
      ...(term
        ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { phone: { contains: term } }, { phoneNormalized: { contains: term.replace(/\D/g, "") || term } }, { id: term }] }
        : {}),
    },
    include: QUEUE_INCLUDE,
    // The schedule is read nearest date first in the database itself, so a
    // large backlog never hides an imminent departure behind newer requests.
    orderBy: view === "schedule" ? [{ travelEntryDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] : { createdAt: "desc" },
    take: QUEUE_LIMIT + 1,
  });
  const truncated = requests.length > QUEUE_LIMIT;
  if (truncated) requests.length = QUEUE_LIMIT;
  const all = requests.map((request) => withNextAction(request, now, leadDays));
  let rows = all;
  if (stage) rows = rows.filter((row) => row.stage === stage);
  if (filter && EGYPT_QUEUE_FILTERS[filter]) rows = rows.filter(EGYPT_QUEUE_FILTERS[filter]);
  if (entryMode) rows = rows.filter((row) => row.entryMode === entryMode);
  if (view === "schedule") {
    // Nearest travel date first; same date: higher priority first.
    rows.sort((a, b) => {
      if (!a.travelDate && !b.travelDate) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (!a.travelDate) return 1;
      if (!b.travelDate) return -1;
      if (a.travelDate !== b.travelDate) return a.travelDate < b.travelDate ? -1 : 1;
      return (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
    });
  }
  const counts = Object.fromEntries(EGYPT_QUEUE_STAGES.map((key) => [key, 0]));
  for (const row of all) counts[row.stage] += 1;
  const filterCounts = Object.fromEntries(Object.entries(EGYPT_QUEUE_FILTERS).map(([key, test]) => [key, all.filter(test).length]));
  return { rows, counts, filterCounts, stageLabels: EGYPT_STAGE_LABELS, truncated, leadDays };
}

// The Egypt part of the staff workspace for one request.
export async function getEgyptWorkspace(contactRequestId, organizationId) {
  const request = await prisma.contactRequest.findFirst({
    where: { id: contactRequestId, organizationId, visaType: { code: { in: EGYPT_CODES } } },
    include: {
      ...QUEUE_INCLUDE,
      deliverables: { orderBy: [{ kind: "asc" }, { version: "desc" }], select: { id: true, kind: true, version: true, label: true, fileName: true, mimeType: true, issuedOn: true, publishedAt: true, supersededAt: true, travelerIds: true, createdAt: true } },
      documents: { where: { supersededAt: null }, select: { id: true, label: true, status: true, supersededAt: true, qualitySignal: true, travelerId: true, requirementId: true, classification: true } },
      travelReminders: { orderBy: { createdAt: "desc" }, take: 20 },
      customerMessages: { where: { kind: "PAYMENT_RECEIPT" }, select: { id: true, status: true, channel: true, recipient: true, attempts: true, lastError: true, lastAttemptAt: true, nextAttemptAt: true } },
      paymentReceipt: true,
    },
  });
  if (!request) return null;
  const row = withNextAction(request, new Date());
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
    flightDetails: request.intakeData?.egyptTravel?.flightDetails || null,
  };
}
