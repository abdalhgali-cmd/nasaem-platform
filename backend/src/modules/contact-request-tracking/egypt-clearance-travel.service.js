import prisma from "../../config/database.js";
import { logActivity } from "../../utils/activityLog.js";
import { createContactRequestDocument } from "../contact-request-documents/contact-request-documents.service.js";
import { notifyAdmins } from "../contact-requests/contact-requests.service.js";

const EGYPT_CLEARANCE_CODE = "VISA-EGYPT-CLEARANCE";
const KHARTOUM_TIME_ZONE = "Africa/Khartoum";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function localDateParts(date, timeZone = KHARTOUM_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return { year, month, day };
}

function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day, utc };
}

export function calendarDaysUntilEntry(entryDate, now = new Date()) {
  const parsed = parseDateOnly(entryDate);
  if (!parsed) return null;
  const today = localDateParts(now);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  return Math.floor((parsed.utc.getTime() - todayUtc) / MS_PER_DAY);
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

function bookingTaskTitle(entryMode) {
  return entryMode === "AIR"
    ? "ترتيب حجز طيران للموافقة الأمنية لمصر"
    : "ترتيب رحلة برية للموافقة الأمنية لمصر";
}

async function syncEgyptTravelTasks(contactRequestId, plan) {
  const bookingTitles = [
    "ترتيب حجز طيران للموافقة الأمنية لمصر",
    "ترتيب رحلة برية للموافقة الأمنية لمصر",
  ];

  if (plan.bookingStatus === "NEEDS_NASAEM") {
    await prisma.caseTask.updateMany({
      where: {
        contactRequestId,
        status: "OPEN",
        source: "SYSTEM",
        type: "OTHER",
        title: { in: bookingTitles.filter((title) => title !== bookingTaskTitle(plan.entryMode)) },
      },
      data: { status: "CANCELLED" },
    });

    const existing = await prisma.caseTask.findFirst({
      where: {
        contactRequestId,
        status: "OPEN",
        source: "SYSTEM",
        type: "OTHER",
        title: bookingTaskTitle(plan.entryMode),
      },
      select: { id: true },
    });
    if (!existing) {
      await prisma.caseTask.create({
        data: {
          contactRequestId,
          type: "OTHER",
          source: "SYSTEM",
          title: bookingTaskTitle(plan.entryMode),
        },
      });
    }
  } else {
    await prisma.caseTask.updateMany({
      where: {
        contactRequestId,
        status: "OPEN",
        source: "SYSTEM",
        type: "OTHER",
        title: { in: bookingTitles },
      },
      data: { status: "CANCELLED" },
    });
  }

  const circularTitle = "تجهيز تعميم الموافقة الأمنية لمصر";
  if (plan.circularStatus === "READY_FOR_CIRCULAR") {
    const parsed = parseDateOnly(plan.entryDate);
    const dueAt = parsed ? new Date(parsed.utc.getTime() - 3 * MS_PER_DAY) : null;
    const existingCircular = await prisma.caseTask.findFirst({
      where: {
        contactRequestId,
        status: "OPEN",
        source: "SYSTEM",
        type: "OTHER",
        title: circularTitle,
      },
      select: { id: true },
    });
    if (existingCircular) {
      await prisma.caseTask.update({ where: { id: existingCircular.id }, data: { dueAt } });
    } else {
      await prisma.caseTask.create({
        data: {
          contactRequestId,
          type: "OTHER",
          source: "SYSTEM",
          title: circularTitle,
          dueAt,
        },
      });
    }
  } else {
    await prisma.caseTask.updateMany({
      where: {
        contactRequestId,
        status: "OPEN",
        source: "SYSTEM",
        type: "OTHER",
        title: circularTitle,
      },
      data: { status: "CANCELLED" },
    });
  }
}

export async function saveMyEgyptTravelPlan(
  phoneNormalized,
  contactRequestId,
  { entryMode, bookingStatus, entryDate },
  file
) {
  const request = await prisma.contactRequest.findFirst({
    where: { id: contactRequestId, phoneNormalized },
    include: {
      visaType: { select: { code: true } },
      deliverables: { select: { id: true } },
    },
  });

  if (!request) return { error: "NOT_FOUND" };
  if (request.visaType?.code !== EGYPT_CLEARANCE_CODE) return { error: "WRONG_SERVICE" };

  const daysUntilEntry = calendarDaysUntilEntry(entryDate);
  if (daysUntilEntry === null) return { error: "INVALID_DATE" };
  if (daysUntilEntry < 0) return { error: "ENTRY_DATE_PASSED" };

  const currentPlan = request.intakeData?.egyptTravel || null;
  let ticketDocumentId = currentPlan?.ticketDocumentId || null;

  if (bookingStatus === "EXISTING") {
    if (!file && !ticketDocumentId) return { error: "BOOKING_DOCUMENT_REQUIRED" };
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

  const circular = deriveEgyptCircularStatus({
    entryDate,
    bookingStatus,
    approvalIssued: request.deliverables.length > 0,
  });

  const plan = {
    entryMode,
    bookingStatus,
    entryDate,
    ticketDocumentId,
    circularStatus: circular.status,
    daysUntilEntry: circular.daysUntilEntry,
    updatedAt: new Date().toISOString(),
  };

  await prisma.contactRequest.update({
    where: { id: contactRequestId },
    data: {
      intakeData: {
        ...(request.intakeData || {}),
        egyptTravel: plan,
      },
    },
  });

  await syncEgyptTravelTasks(contactRequestId, plan);

  logActivity({
    action: "EGYPT_CLEARANCE_TRAVEL_PLAN_UPDATED",
    entity: "ContactRequest",
    entityId: contactRequestId,
  });

  await notifyAdmins({
    organizationId: request.organizationId,
    title: bookingStatus === "NEEDS_NASAEM" ? "طلب حجز مرتبط بموافقة أمنية" : "تم استكمال بيانات السفر للموافقة الأمنية",
    message:
      bookingStatus === "NEEDS_NASAEM"
        ? `طلب العميل حجز ${entryMode === "AIR" ? "طيران" : "رحلة برية"} للطلب ${contactRequestId} بتاريخ دخول ${entryDate}.`
        : `رفع العميل بيانات الحجز للطلب ${contactRequestId} بتاريخ دخول ${entryDate}.`,
    type: "EGYPT_CLEARANCE_TRAVEL_PLAN_UPDATED",
  });

  return { plan };
}
