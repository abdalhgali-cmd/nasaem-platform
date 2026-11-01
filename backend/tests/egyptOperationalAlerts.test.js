import "./env.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";
import { testPhone } from "./helpers/workflow.js";
import { normalizePhone } from "../src/utils/phone.js";
import { reminderPlan } from "../src/modules/egypt-clearance/egypt-approval-rules.js";
import { ALERT_DEFAULTS, alertSettings, alertSettingsKey, normalizeAlertSettings } from "../src/modules/egypt-clearance/alert-settings.service.js";
import { ALERT_KINDS, dueOperationalAlerts, processOperationalAlerts } from "../src/modules/egypt-clearance/operational-alerts.service.js";

// Phase 3 operations: administrator-set alert lead times, the travel
// reminder following them, and recurring staff alerts that fire once per
// occurrence (receipt, payment, travel date) and again for a new travel date.

const HOUR = 60 * 60 * 1000;
let admin;
let adminUser;
let employee;
let airVisa;
let previousSetting;
let settingsKey;
const created = [];

function isoDay(offsetDays, now = new Date()) {
  return new Date(now.getTime() + offsetDays * 24 * HOUR).toISOString().slice(0, 10);
}

async function egyptRequest(data = {}) {
  const phone = testPhone();
  const row = await prisma.contactRequest.create({
    data: {
      name: "TEST-OPS عميل",
      phone,
      phoneNormalized: normalizePhone(phone),
      message: "TEST-OPS",
      visaTypeId: airVisa.id,
      requestKind: "SERVICE_APPLICATION",
      pricingMode: "FIXED",
      intakeData: { egyptRoute: { entryMode: "AIR", departureCity: "بورتسودان", arrivalAirport: "القاهرة" } },
      travelers: { create: [{ fullName: "TEST-OPS مسافر", sortOrder: 0, isPrimary: true }] },
      ...data,
    },
  });
  created.push(row.id);
  return row;
}

const alertsFor = (id) => prisma.operationalAlert.findMany({ where: { contactRequestId: id }, orderBy: { createdAt: "asc" } });

before(async () => {
  adminUser = await createStaffUser({ role: "ADMIN" });
  admin = staffClient(adminUser);
  employee = staffClient(await createStaffUser({ role: "EMPLOYEE" }));
  airVisa = await prisma.visaType.findUnique({ where: { code: "VISA-EGYPT-CLEARANCE-AIR" } });
  settingsKey = alertSettingsKey(adminUser.organizationId || "org_nasaem_default");
  previousSetting = await prisma.setting.findUnique({ where: { key: settingsKey } });
});

after(async () => {
  if (previousSetting) await prisma.setting.update({ where: { key: settingsKey }, data: { value: previousSetting.value } });
  else await prisma.setting.deleteMany({ where: { key: settingsKey } });
  await prisma.contactRequest.deleteMany({ where: { id: { in: created } } });
});

describe("alert settings", () => {
  test("a stored value is validated field by field; anything broken falls back to the default", () => {
    assert.deepEqual(normalizeAlertSettings(null), ALERT_DEFAULTS);
    assert.deepEqual(normalizeAlertSettings("{not json"), ALERT_DEFAULTS);
    const mixed = normalizeAlertSettings(JSON.stringify({ travelReminderDaysBefore: 5, travelReminderLocalHour: 99, paymentReviewHours: "x" }));
    assert.equal(mixed.travelReminderDaysBefore, 5);
    assert.equal(mixed.travelReminderLocalHour, ALERT_DEFAULTS.travelReminderLocalHour);
    assert.equal(mixed.paymentReviewHours, ALERT_DEFAULTS.paymentReviewHours);
  });

  test("the travel reminder follows the configured lead time and hour", () => {
    const now = new Date("2026-11-01T10:00:00Z");
    const plan = reminderPlan("2026-11-10", now, { daysBefore: 5, localHour: 7 });
    assert.equal(plan.kind, "THREE_DAY");
    assert.equal(plan.dueAt.toISOString(), "2026-11-05T05:00:00.000Z", "5 days before at 07:00 Khartoum (UTC+2)");
    assert.equal(reminderPlan("2026-11-10", now).dueAt.toISOString(), "2026-11-07T07:00:00.000Z", "defaults unchanged");
    assert.equal(reminderPlan("2026-11-04", now, { daysBefore: 5, localHour: 7 }).kind, "URGENT");
  });

  test("staff read the settings; only administrators change them; invalid values are refused; the change is audited", async () => {
    const read = await employee.get("/api/contact-requests/egypt/alert-settings");
    assert.equal(read.status, 200, JSON.stringify(read.body));
    assert.ok(read.body.data.settings.travelReminderDaysBefore >= 1);
    const values = { ...ALERT_DEFAULTS, travelReminderDaysBefore: 4 };
    assert.equal((await employee.put("/api/contact-requests/egypt/alert-settings").send(values)).status, 403);
    const invalid = await admin.put("/api/contact-requests/egypt/alert-settings").send({ ...values, travelReminderLocalHour: 25 });
    assert.equal(invalid.status, 400);
    assert.equal((await admin.put("/api/contact-requests/egypt/alert-settings").send({ ...values, extra: 1 })).status, 400, "unknown fields refused");
    const saved = await admin.put("/api/contact-requests/egypt/alert-settings").send(values);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.data.settings.travelReminderDaysBefore, 4);
    const audit = await prisma.activityLog.findFirst({ where: { action: "EGYPT_ALERT_SETTINGS_UPDATED", userId: adminUser.id }, orderBy: { createdAt: "desc" } });
    assert.equal(audit.newValue.travelReminderDaysBefore, 4);
    // Each organization has its own settings: another agency keeps its defaults.
    const { createOrganization } = await import("./helpers/staff.js");
    const otherOrg = await createOrganization("alerts");
    assert.equal((await alertSettings(undefined, otherOrg.id)).travelReminderDaysBefore, ALERT_DEFAULTS.travelReminderDaysBefore);
    const otherAdmin = staffClient(await createStaffUser({ role: "ADMIN", organizationId: otherOrg.id }));
    assert.equal((await otherAdmin.put("/api/contact-requests/egypt/alert-settings").send({ ...values, travelReminderDaysBefore: 9 })).status, 200);
    assert.equal((await admin.get("/api/contact-requests/egypt/alert-settings")).body.data.settings.travelReminderDaysBefore, 4, "unchanged by the other agency");
    await prisma.setting.deleteMany({ where: { key: alertSettingsKey(otherOrg.id) } });
  });

  test("a new lead time re-plans the open requests' scheduled reminders", async () => {
    const date = isoDay(20);
    const request = await egyptRequest({ travelEntryDate: new Date(`${date}T00:00:00.000Z`) });
    const save = (days) => admin.put("/api/contact-requests/egypt/alert-settings").send({ ...ALERT_DEFAULTS, travelReminderDaysBefore: days });
    assert.equal((await save(3)).status, 200);
    assert.equal((await save(6)).status, 200);
    const reminder = await prisma.travelReminder.findFirst({ where: { contactRequestId: request.id, status: "SCHEDULED" } });
    assert.ok(reminder, "scheduled");
    const expected = new Date(`${date}T00:00:00.000Z`).getTime() - 6 * 24 * HOUR + 7 * HOUR;
    assert.equal(reminder.dueAt.getTime(), expected, "6 days before at 09:00 Khartoum");
    assert.equal((await save(3)).status, 200);
  });
});

describe("operational alerts", () => {
  const settings = { ...ALERT_DEFAULTS, paymentReviewHours: 2, approvalIssuanceHours: 2, circularLeadDays: 2, missingTravelDocsLeadDays: 5, unassignedHours: 1 };

  test("rules: each condition alerts with its own occurrence key; closed requests never alert", () => {
    const now = new Date("2026-11-10T10:00:00Z");
    const base = { id: "r1", name: "س", status: "NEW", createdAt: new Date(now.getTime() - 3 * HOUR), assignedUserId: null, visaType: { code: "VISA-EGYPT-CLEARANCE-AIR" }, travelers: [{ id: "t" }], deliverables: [], linkedRequests: [], intakeData: { egyptRoute: { entryMode: "AIR" } } };
    const receipt = { id: "d1", classification: "FINANCIAL_DOCUMENT", status: "PENDING", createdAt: new Date(now.getTime() - 3 * HOUR) };
    const kinds = (request) => dueOperationalAlerts(request, settings, now).map((a) => `${a.kind}|${a.cycleKey}`).sort();
    assert.deepEqual(kinds({ ...base, paymentStatus: "UNDER_REVIEW", documents: [receipt] }), ["PAYMENT_REVIEW_OVERDUE|receipt:d1", "UNASSIGNED|unassigned"]);
    assert.deepEqual(kinds({ ...base, assignedUserId: "u", paymentStatus: "UNDER_REVIEW", documents: [{ ...receipt, createdAt: now }] }), [], "a fresh receipt is not overdue");
    const paidAt = new Date(now.getTime() - 5 * HOUR);
    assert.deepEqual(kinds({ ...base, assignedUserId: "u", paymentStatus: "CONFIRMED", paymentConfirmedAt: paidAt, documents: [] }), [`APPROVAL_OVERDUE|paid:${paidAt.toISOString()}`]);
    const soon = { ...base, assignedUserId: "u", paymentStatus: "CONFIRMED", paymentConfirmedAt: now, documents: [], travelEntryDate: new Date("2026-11-11T00:00:00Z") };
    assert.deepEqual(kinds(soon), ["CIRCULAR_DUE|travel:2026-11-11", "TRAVEL_DOCS_MISSING|travel:2026-11-11"], "circular and ticket missing a day before travel");
    assert.deepEqual(kinds({ ...soon, status: "CLOSED" }), []);
    assert.deepEqual(kinds({ ...soon, travelEntryDate: new Date("2026-11-09T00:00:00Z") }), [], "a past date does not alert");
  });

  test("a due alert is raised once with staff notifications linked to the request; a new travel date alerts again", async () => {
    const receiptAt = new Date(Date.now() - 30 * 24 * HOUR);
    const request = await egyptRequest({
      paymentStatus: "UNDER_REVIEW",
      createdAt: receiptAt,
      travelEntryDate: new Date(`${isoDay(1)}T00:00:00.000Z`),
      documents: { create: [{ label: "إشعار الدفع", classification: "FINANCIAL_DOCUMENT", fileName: "r.pdf", storagePath: "contact-request-documents/none.pdf", mimeType: "application/pdf", sizeBytes: 10, createdAt: receiptAt }] },
    });
    const run = () => processOperationalAlerts();
    await run();
    const first = await alertsFor(request.id);
    const kinds = first.map((a) => a.kind).sort();
    for (const kind of [ALERT_KINDS.PAYMENT_REVIEW_OVERDUE, ALERT_KINDS.CIRCULAR_DUE, ALERT_KINDS.TRAVEL_DOCS_MISSING, ALERT_KINDS.UNASSIGNED]) {
      assert.ok(kinds.includes(kind), `${kind} raised: ${kinds}`);
    }
    const notices = await prisma.notification.findMany({ where: { contactRequestId: request.id, userId: adminUser.id, type: { startsWith: "EGYPT_ALERT_" } } });
    assert.equal(notices.length, first.length, "one notification per alert for this administrator");
    assert.ok(notices.every((n) => n.message.includes(request.id)));

    await run();
    await Promise.all([run(), run()]);
    assert.equal((await alertsFor(request.id)).length, first.length, "never twice for the same occurrence, also concurrently");
    assert.equal(await prisma.notification.count({ where: { contactRequestId: request.id, userId: adminUser.id, type: { startsWith: "EGYPT_ALERT_" } } }), first.length);

    const newDate = isoDay(2);
    await prisma.contactRequest.update({ where: { id: request.id }, data: { travelEntryDate: new Date(`${newDate}T00:00:00.000Z`) } });
    await run();
    const circular = (await alertsFor(request.id)).filter((a) => a.kind === ALERT_KINDS.CIRCULAR_DUE).map((a) => a.cycleKey);
    assert.ok(circular.includes(`travel:${newDate}`), "the new date is a new occurrence");
  });

  test("the condition is checked again before alerting: an assigned, confirmed request raises nothing new", async () => {
    const request = await egyptRequest({ createdAt: new Date(Date.now() - 30 * 24 * HOUR), assignedUserId: adminUser.id, paymentStatus: "AWAITING_TRANSFER" });
    await processOperationalAlerts();
    assert.deepEqual(await alertsFor(request.id), []);
  });
});

describe("case priority", () => {
  test("staff set priority and due date; invalid values are refused; audited; other organizations cannot", async () => {
    const request = await egyptRequest();
    const set = await employee.patch(`/api/contact-requests/${request.id}/priority`).send({ priority: "URGENT", dueAt: isoDay(3) });
    assert.equal(set.status, 200, JSON.stringify(set.body));
    assert.equal(set.body.data.priority, "URGENT");
    assert.ok(set.body.data.dueAt);
    assert.equal((await employee.patch(`/api/contact-requests/${request.id}/priority`).send({ priority: "TOP" })).status, 400);
    assert.equal((await employee.patch(`/api/contact-requests/${request.id}/priority`).send({})).status, 400);
    const cleared = await employee.patch(`/api/contact-requests/${request.id}/priority`).send({ dueAt: null });
    assert.equal(cleared.body.data.dueAt, null);
    const audit = await prisma.activityLog.findFirst({ where: { entityId: request.id, action: "CONTACT_REQUEST_PRIORITY_UPDATED" }, orderBy: { createdAt: "desc" } });
    assert.ok(audit);
    const { createOrganization } = await import("./helpers/staff.js");
    const other = staffClient(await createStaffUser({ role: "ADMIN", organizationId: (await createOrganization("ops")).id }));
    assert.equal((await other.patch(`/api/contact-requests/${request.id}/priority`).send({ priority: "LOW" })).status, 404);
  });
});
