// Egypt security approval — staff transitions after payment: issuing the
// approval file, the circular (التعميم), attaching tickets and editing the
// travel date. Each one runs under the request's row lock
// (withLockedRequest), is decided by the workflow policy (checkAction) on
// the locked state, and is audited in the same transaction. Files are
// checked on disk (present, same size as received) BEFORE any status
// changes; if the transaction then fails, the stored file is removed.
// Customers are notified after commit.
import fs from "fs";
import path from "path";
import prisma from "../../config/database.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
import { notifyRequestCustomer } from "../../utils/notifications.js";
import { describeRequest } from "../contact-requests/contact-requests.service.js";
import { ACTIONS, checkAction, checkCoverage } from "../contact-request-workflow/workflow-policy.js";
import { auditInTransaction, refuseWith, withLockedRequest } from "../contact-request-workflow/workflow-lock.js";
import { applyTravelPlanInTransaction, travelPlanFor, calendarDaysUntilEntry } from "../contact-request-tracking/egypt-clearance-travel.service.js";
import { EGYPT_TRAVEL_TASK_KEYS } from "../contact-request-tracking/egypt-travel-tasks.js";
import { syncTravelReminders } from "./travel-reminders.service.js";
import { FLIGHT_DETAIL_KEYS, hasFlightDetails } from "./flight-details.js";
import { DELIVERABLE_KINDS, circularState, isCurrentPublished, parseDateOnly, requestEntryMode, requestTravelDate, todayInKhartoum } from "./egypt-approval-rules.js";

const STORED_DIR = "contact-request-deliverables";

// The upload middleware already wrote the file; confirm it is really there,
// complete, before anything says it was issued.
export function verifyStoredUpload(file) {
  if (!file?.path || !file.size) return false;
  try {
    const stat = fs.statSync(file.path);
    return stat.isFile() && stat.size === file.size;
  } catch {
    return false;
  }
}

export function discardUpload(file) {
  if (file?.path) fs.promises.unlink(file.path).catch(() => {});
}

// An unexpected error inside the transaction rolls everything back; the file
// already written for it must not stay behind as an orphan.
async function lockedWithUpload(file, id, scope, work) {
  try {
    return await withLockedRequest(id, scope, work);
  } catch (error) {
    discardUpload(file);
    throw error;
  }
}

const STORAGE_FAILED = { status: 500, code: "STORAGE_FAILED", message: "تعذّر التأكد من حفظ الملف على الخادم؛ لم يتغير شيء. أعد رفعه." };

async function nextVersion(tx, contactRequestId, kind) {
  const latest = await tx.contactRequestDeliverable.findFirst({ where: { contactRequestId, kind }, orderBy: { version: "desc" }, select: { version: true } });
  return (latest?.version || 0) + 1;
}

// Shared shape of a typed, published file.
async function createTypedFile(tx, request, { kind, label, file, userId, travelerIds = [], issuedOn = null, supersedeWhere = null }) {
  const now = new Date();
  if (supersedeWhere) {
    await tx.contactRequestDeliverable.updateMany({ where: { contactRequestId: request.id, kind, publishedAt: { not: null }, supersededAt: null, ...supersedeWhere }, data: { supersededAt: now } });
  }
  return tx.contactRequestDeliverable.create({
    data: {
      contactRequestId: request.id,
      kind,
      version: await nextVersion(tx, request.id, kind),
      issuedOn: issuedOn ? new Date(`${issuedOn}T00:00:00.000Z`) : null,
      label,
      fileName: file.originalname,
      storagePath: path.join(STORED_DIR, file.filename),
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedByUserId: userId,
      publishedAt: now,
      publishedByUserId: userId,
      travelerIds,
    },
  });
}

// The approval changes the circular status (WAITING_APPROVAL -> ...): the
// stored plan, its tasks and reminders are recomputed in the same transaction.
async function refreshTravelPlan(tx, request) {
  const plan = request.intakeData?.egyptTravel;
  if (!plan?.entryDate || !plan.bookingStatus) {
    await syncTravelReminders(tx, request);
    return;
  }
  await applyTravelPlanInTransaction(tx, request, travelPlanFor(request, plan));
}

async function announce(request, { title, message, type }) {
  await notifyRequestCustomer(request, { title, message, type });
  // Not awaited: a slow WhatsApp API never delays the staff response.
  sendWhatsAppMessage(request.phoneNormalized, `${message}\nيمكنك التحميل من صفحة تتبع الطلب.`);
}

function validIssueDate(value) {
  const parsed = parseDateOnly(value);
  if (!parsed) return null;
  // An approval cannot be dated in the future (Khartoum calendar).
  return calendarDaysUntilEntry(value) > 0 ? null : value;
}

export async function issueEgyptApproval(contactRequestId, organizationId, userId, { file, issuedOn, travelerIds, label }) {
  if (!file) return { error: "FILE_REQUIRED" };
  if (!validIssueDate(issuedOn)) {
    discardUpload(file);
    return { refusal: { status: 400, code: "INVALID_ISSUE_DATE", message: "تاريخ الإصدار غير صالح (لا يكون في المستقبل)." } };
  }
  if (!verifyStoredUpload(file)) {
    discardUpload(file);
    return { refusal: STORAGE_FAILED };
  }
  const result = await lockedWithUpload(file, contactRequestId, { organizationId }, async (tx, request) => {
    const refusal = checkAction(ACTIONS.ISSUE_APPROVAL, request);
    if (refusal) refuseWith(refusal);
    const coverage = travelerIds?.length ? [...new Set(travelerIds)] : request.travelers.length === 1 ? [request.travelers[0].id] : [];
    const invalid = checkCoverage(request, coverage);
    if (invalid) refuseWith(invalid);
    // Issuing the approval is the execution of this service: record its
    // start now if staff had not (readiness was checked by the policy).
    if (!request.executionStartedAt) {
      await tx.contactRequest.update({ where: { id: contactRequestId }, data: { executionStartedAt: new Date(), executionStartedByUserId: userId, executionNote: "إصدار الموافقة الأمنية" } });
    }
    // A newer approval replaces the older files it fully covers. An older
    // file covering only some of these travelers (and others too) would leave
    // two current approvals for the same person: refused, staff re-issue the
    // whole group instead.
    const current = request.deliverables.filter((d) => d.kind === DELIVERABLE_KINDS.APPROVAL && isCurrentPublished(d));
    const single = request.travelers.length <= 1;
    const overlaps = (d) => d.travelerIds.some((id) => coverage.includes(id));
    const within = (d) => d.travelerIds.length > 0 && d.travelerIds.every((id) => coverage.includes(id));
    if (!single && current.some((d) => overlaps(d) && !within(d))) {
      refuseWith({ status: 409, code: "APPROVAL_PARTIAL_OVERLAP", message: "توجد موافقة حالية تشمل هؤلاء المسافرين مع غيرهم؛ أعد إصدارها لكل المسافرين الذين تشملها." });
    }
    const replaced = current.filter((d) => single || within(d)).map((d) => d.id);
    // A circular issued on the previous approval no longer matches it.
    let circularWithdrawn = false;
    if (replaced.length && circularState(request).status === "ISSUED") {
      await tx.contactRequestDeliverable.updateMany({ where: { contactRequestId, kind: DELIVERABLE_KINDS.CIRCULAR, supersededAt: null }, data: { supersededAt: new Date() } });
      await tx.contactRequest.update({ where: { id: contactRequestId }, data: { circularProcessingAt: new Date() } });
      circularWithdrawn = true;
    }
    const approval = await createTypedFile(tx, request, {
      kind: DELIVERABLE_KINDS.APPROVAL,
      label: label || "الموافقة الأمنية",
      file,
      userId,
      travelerIds: coverage,
      issuedOn,
      supersedeWhere: { id: { in: replaced } },
    });
    await auditInTransaction(tx, {
      userId,
      action: "EGYPT_APPROVAL_ISSUED",
      entityId: contactRequestId,
      organizationId,
      newValue: { deliverableId: approval.id, version: approval.version, issuedOn, travelerIds: coverage, replaced, circularWithdrawn },
    });
    const after = await tx.contactRequest.findUnique({ where: { id: contactRequestId }, include: { ...REFRESH_INCLUDE } });
    await refreshTravelPlan(tx, after);
    return { approval, request };
  });
  if (result.error || result.refusal) {
    discardUpload(file);
    return result;
  }
  await announce(result.request, {
    title: "تم إصدار الموافقة الأمنية",
    message: `تم إصدار الموافقة الأمنية لطلبك (${describeRequest(result.request)}). يمكنك تحميلها الآن.`,
    type: "EGYPT_APPROVAL_ISSUED",
  });
  return { deliverable: result.approval };
}

const REFRESH_INCLUDE = {
  visaType: { select: { code: true } },
  deliverables: true,
  travelers: { select: { id: true } },
};

export async function startEgyptCircular(contactRequestId, organizationId, userId) {
  return withLockedRequest(contactRequestId, { organizationId }, async (tx, request) => {
    const refusal = checkAction(ACTIONS.START_CIRCULAR, request);
    if (refusal) refuseWith(refusal);
    const updated = await tx.contactRequest.update({ where: { id: contactRequestId }, data: { circularProcessingAt: new Date() }, select: { id: true, circularProcessingAt: true } });
    await auditInTransaction(tx, { userId, action: "EGYPT_CIRCULAR_PROCESSING", entityId: contactRequestId, organizationId });
    return { contactRequest: updated };
  });
}

// The circular is a real document from the authority, uploaded by staff as a
// PDF. It is never generated here.
// `issuedOn`: the date written on the circular (defaults to today, Khartoum;
// never in the future).
export async function issueEgyptCircular(contactRequestId, organizationId, userId, { file, label, issuedOn }) {
  if (!file) return { error: "FILE_REQUIRED" };
  const circularDate = issuedOn ? validIssueDate(issuedOn) : todayInKhartoum();
  if (!circularDate) {
    discardUpload(file);
    return { refusal: { status: 400, code: "INVALID_ISSUE_DATE", message: "تاريخ إصدار التعميم غير صالح (لا يكون في المستقبل)." } };
  }
  if (file.mimetype !== "application/pdf") {
    discardUpload(file);
    return { refusal: { status: 400, code: "CIRCULAR_PDF_ONLY", message: "التعميم يُرفع ملف PDF فقط." } };
  }
  if (!verifyStoredUpload(file)) {
    discardUpload(file);
    return { refusal: STORAGE_FAILED };
  }
  const result = await lockedWithUpload(file, contactRequestId, { organizationId }, async (tx, request) => {
    const refusal = checkAction(ACTIONS.ISSUE_CIRCULAR, request);
    if (refusal) refuseWith(refusal);
    const circular = await createTypedFile(tx, request, {
      kind: DELIVERABLE_KINDS.CIRCULAR,
      label: label || "التعميم",
      file,
      userId,
      issuedOn: circularDate,
      supersedeWhere: {},
    });
    await tx.contactRequest.update({ where: { id: contactRequestId }, data: { circularProcessingAt: request.circularProcessingAt || new Date() } });
    // The circular task is done once the circular itself is uploaded.
    await tx.caseTask.updateMany({
      where: { contactRequestId, status: "OPEN", source: "SYSTEM", systemKey: EGYPT_TRAVEL_TASK_KEYS.CIRCULAR },
      data: { status: "COMPLETED", completedAt: new Date(), completedByUserId: userId },
    });
    await auditInTransaction(tx, { userId, action: "EGYPT_CIRCULAR_ISSUED", entityId: contactRequestId, organizationId, newValue: { deliverableId: circular.id, version: circular.version, issuedOn: circularDate, travelDate: requestTravelDate(request) } });
    return { circular, request };
  });
  if (result.error || result.refusal) {
    discardUpload(file);
    return result;
  }
  await announce(result.request, {
    title: "تم إصدار التعميم",
    message: `تم إصدار التعميم لطلبك (${describeRequest(result.request)}). يمكنك تحميله بصيغة PDF.`,
    type: "EGYPT_CIRCULAR_ISSUED",
  });
  return { deliverable: result.circular };
}

// A ticket staff obtained (or received from the customer by other means),
// attached to the approval request and downloadable by the customer. It is
// not the approval and does not complete anything by itself.
export async function attachEgyptTicket(contactRequestId, organizationId, userId, { file, label, travelerIds }) {
  if (!file) return { error: "FILE_REQUIRED" };
  if (!verifyStoredUpload(file)) {
    discardUpload(file);
    return { refusal: STORAGE_FAILED };
  }
  const result = await lockedWithUpload(file, contactRequestId, { organizationId }, async (tx, request) => {
    const refusal = checkAction(ACTIONS.ATTACH_TICKET, request);
    if (refusal) refuseWith(refusal);
    const coverage = [...new Set(travelerIds || [])];
    if (coverage.some((id) => !request.travelers.some((t) => t.id === id))) refuseWith({ status: 400, code: "INVALID_COVERAGE", message: "التذكرة مُسندة إلى مسافر لا ينتمي إلى هذا الطلب." });
    const ticket = await createTypedFile(tx, request, {
      kind: DELIVERABLE_KINDS.TICKET,
      label: label || (requestEntryMode(request) === "BORDER" ? "تذكرة الرحلة البرية" : "تذكرة الطيران"),
      file,
      userId,
      travelerIds: coverage,
    });
    await auditInTransaction(tx, { userId, action: "EGYPT_TICKET_ATTACHED", entityId: contactRequestId, organizationId, newValue: { deliverableId: ticket.id, travelerIds: coverage } });
    return { ticket, request };
  });
  if (result.error || result.refusal) {
    discardUpload(file);
    return result;
  }
  await announce(result.request, {
    title: "أُضيفت تذكرة لطلبك",
    message: `أضافت الوكالة تذكرة السفر لطلبك (${describeRequest(result.request)}).`,
    type: "EGYPT_TICKET_ATTACHED",
  });
  return { deliverable: result.ticket };
}

// Staff change (or set) the travel date, with a written reason. Audited with
// the old and new date; tasks and reminders follow in the same transaction.
// If the circular was already issued for the old date it no longer matches:
// it is withdrawn (kept in history) and the circular goes back to processing.
export async function editEgyptTravelDate(contactRequestId, organizationId, userId, { entryDate, reason }) {
  const days = calendarDaysUntilEntry(entryDate);
  if (days === null) return { refusal: { status: 400, code: "INVALID_DATE", message: "تاريخ السفر غير صالح." } };
  if (days < 0) return { refusal: { status: 400, code: "ENTRY_DATE_PASSED", message: "تاريخ السفر مضى." } };
  return withLockedRequest(contactRequestId, { organizationId }, async (tx, request) => {
    const refusal = checkAction(ACTIONS.EDIT_TRAVEL_DATE, request);
    if (refusal) refuseWith(refusal);
    const previousDate = requestTravelDate(request);
    if (previousDate === entryDate) return { unchanged: true, travelDate: entryDate };
    const existing = request.intakeData?.egyptTravel || {};
    const entryMode = existing.entryMode || requestEntryMode(request);
    const plan = travelPlanFor(request, {
      entryMode,
      // A date set by staff with no customer plan yet: the booking is the
      // agency's to confirm (no ticket is assumed).
      bookingStatus: existing.bookingStatus || "NEEDS_NASAEM",
      entryDate,
      ticketDocumentId: existing.ticketDocumentId || null,
    });
    await applyTravelPlanInTransaction(tx, request, plan);
    let circularWithdrawn = false;
    if (circularState(request).status === "ISSUED") {
      await tx.contactRequestDeliverable.updateMany({ where: { contactRequestId, kind: DELIVERABLE_KINDS.CIRCULAR, supersededAt: null }, data: { supersededAt: new Date() } });
      await tx.contactRequest.update({ where: { id: contactRequestId }, data: { circularProcessingAt: new Date() } });
      circularWithdrawn = true;
    }
    await auditInTransaction(tx, {
      userId,
      action: "EGYPT_TRAVEL_DATE_CHANGED",
      entityId: contactRequestId,
      organizationId,
      oldValue: { travelDate: previousDate },
      newValue: { travelDate: entryDate, reason, circularWithdrawn, by: "STAFF" },
    });
    return { travelDate: entryDate, previousDate, circularWithdrawn };
  });
}

// Staff check (and, where the ticket says otherwise, correct) the flight
// details of an air request: under the request lock, merged into the stored
// travel plan, verification recorded (who, when) and audited with the old
// and new values and the reason. It changes no date, task or reminder.
export async function verifyEgyptFlightDetails(contactRequestId, organizationId, userId, { verified, reason, ...values }) {
  return withLockedRequest(contactRequestId, { organizationId }, async (tx, request) => {
    const refusal = checkAction(ACTIONS.EDIT_TRAVEL_DATE, request);
    if (refusal) refuseWith(refusal);
    if (requestEntryMode(request) !== "AIR") refuseWith({ status: 400, code: "NOT_AIR", message: "بيانات الرحلة الجوية تخص الدخول الجوي فقط." });
    const travel = request.intakeData?.egyptTravel || {};
    const before = travel.flightDetails || null;
    const merged = { ...(before || {}) };
    for (const key of FLIGHT_DETAIL_KEYS) if (values[key] !== undefined) merged[key] = values[key];
    if (!hasFlightDetails(merged)) refuseWith({ status: 400, code: "FLIGHT_DETAILS_REQUIRED", message: "أدخل رقم الرحلة أو بياناتها أولًا." });
    const details = {
      ...merged,
      source: before && FLIGHT_DETAIL_KEYS.every((key) => (before[key] || null) === (merged[key] || null)) ? before.source || "CUSTOMER" : "STAFF",
      verifiedAt: verified ? new Date().toISOString() : null,
      verifiedByUserId: verified ? userId : null,
    };
    await tx.contactRequest.update({
      where: { id: contactRequestId },
      data: { intakeData: { ...(request.intakeData || {}), egyptTravel: { ...travel, flightDetails: details } } },
    });
    await auditInTransaction(tx, {
      userId,
      action: "EGYPT_FLIGHT_DETAILS_VERIFIED",
      entityId: contactRequestId,
      organizationId,
      oldValue: { flightDetails: before },
      newValue: { flightDetails: details, reason: reason || null },
    });
    return { flightDetails: details };
  });
}

export async function listTravelReminders(contactRequestId) {
  return prisma.travelReminder.findMany({ where: { contactRequestId }, orderBy: { createdAt: "desc" } });
}
