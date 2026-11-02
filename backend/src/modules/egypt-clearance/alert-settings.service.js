// Lead times of the Egypt staff alerts, set by an administrator in the
// back-office (Egypt tab → «إعدادات التنبيهات»). One JSON setting per
// organization (each agency sets its own; one never changes another's) and
// always read through `alertSettings`, which validates it again and
// falls back to the defaults: a hand-edited or broken value can never stop
// the reminders or produce an absurd schedule.
import { z } from "zod";
import prisma from "../../config/database.js";
import { redactSensitive } from "../../utils/activityLog.js";

export const ALERT_SETTINGS_KEY = "egypt.alerts";

export const ALERT_DEFAULTS = Object.freeze({
  // Travel reminder: N calendar days before the travel date, at HH:00 Khartoum.
  travelReminderDaysBefore: 3,
  travelReminderLocalHour: 9,
  // A receipt still not confirmed or rejected after N hours.
  paymentReviewHours: 24,
  // Payment confirmed, approval not issued after N hours.
  approvalIssuanceHours: 48,
  // Circular not issued N days or less before travel.
  circularLeadDays: 2,
  // Travel items (ticket, date, crossing) still missing N days or less before travel.
  missingTravelDocsLeadDays: 5,
  // A request nobody is assigned to after N hours.
  unassignedHours: 4,
});

const int = (min, max) => z.number().int().min(min).max(max);
export const alertSettingsSchema = z.object({
  travelReminderDaysBefore: int(1, 30),
  travelReminderLocalHour: int(0, 23),
  paymentReviewHours: int(1, 720),
  approvalIssuanceHours: int(1, 720),
  circularLeadDays: int(0, 30),
  missingTravelDocsLeadDays: int(0, 60),
  unassignedHours: int(1, 720),
}).strict();

// What is stored, merged over the defaults; an invalid field is replaced by
// its default (never thrown at a worker).
export function normalizeAlertSettings(raw) {
  let value = {};
  try {
    value = typeof raw === "string" ? JSON.parse(raw) : raw || {};
  } catch {
    value = {};
  }
  const result = { ...ALERT_DEFAULTS };
  for (const [key, schema] of Object.entries(alertSettingsSchema.shape)) {
    const parsed = schema.safeParse(value?.[key]);
    if (parsed.success) result[key] = parsed.data;
  }
  return result;
}

export function alertSettingsKey(organizationId) {
  return organizationId ? `${ALERT_SETTINGS_KEY}:${organizationId}` : ALERT_SETTINGS_KEY;
}

export async function alertSettings(db = prisma, organizationId = null) {
  const row = await db.setting.findUnique({ where: { key: alertSettingsKey(organizationId) } }).catch(() => null);
  return normalizeAlertSettings(row?.value);
}

// Validated as a whole (all fields, in range) and audited with the old and
// new values. Concurrent saves of one organization are serialized (advisory
// lock), so each audit row's old value is the value it really replaced.
// Returns { settings, travelScheduleChanged } or { error, details }.
export async function saveAlertSettings(input, { userId = null, organizationId = null } = {}) {
  const parsed = alertSettingsSchema.safeParse(input);
  if (!parsed.success) return { error: "INVALID_ALERT_SETTINGS", details: parsed.error.flatten() };
  const key = alertSettingsKey(organizationId);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    const before = await alertSettings(tx, organizationId);
    await tx.setting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(parsed.data) },
      update: { value: JSON.stringify(parsed.data) },
    });
    await tx.activityLog.create({
      data: { userId, organizationId, action: "EGYPT_ALERT_SETTINGS_UPDATED", entity: "Setting", entityId: key, oldValue: redactSensitive(before), newValue: redactSensitive(parsed.data) },
    });
    const changed = before.travelReminderDaysBefore !== parsed.data.travelReminderDaysBefore || before.travelReminderLocalHour !== parsed.data.travelReminderLocalHour;
    return { settings: parsed.data, travelScheduleChanged: changed };
  });
}
