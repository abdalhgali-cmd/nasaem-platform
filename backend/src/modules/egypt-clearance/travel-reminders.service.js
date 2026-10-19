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
import { EGYPT_CLEARANCE_CODE, isEgyptClearanceCode } from "./egypt-clearance-variants.js";
import { calendarDaysUntil, dateOnlyString, reminderPlan, requestTravelDate, todayInKhartoum } from "./egypt-approval-rules.js";

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

// One due reminder, under the request's row lock: the lock is taken first,
// then the reminder and the request are read, so a concurrent date change
// (which holds the same lock) is either fully before or fully after. The
// request must still be open with the same date and schedule revision, and
// the row still SCHEDULED and due; the claim and the staff notifications
// commit together (a crash sends none or all).
async function deliverReminder(reminderId, contactRequestId, now) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ContactRequest" WHERE id = ${contactRequestId} FOR UPDATE`;
    const reminder = await tx.travelReminder.findUnique({ where: { id: reminderId } });
    if (!reminder || reminder.status !== "SCHEDULED" || reminder.dueAt > now) return "SKIPPED";
    const request = await tx.contactRequest.findUnique({
      where: { id: contactRequestId },
      select: { id: true, name: true, status: true, organizationId: true, travelEntryDate: true, travelScheduleRevision: true, intakeData: true, visaType: { select: { code: true } } },
    });
    const sameDate = request && requestTravelDate(request) === dateOnlyString(reminder.travelDate);
    if (!request || request.status === "CLOSED" || !sameDate || reminder.revision !== request.travelScheduleRevision) {
      await tx.travelReminder.updateMany({ where: { id: reminderId, status: "SCHEDULED", revision: reminder.revision }, data: { status: request?.status === "CLOSED" ? "CANCELLED" : "SUPERSEDED" } });
      return "STALE";
    }
    const claimed = await tx.travelReminder.updateMany({ where: { id: reminderId, status: "SCHEDULED", revision: reminder.revision }, data: { status: "SENT", sentAt: new Date() } });
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

// Open Egypt requests whose travel date has no reminder yet (dates written
// before reminders existed — the migration backfill — or by an older build):
// scheduled under the request lock exactly as a date change would.
export async function reconcileTravelSchedules({ now = new Date(), limit = 100 } = {}) {
  const today = new Date(`${todayInKhartoum(now)}T00:00:00.000Z`);
  const candidates = await prisma.contactRequest.findMany({
    where: {
      status: { not: "CLOSED" },
      travelEntryDate: { gte: today },
      visaType: { code: { startsWith: EGYPT_CLEARANCE_CODE } },
      travelReminders: { none: { status: { in: ["SCHEDULED", "SENT"] } } },
    },
    select: { id: true },
    take: limit,
  });
  let scheduled = 0;
  for (const { id } of candidates) {
    const done = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ContactRequest" WHERE id = ${id} FOR UPDATE`;
      const request = await tx.contactRequest.findUnique({ where: { id }, select: { id: true, status: true, travelEntryDate: true, travelScheduleRevision: true, intakeData: true, visaType: { select: { code: true } } } });
      return request ? syncTravelReminders(tx, request, { now }) : null;
    });
    if (done) scheduled += 1;
  }
  return { scheduled };
}

export async function processDueTravelReminders({ now = new Date(), limit = 50 } = {}) {
  const due = await prisma.travelReminder.findMany({
    where: { status: "SCHEDULED", dueAt: { lte: now } },
    orderBy: { dueAt: "asc" },
    take: limit,
    select: { id: true, contactRequestId: true },
  });
  const outcomes = {};
  for (const row of due) {
    const outcome = await deliverReminder(row.id, row.contactRequestId, now).catch((error) => {
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
      const reconciled = await reconcileTravelSchedules();
      const result = await processDueTravelReminders();
      if (result.processed || reconciled.scheduled) console.log("[travel-reminders]", JSON.stringify({ ...result, ...reconciled }));
    } catch (error) {
      console.error("[travel-reminders] run failed", error?.message);
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref?.();
}
