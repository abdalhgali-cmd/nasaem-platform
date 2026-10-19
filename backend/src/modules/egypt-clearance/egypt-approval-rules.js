// Egypt security approval — the pure rules of its post-payment journey:
// which typed file is the approval, the circular and the tickets; whether
// the travel preparation is complete; the customer's six-step timeline; and
// when the staff travel reminder is due. No database access: the callers
// load the request (deliverables, documents, travelers, linked requests)
// and pass it here, so the staff screens, the customer surfaces and the
// workflow policy read the same answer.
import { isEgyptClearanceCode, variantEntryMode } from "./egypt-clearance-variants.js";

export const KHARTOUM_TIME_ZONE = "Africa/Khartoum";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Africa/Khartoum is UTC+2 all year (no daylight saving since 2017).
const KHARTOUM_UTC_OFFSET_HOURS = 2;
// The three-day reminder is raised at 09:00 Khartoum time.
const REMINDER_LOCAL_HOUR = 9;
export const REMINDER_DAYS_BEFORE = 3;

export const DELIVERABLE_KINDS = Object.freeze({ GENERAL: "GENERAL", APPROVAL: "APPROVAL", CIRCULAR: "CIRCULAR", TICKET: "TICKET" });
export const FLIGHT_LINK_KIND = "EGYPT_FLIGHT";
export const FLIGHT_CHOICES = Object.freeze(["REQUEST", "BOOKED", "LATER"]);

export function isEgyptRequest(request) {
  return isEgyptClearanceCode(request?.visaType?.code);
}

// ---- dates (date-only values, Africa/Khartoum calendar)

function localDateParts(date, timeZone = KHARTOUM_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

export function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return { year, month, day, utc };
}

// A @db.Date column comes back as UTC midnight of that date.
export function dateOnlyString(value) {
  if (!value) return null;
  if (typeof value === "string") return parseDateOnly(value) ? value : null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function todayInKhartoum(now = new Date()) {
  const today = localDateParts(now);
  return `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
}

export function calendarDaysUntil(entryDate, now = new Date()) {
  const parsed = parseDateOnly(dateOnlyString(entryDate));
  if (!parsed) return null;
  const today = localDateParts(now);
  return Math.floor((parsed.utc.getTime() - Date.UTC(today.year, today.month - 1, today.day)) / MS_PER_DAY);
}

// When the staff reminder for a travel date is due, and which kind:
//   THREE_DAY at 09:00 Khartoum time, three calendar days before the date;
//   URGENT at once when that moment has already passed (the date is less
//   than three days away, or it is the reminder day after 09:00) and the
//   date is today or later. A past date has no reminder (null).
export function reminderPlan(entryDate, now = new Date()) {
  const date = dateOnlyString(entryDate);
  const parsed = parseDateOnly(date);
  if (!parsed) return null;
  const days = calendarDaysUntil(date, now);
  if (days === null || days < 0) return null;
  const dueAt = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day - REMINDER_DAYS_BEFORE, REMINDER_LOCAL_HOUR - KHARTOUM_UTC_OFFSET_HOURS));
  if (now.getTime() < dueAt.getTime()) return { travelDate: date, kind: "THREE_DAY", dueAt, daysUntil: days };
  return { travelDate: date, kind: "URGENT", dueAt: new Date(now.getTime()), daysUntil: days };
}

// ---- typed files

export function deliverableKind(deliverable) {
  return deliverable?.kind || DELIVERABLE_KINDS.GENERAL;
}

// Published and not replaced by a newer version.
export function isCurrentPublished(deliverable) {
  return Boolean(deliverable?.publishedAt) && !deliverable.supersededAt;
}

export function currentDeliverables(request, kind) {
  return (request?.deliverables || []).filter((d) => isCurrentPublished(d) && deliverableKind(d) === kind);
}

// The files that are a service's final output (what "delivered" means):
// GENERAL files, and the Egypt APPROVAL. Circulars and tickets are not.
export function isOutputDeliverable(deliverable) {
  const kind = deliverableKind(deliverable);
  return kind === DELIVERABLE_KINDS.GENERAL || kind === DELIVERABLE_KINDS.APPROVAL;
}

// The approval is issued when every traveler of the request is covered by a
// current published APPROVAL file (a single-traveler or traveler-less
// request: any APPROVAL not assigned to someone else).
export function approvalCoverage(request) {
  const approvals = currentDeliverables(request, DELIVERABLE_KINDS.APPROVAL);
  const travelers = request?.travelers || [];
  if (travelers.length <= 1) {
    const onlyId = travelers[0]?.id;
    const issued = approvals.some((d) => !d.travelerIds?.length || (onlyId && d.travelerIds.includes(onlyId)));
    return { issued, missingTravelerIds: issued || !onlyId ? [] : [onlyId], approvals };
  }
  const covered = new Set(approvals.flatMap((d) => d.travelerIds || []));
  const missingTravelerIds = travelers.filter((t) => !covered.has(t.id)).map((t) => t.id);
  return { issued: missingTravelerIds.length === 0, missingTravelerIds, approvals };
}

export function isApprovalIssued(request) {
  return approvalCoverage(request).issued;
}

// The latest issue date written on the current approval files.
export function approvalIssuedOn(request) {
  const dates = approvalCoverage(request).approvals.map((d) => dateOnlyString(d.issuedOn)).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

export function circularState(request) {
  const current = currentDeliverables(request, DELIVERABLE_KINDS.CIRCULAR);
  if (current.length) return { status: "ISSUED", deliverables: current };
  if (request?.circularProcessingAt) return { status: "PROCESSING", deliverables: [] };
  return { status: "NOT_STARTED", deliverables: [] };
}

// ---- travel preparation

export function requestEntryMode(request) {
  return (
    variantEntryMode(request?.visaType?.code) ||
    request?.intakeData?.egyptTravel?.entryMode ||
    request?.intakeData?.egyptRoute?.entryMode ||
    null
  );
}

export function requestTravelDate(request) {
  return dateOnlyString(request?.travelEntryDate) || dateOnlyString(request?.intakeData?.egyptTravel?.entryDate) || null;
}

export function linkedFlightInquiry(request) {
  return (request?.linkedRequests || []).find((linked) => linked.linkKind === FLIGHT_LINK_KIND) || null;
}

// Every ticket the customer can rely on, from any source: the customer's own
// upload in the travel plan, a ticket staff attached to this request, or a
// file published on the linked flight booking inquiry.
export function travelTickets(request) {
  const tickets = [];
  const plan = request?.intakeData?.egyptTravel || null;
  const own = plan?.ticketDocumentId
    ? (request.documents || []).find((d) => d.id === plan.ticketDocumentId && !d.supersededAt && d.status !== "REJECTED")
    : null;
  if (own) tickets.push({ source: "CUSTOMER", documentId: own.id, label: own.label, status: own.status });
  for (const d of currentDeliverables(request, DELIVERABLE_KINDS.TICKET)) {
    tickets.push({ source: "STAFF", deliverableId: d.id, label: d.label, version: d.version });
  }
  const linked = linkedFlightInquiry(request);
  for (const d of (linked?.deliverables || []).filter(isCurrentPublished)) {
    tickets.push({ source: "LINKED_BOOKING", requestId: linked.id, deliverableId: d.id, label: d.label });
  }
  return tickets;
}

// What the travel preparation still needs. Air: the travel date and a
// ticket. Over land: the crossing (entry point) and the confirmed arrival
// date. Missing information never withdraws an issued approval: the
// preparation is just reported incomplete.
export function travelPreparation(request) {
  const entryMode = requestEntryMode(request);
  const date = requestTravelDate(request);
  const missing = [];
  if (entryMode === "BORDER") {
    const entryPort = request?.intakeData?.egyptRoute?.entryPort || request?.intakeData?.egyptTravel?.entryPort || "";
    if (!String(entryPort).trim()) missing.push({ code: "ENTRY_PORT_MISSING", message: "منفذ الدخول البري غير محدد." });
    if (!date) missing.push({ code: "ARRIVAL_DATE_MISSING", message: "تاريخ الوصول المؤكد غير محدد." });
  } else {
    if (!entryMode) missing.push({ code: "ENTRY_MODE_MISSING", message: "طريقة الدخول غير محددة." });
    if (!date) missing.push({ code: "TRAVEL_DATE_MISSING", message: "تاريخ السفر غير محدد." });
    if (entryMode === "AIR" && travelTickets(request).length === 0) missing.push({ code: "TICKET_MISSING", message: "تذكرة الطيران لم تُرفع بعد." });
  }
  return { entryMode, travelDate: date, complete: missing.length === 0, missing };
}

// ---- the customer's timeline

export const EGYPT_TIMELINE_LABELS = Object.freeze({
  RECEIVED: "تم استلام الطلب",
  PAYMENT_CONFIRMED: "تم تأكيد الدفع",
  APPROVAL_IN_PROGRESS: "جاري إصدار الموافقة",
  APPROVAL_ISSUED: "تم إصدار الموافقة",
  TRAVEL_PREPARATION: "تجهيز السفر والتعميم",
  CIRCULAR_ISSUED: "تم إصدار التعميم",
});

export function egyptTimeline(request) {
  const paid = request?.paymentStatus === "CONFIRMED";
  const issued = isApprovalIssued(request);
  const preparation = travelPreparation(request);
  const circular = circularState(request);
  const done = {
    RECEIVED: true,
    PAYMENT_CONFIRMED: paid,
    APPROVAL_IN_PROGRESS: issued,
    APPROVAL_ISSUED: issued,
    TRAVEL_PREPARATION: issued && preparation.complete,
    CIRCULAR_ISSUED: circular.status === "ISSUED",
  };
  const keys = Object.keys(EGYPT_TIMELINE_LABELS);
  const closed = request?.status === "CLOSED";
  const currentIndex = closed ? -1 : keys.findIndex((key) => !done[key]);
  return keys.map((key, index) => ({
    key,
    label: EGYPT_TIMELINE_LABELS[key],
    state: done[key] ? "done" : index === currentIndex ? "current" : "upcoming",
  }));
}

// ---- what the customer (and the staff workspace) is shown

function fileRef(d) {
  return { id: d.id, label: d.label, fileName: d.fileName, mimeType: d.mimeType, version: d.version ?? 1, publishedAt: d.publishedAt, travelerIds: d.travelerIds || [] };
}

// One summary of the Egypt journey for a request. Files are referenced by id
// only; downloads go through the ownership-checked /file routes.
export function egyptOverview(request, { receipt = null } = {}) {
  if (!isEgyptRequest(request)) return null;
  const coverage = approvalCoverage(request);
  const circular = circularState(request);
  const preparation = travelPreparation(request);
  const linked = linkedFlightInquiry(request);
  const date = preparation.travelDate;
  return {
    entryMode: preparation.entryMode,
    route: request.intakeData?.egyptRoute || null,
    approval: {
      issued: coverage.issued,
      issuedOn: approvalIssuedOn(request),
      files: coverage.approvals.map(fileRef),
      missingTravelerIds: coverage.missingTravelerIds,
    },
    circular: { status: circular.status, files: circular.deliverables.map(fileRef) },
    tickets: travelTickets(request),
    travel: {
      travelDate: date,
      daysUntil: date ? calendarDaysUntil(date) : null,
      preparationComplete: preparation.complete,
      missing: preparation.missing,
      customerCanEdit: request.status !== "CLOSED" && circular.status !== "ISSUED",
    },
    flight: {
      choice: request.intakeData?.egyptFlight?.choice || null,
      inquiry: linked ? { id: linked.id, status: linked.status, paymentStatus: linked.paymentStatus, createdAt: linked.createdAt } : null,
    },
    receipt: receipt ? { available: receipt.pdfStatus === "READY", receiptNo: receipt.receiptNo, status: receipt.pdfStatus } : { available: false, receiptNo: null, status: null },
    timeline: egyptTimeline(request),
  };
}
