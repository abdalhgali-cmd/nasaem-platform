// Staff travel reminders for Egypt approval requests: 3 calendar days before
// the travel date (Africa/Khartoum), or URGENT at once when the date is
// already closer (egypt-approval-rules.js reminderPlan).
//
// syncTravelReminders runs inside the same locked transaction that changes
// a request's travel date or closes it, so the schedule can never disagree
// with the date it was computed for:
//   - closed request, or no date: SCHEDULED rows are CANCELLED;
//   - rows of another date (or of the other kind for this date): SUPERSEDED;
//   - a reminder already SENT for this date (either kind): nothing new;
//   - otherwise one SCHEDULED row for (request, date, kind), reactivating a
//     cancelled/superseded row of the same key with the new revision.
// The worker (processDueTravelReminders) re-checks all of it under the
// request's row lock before notifying, and claims each row once.
import prisma from "../../config/database.js";
import { isEgyptClearanceCode } from "./egypt-clearance-variants.js";
import { calendarDaysUntil, dateOnlyString, reminderPlan, requestTravelDate } from "./egypt-approval-rules.js";

const STAFF_ROLES = ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"];

function dateValue(dateString) {
  return new Date(`${dateString}T00:00:00.000Z`);
}

export async function syncTravelReminders(tx, request, { now = new Date() } = {}) {
  const id = request.id;
  const open = request.status !== "CLOSED" && isEgyptClearanceCode(request.visaType?.code);
  const date = open ? requestTravelDate(request) : null;
  const plan = date ? reminderPlan(date, now) : null;
  if (!plan) {
    await tx.travelReminder.updateMany({ where: { contactRequestId: id, status: "SCHEDULED" }, data: { status: "CANCELLED" } });
    return null;
  }
  const travelDate = dateValue(plan.travelDate);
  await tx.travelReminder.updateMany({
    where: { contactRequestId: id, status: "SCHEDULED", OR: [{ travelDate: { not: travelDate } }, { kind: { not: plan.kind } }] },
    data: { status: "SUPERSEDED" },
  });
  const alreadySent = await tx.travelReminder.findFirst({ where: { contactRequestId: id, travelDate, status: "SENT" }, select: { id: true } });
  if (alreadySent) return null;
  const revision = request.travelScheduleRevision ?? 0;
  return tx.travelReminder.upsert({
    where: { contactRequestId_travelDate_kind: { contactRequestId: id, travelDate, kind: plan.kind } },
    create: { contactRequestId: id, travelDate, kind: plan.kind, revision, dueAt: plan.dueAt },
    update: { status: "SCHEDULED", revision, dueAt: plan.dueAt, sentAt: null },
  });
}

function reminderText(request, reminder) {
  const date = dateOnlyString(reminder.travelDate);
  const days = calendarDaysUntil(date);
  const when = days === 0 ? "اليوم" : days === 1 ? "غدًا" : `بعد ${days} أيام`;
  return {
    title: reminder.kind === "URGENT" ? "عاجل: سفر قريب لطلب موافقة أمنية" : "تذكير: سفر بعد 3 أيام",
    message: `يسافر ${request.name} ${when} (${date}) — طلب الموافقة الأمنية ${request.id}. راجع التذكرة/المنفذ والتعميم.`,
  };
}

// One due reminder, under the request's row lock: the request must still be
// open with the same travel date, and the row still SCHEDULED; the claim and
// the staff notifications commit together (a crash sends none or all).
async function deliverReminder(reminderId) {
  return prisma.$transaction(async (tx) => {
    const reminder = await tx.travelReminder.findUnique({ where: { id: reminderId } });
    if (!reminder || reminder.status !== "SCHEDULED") return "SKIPPED";
    await tx.$queryRaw`SELECT id FROM "ContactRequest" WHERE id = ${reminder.contactRequestId} FOR UPDATE`;
    const request = await tx.contactRequest.findUnique({
      where: { id: reminder.contactRequestId },
      select: { id: true, name: true, status: true, organizationId: true, travelEntryDate: true, travelScheduleRevision: true, intakeData: true, visaType: { select: { code: true } } },
    });
    const sameDate = request && requestTravelDate(request) === dateOnlyString(reminder.travelDate);
    if (!request || request.status === "CLOSED" || !sameDate || reminder.revision !== request.travelScheduleRevision) {
      await tx.travelReminder.updateMany({ where: { id: reminderId, status: "SCHEDULED" }, data: { status: request?.status === "CLOSED" ? "CANCELLED" : "SUPERSEDED" } });
      return "STALE";
    }
    const claimed = await tx.travelReminder.updateMany({ where: { id: reminderId, status: "SCHEDULED" }, data: { status: "SENT", sentAt: new Date() } });
    if (claimed.count !== 1) return "SKIPPED";
    const staff = await tx.user.findMany({ where: { organizationId: request.organizationId, role: { in: STAFF_ROLES }, status: "ACTIVE" }, select: { id: true } });
    const text = reminderText(request, reminder);
    const type = reminder.kind === "URGENT" ? "EGYPT_TRAVEL_REMINDER_URGENT" : "EGYPT_TRAVEL_REMINDER";
    if (staff.length) {
      await tx.notification.createMany({ data: staff.map((user) => ({ ...text, type, userId: user.id, contactRequestId: request.id })) });
    }
    return "SENT";
  });
}

export async function processDueTravelReminders({ now = new Date(), limit = 50 } = {}) {
  const due = await prisma.travelReminder.findMany({
    where: { status: "SCHEDULED", dueAt: { lte: now } },
    orderBy: { dueAt: "asc" },
    take: limit,
    select: { id: true },
  });
  const outcomes = {};
  for (const row of due) {
    const outcome = await deliverReminder(row.id).catch((error) => {
      console.error("[travel-reminders] delivery failed", error?.message);
      return "ERROR";
    });
    outcomes[outcome] = (outcomes[outcome] || 0) + 1;
  }
  return { processed: due.length, outcomes };
}

let timer = null;
export function startTravelReminderWorker({ intervalMs = 5 * 60_000 } = {}) {
  if (timer) return;
  let running = false;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const result = await processDueTravelReminders();
      if (result.processed) console.log("[travel-reminders]", JSON.stringify(result));
    } catch (error) {
      console.error("[travel-reminders] run failed", error?.message);
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref?.();
}
