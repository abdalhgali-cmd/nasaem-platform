import { customerFlightDetails, hasFlightDetails } from "../egypt-clearance/flight-details.js";
import prisma from "../../config/database.js";
import { trackingScope } from "../../utils/publicOrganization.js";
import { createContactRequestDocument } from "../contact-request-documents/contact-request-documents.service.js";
import { notifyAdmins } from "../contact-requests/contact-requests.service.js";
import { EGYPT_TRAVEL_TASK_KEYS, EGYPT_TRAVEL_TASK_TITLES } from "./egypt-travel-tasks.js";
import { ACTIONS, checkAction } from "../contact-request-workflow/workflow-policy.js";
import { auditInTransaction, refuseWith, withLockedRequest } from "../contact-request-workflow/workflow-lock.js";

import { isEgyptClearanceCode, variantEntryMode } from "../egypt-clearance/egypt-clearance-variants.js";
import { calendarDaysUntil, isApprovalIssued, parseDateOnly, requestTravelDate } from "../egypt-clearance/egypt-approval-rules.js";
import { syncTravelReminders } from "../egypt-clearance/travel-reminders.service.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Dates are Africa/Khartoum calendar days (egypt-approval-rules.js).
export function calendarDaysUntilEntry(entryDate, now = new Date()) {
  return calendarDaysUntil(entryDate, now);
}

// The customer supplies a date, not an exact arrival time. We therefore
// refuse to make a false exact-72-hour promise when the trip is exactly
// three calendar days away: that case needs staff/time confirmation. Four
// or more calendar days is safely beyond 72 hours regardless of time of day.
export function deriveEgyptCircularStatus({ entryDate, bookingStatus, approvalIssued, now = new Date() }) {
  const daysUntilEntry = calendarDaysUntilEntry(entryDate, now);
  if (daysUntilEntry === null) return { status: "INVALID_DATE", daysUntilEntry: null };
  if (daysUntilEntry < 0) return { status: "ENTRY_DATE_PASSED", daysUntilEntry };
  if (bookingStatus === "NEEDS_NASAEM") return { status: "BOOKING_REQUIRED", daysUntilEntry };
  if (!approvalIssued) return { status: "WAITING_APPROVAL", daysUntilEntry };
  if (daysUntilEntry < 3) return { status: "TOO_LATE_FOR_NORMAL_CIRCULAR", daysUntilEntry };
  if (daysUntilEntry === 3) return { status: "TIME_CONFIRMATION_REQUIRED", daysUntilEntry };
  return { status: "READY_FOR_CIRCULAR", daysUntilEntry };
}

function ticketLabel(entryMode) {
  return entryMode === "AIR"
    ? "تذكرة الطيران — التعميم"
    : "إثبات حجز الرحلة البرية — التعميم";
}

function bookingTaskKey(entryMode) {
  return entryMode === "AIR" ? EGYPT_TRAVEL_TASK_KEYS.BOOKING_AIR : EGYPT_TRAVEL_TASK_KEYS.BOOKING_BORDER;
}

// Tasks are found by their stable systemKey; the title is only for display.
export async function syncEgyptTravelTasks(db, contactRequestId, plan) {
  const bookingKeys = [EGYPT_TRAVEL_TASK_KEYS.BOOKING_AIR, EGYPT_TRAVEL_TASK_KEYS.BOOKING_BORDER];

  if (plan.bookingStatus === "NEEDS_NASAEM") {
    await db.caseTask.updateMany({
      where: {
        contactRequestId,
        status: "OPEN",
        source: "SYSTEM",
        type: "OTHER",
        systemKey: { in: bookingKeys.filter((key) => key !== bookingTaskKey(plan.entryMode)) },
      },
      data: { status: "CANCELLED" },
    });

    const existing = await db.caseTask.findFirst({
      where: {
        contactRequestId,
        status: "OPEN",
        source: "SYSTEM",
        type: "OTHER",
        systemKey: bookingTaskKey(plan.entryMode),
      },
      select: { id: true },
    });
    if (!existing) {
      await db.caseTask.create({
        data: {
          contactRequestId,
          type: "OTHER",
          source: "SYSTEM",
          systemKey: bookingTaskKey(plan.entryMode),
          title: EGYPT_TRAVEL_TASK_TITLES[bookingTaskKey(plan.entryMode)],
        },
      });
    }
  } else {
    await db.caseTask.updateMany({
      where: {
        contactRequestId,
        status: "OPEN",
        source: "SYSTEM",
        type: "OTHER",
        systemKey: { in: bookingKeys },
      },
      data: { status: "CANCELLED" },
    });
  }

  const circularKey = EGYPT_TRAVEL_TASK_KEYS.CIRCULAR;
  if (plan.circularStatus === "READY_FOR_CIRCULAR") {
    const parsed = parseDateOnly(plan.entryDate);
    const dueAt = parsed ? new Date(parsed.utc.getTime() - 3 * MS_PER_DAY) : null;
    const existingCircular = await db.caseTask.findFirst({
      where: {
        contactRequestId,
        status: "OPEN",
        source: "SYSTEM",
        type: "OTHER",
        systemKey: circularKey,
      },
      select: { id: true },
    });
    if (existingCircular) {
      await db.caseTask.update({ where: { id: existingCircular.id }, data: { dueAt } });
    } else {
      await db.caseTask.create({
        data: {
          contactRequestId,
          type: "OTHER",
          source: "SYSTEM",
          systemKey: circularKey,
          title: EGYPT_TRAVEL_TASK_TITLES[circularKey],
          dueAt,
        },
      });
    }
  } else {
    await db.caseTask.updateMany({
      where: {
        contactRequestId,
        status: "OPEN",
        source: "SYSTEM",
        type: "OTHER",
        systemKey: circularKey,
      },
      data: { status: "CANCELLED" },
    });
  }
}

// Writes a travel date as the request's canonical date, inside the caller's
// locked transaction: the typed column, the plan kept in intakeData for
// older clients, a new schedule revision when the date changes, the
// circular task and the staff reminders — all from the same state.
// `plan` is the full egyptTravel object to store.
export async function applyTravelPlanInTransaction(tx, locked, plan) {
  const previousDate = requestTravelDate(locked);
  const dateChanged = previousDate !== plan.entryDate;
  const updated = await tx.contactRequest.update({
    where: { id: locked.id },
    data: {
      intakeData: { ...(locked.intakeData || {}), egyptTravel: plan },
      travelEntryDate: plan.entryDate ? new Date(`${plan.entryDate}T00:00:00.000Z`) : null,
      ...(dateChanged ? { travelScheduleRevision: { increment: 1 } } : {}),
    },
    select: { id: true, status: true, intakeData: true, travelEntryDate: true, travelScheduleRevision: true, visaType: { select: { code: true } } },
  });
  await syncEgyptTravelTasks(tx, locked.id, plan);
  await syncTravelReminders(tx, updated);
  return { updated, previousDate, dateChanged };
}

// The circular status for a plan as it would be stored on `request`.
export function travelPlanFor(request, { entryMode, bookingStatus, entryDate, ticketDocumentId }) {
  const circular = deriveEgyptCircularStatus({ entryDate, bookingStatus, approvalIssued: isApprovalIssued(request) });
  return {
    ...(request.intakeData?.egyptTravel || {}),
    entryMode,
    bookingStatus,
    entryDate,
    ticketDocumentId,
    circularStatus: circular.status,
    daysUntilEntry: circular.daysUntilEntry,
    updatedAt: new Date().toISOString(),
  };
}

export async function saveMyEgyptTravelPlan(
  phoneNormalized,
  contactRequestId,
  { entryMode: givenEntryMode, bookingStatus, entryDate, entryPort, ...flightValues },
  file
) {
  const request = await prisma.contactRequest.findFirst({
    where: { id: contactRequestId, ...trackingScope(phoneNormalized) },
    include: {
      visaType: { select: { code: true } },
      deliverables: { select: { id: true, kind: true, publishedAt: true, supersededAt: true, travelerIds: true } },
      travelers: { select: { id: true } },
    },
  });

  if (!request) return { error: "NOT_FOUND" };
  if (!isEgyptClearanceCode(request.visaType?.code)) return { error: "WRONG_SERVICE" };
  // A variant request already fixed the entry method when it was booked: it
  // is not asked again, and a different one is refused.
  const fixedEntryMode = variantEntryMode(request.visaType?.code);
  if (fixedEntryMode && givenEntryMode && givenEntryMode !== fixedEntryMode) return { error: "ENTRY_MODE_MISMATCH" };
  const entryMode = fixedEntryMode || givenEntryMode;
  if (!entryMode) return { error: "ENTRY_MODE_REQUIRED" };
  const closedRefusal = checkAction(ACTIONS.SAVE_TRAVEL_PLAN, request);
  if (closedRefusal) return { refusal: closedRefusal };

  const daysUntilEntry = calendarDaysUntilEntry(entryDate);
  if (daysUntilEntry === null) return { error: "INVALID_DATE" };
  if (daysUntilEntry < 0) return { error: "ENTRY_DATE_PASSED" };

  const currentPlan = request.intakeData?.egyptTravel || null;
  let ticketDocumentId = currentPlan?.ticketDocumentId || null;

  // Air: an existing booking comes with its ticket. Overland: the crossing
  // and the confirmed arrival date are what the circular needs (a document
  // is optional).
  if (bookingStatus === "EXISTING") {
    if (!file && !ticketDocumentId && entryMode === "AIR") return { error: "BOOKING_DOCUMENT_REQUIRED" };
    if (file) {
      const upload = await createContactRequestDocument(contactRequestId, {
        label: ticketLabel(entryMode),
        file,
        classification: "CUSTOMER_DOCUMENT",
      });
      if (upload.error) return upload;
      ticketDocumentId = upload.document.id;
    }
  } else {
    ticketDocumentId = null;
  }

  // Written under the request's row lock, re-checking that it is still
  // open (and that the circular was not issued meanwhile) and merging into
  // the intakeData stored at that moment.
  const saved = await withLockedRequest(contactRequestId, null, async (tx, locked) => {
    const refusal = checkAction(ACTIONS.SAVE_TRAVEL_PLAN, locked);
    if (refusal) refuseWith(refusal);
    const plan = travelPlanFor(locked, { entryMode, bookingStatus, entryDate, ticketDocumentId });
    // Flight details go with an air ticket the customer holds: new values
    // replace the stored ones (and their verification); none keeps them.
    if (entryMode !== "AIR" || bookingStatus !== "EXISTING") plan.flightDetails = null;
    else if (hasFlightDetails(flightValues)) plan.flightDetails = customerFlightDetails(flightValues);
    // Overland: the crossing goes with the request's route (one place).
    const port = entryMode === "BORDER" && typeof entryPort === "string" ? entryPort.trim().replace(/\s+/g, " ") : "";
    const base = port ? { ...locked, intakeData: { ...(locked.intakeData || {}), egyptRoute: { ...(locked.intakeData?.egyptRoute || { entryMode: "BORDER" }), entryPort: port } } } : locked;
    const { previousDate } = await applyTravelPlanInTransaction(tx, base, plan);
    await auditInTransaction(tx, {
      action: "EGYPT_CLEARANCE_TRAVEL_PLAN_UPDATED",
      entityId: contactRequestId,
      organizationId: locked.organizationId,
      oldValue: { entryDate: previousDate, bookingStatus: currentPlan?.bookingStatus ?? null },
      newValue: { entryDate, bookingStatus, entryMode, ...(port ? { entryPort: port } : {}), ...(plan.flightDetails ? { flightDetails: plan.flightDetails } : {}), by: "CUSTOMER", confirmed: true },
    });
    return { plan };
  });
  if (saved.error || saved.refusal) return saved;
  const { plan } = saved;

  await notifyAdmins({
    organizationId: request.organizationId,
    title: bookingStatus === "NEEDS_NASAEM" ? "طلب حجز مرتبط بموافقة أمنية" : "تم استكمال بيانات السفر للموافقة الأمنية",
    message:
      bookingStatus === "NEEDS_NASAEM"
        ? `طلب العميل حجز ${entryMode === "AIR" ? "طيران" : "رحلة برية"} للطلب ${contactRequestId} بتاريخ دخول ${entryDate}.`
        : `رفع العميل بيانات الحجز للطلب ${contactRequestId} بتاريخ دخول ${entryDate}.`,
    type: "EGYPT_CLEARANCE_TRAVEL_PLAN_UPDATED",
    contactRequestId,
    alsoRoles: ["EMPLOYEE"],
  });

  return { plan };
}
