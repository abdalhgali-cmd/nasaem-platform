import "./env.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import prisma from "../src/config/database.js";
import { createOrganization, createStaffUser, staffClient } from "./helpers/staff.js";
import { PDF, testPhone, trackingClient } from "./helpers/workflow.js";
import { normalizePhone } from "../src/utils/phone.js";
import { resolveStoredUploadPath } from "../src/config/uploadRoot.js";
import { processDueTravelReminders, reconcileTravelSchedules } from "../src/modules/egypt-clearance/travel-reminders.service.js";
import { todayInKhartoum } from "../src/modules/egypt-clearance/egypt-approval-rules.js";

// Egypt security approval after payment: typed, versioned files (approval,
// circular PDF, tickets), the canonical travel date with its staff
// reminders, and what the customer sees. Fixtures are created directly in
// the disposable test database (TEST-EGA); no real customer, document or
// price is involved.

const PNG = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
let employee;
let accountant;
let otherOrgEmployee;
let airVisa;
const created = [];

function addDays(days) {
  const [y, m, d] = todayInKhartoum().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

async function paidEgyptRequest({ travelers = 1, organizationId = "org_nasaem_default", entryDate = null, paymentStatus = "CONFIRMED" } = {}) {
  const phone = testPhone();
  const request = await prisma.contactRequest.create({
    data: {
      name: "TEST-EGA عميل",
      phone,
      phoneNormalized: normalizePhone(phone),
      email: "test-ega@example.test",
      message: "TEST-EGA",
      organizationId,
      visaTypeId: airVisa.id,
      requestKind: "SERVICE_APPLICATION",
      pricingMode: "FIXED",
      paymentStatus,
      paymentConfirmedAt: paymentStatus === "CONFIRMED" ? new Date() : null,
      intakeData: { egyptRoute: { entryMode: "AIR", departureCity: "بورتسودان", arrivalAirport: "القاهرة" }, ...(entryDate ? { egyptTravel: { entryMode: "AIR", bookingStatus: "EXISTING", entryDate } } : {}) },
      travelEntryDate: entryDate ? new Date(`${entryDate}T00:00:00.000Z`) : null,
      travelers: { create: Array.from({ length: travelers }, (_, index) => ({ fullName: `TEST-EGA مسافر ${index + 1}`, sortOrder: index, isPrimary: index === 0 })) },
      invoice: { create: { amount: 120, currency: "USD", status: "APPROVED" } },
    },
    include: { travelers: true },
  });
  created.push(request.id);
  return { ...request, phone, tracking: trackingClient(phone) };
}

function issueApproval(staff, id, { issuedOn = addDays(0), travelerIds, file = PDF(), filename = "approval.pdf", contentType = "application/pdf" } = {}) {
  let req = staff.post(`/api/contact-requests/${id}/egypt/approval`).field("issuedOn", issuedOn);
  if (travelerIds) req = req.field("travelerIds", JSON.stringify(travelerIds));
  return req.attach("file", file, { filename, contentType });
}

before(async () => {
  employee = staffClient(await createStaffUser({ role: "EMPLOYEE" }));
  accountant = staffClient(await createStaffUser({ role: "ACCOUNTANT" }));
  const otherOrg = await createOrganization("egypt-other");
  otherOrgEmployee = staffClient(await createStaffUser({ role: "EMPLOYEE", organizationId: otherOrg.id }));
  airVisa = await prisma.visaType.findUnique({ where: { code: "VISA-EGYPT-CLEARANCE-AIR" } });
  assert.ok(airVisa, "seeded variant");
});

after(async () => {
  await prisma.contactRequest.deleteMany({ where: { id: { in: created } } });
});

describe("Egypt approval issuance", () => {
  test("staff issue the approval with a date: typed APPROVAL file, execution recorded, customer sees it and can download it", async () => {
    const req = await paidEgyptRequest();
    let mine = await req.tracking.request(req.id);
    assert.equal(mine.egypt.approval.issued, false);
    assert.equal(mine.egypt.timeline.find((s) => s.key === "APPROVAL_IN_PROGRESS").state, "current");

    const res = await issueApproval(employee, req.id, { issuedOn: addDays(-1) });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.kind, "APPROVAL");
    assert.equal(res.body.data.version, 1);
    const stored = await prisma.contactRequest.findUnique({ where: { id: req.id } });
    assert.ok(stored.executionStartedAt, "issuing the approval records the execution");

    mine = await req.tracking.request(req.id);
    assert.equal(mine.egypt.approval.issued, true);
    assert.equal(mine.egypt.approval.issuedOn, addDays(-1));
    assert.deepEqual(mine.egypt.timeline.slice(0, 4).map((s) => s.state), ["done", "done", "done", "done"]);
    assert.equal(mine.egypt.timeline.find((s) => s.key === "TRAVEL_PREPARATION").state, "current", "date and ticket still missing");
    assert.ok(mine.egypt.travel.missing.some((m) => m.code === "TRAVEL_DATE_MISSING"));
    assert.equal(mine.status, "NEW", "an Egypt request is never completed by the approval alone");

    const file = await req.tracking.get(`/api/tracking/requests/${req.id}/deliverables/${res.body.data.id}/file`);
    assert.equal(file.status, 200);
    const other = trackingClient(testPhone());
    assert.equal((await other.get(`/api/tracking/requests/${req.id}/deliverables/${res.body.data.id}/file`)).status, 404, "another phone cannot download it");
    const actions = (await prisma.activityLog.findMany({ where: { entityId: req.id } })).map((row) => row.action);
    assert.ok(actions.includes("EGYPT_APPROVAL_ISSUED"));
  });

  test("a newer approval supersedes the old one; the customer sees only the current version", async () => {
    const req = await paidEgyptRequest();
    const first = await issueApproval(employee, req.id);
    const second = await issueApproval(employee, req.id, { file: PNG(), filename: "approval.png", contentType: "image/png" });
    assert.equal(second.status, 201, JSON.stringify(second.body));
    assert.equal(second.body.data.version, 2);
    const old = await prisma.contactRequestDeliverable.findUnique({ where: { id: first.body.data.id } });
    assert.ok(old.supersededAt);
    const mine = await req.tracking.request(req.id);
    assert.deepEqual(mine.egypt.approval.files.map((f) => f.id), [second.body.data.id]);
    assert.ok(!mine.deliverables.some((d) => d.id === first.body.data.id));
    assert.equal((await req.tracking.get(`/api/tracking/requests/${req.id}/deliverables/${first.body.data.id}/file`)).status, 404, "a superseded version is not downloadable by the customer");
  });

  test("several travelers: the approval is issued only when every traveler is covered", async () => {
    const req = await paidEgyptRequest({ travelers: 2 });
    assert.equal((await issueApproval(employee, req.id)).status, 400, "coverage is required");
    await issueApproval(employee, req.id, { travelerIds: [req.travelers[0].id] });
    let mine = await req.tracking.request(req.id);
    assert.equal(mine.egypt.approval.issued, false);
    assert.deepEqual(mine.egypt.approval.missingTravelerIds, [req.travelers[1].id]);
    await issueApproval(employee, req.id, { travelerIds: [req.travelers[1].id] });
    mine = await req.tracking.request(req.id);
    assert.equal(mine.egypt.approval.issued, true);
    // Replacing both is fine; replacing one traveler of a joint file is refused.
    const joint = await issueApproval(employee, req.id, { travelerIds: req.travelers.map((t) => t.id) });
    assert.equal(joint.status, 201, JSON.stringify(joint.body));
    const partial = await issueApproval(employee, req.id, { travelerIds: [req.travelers[0].id] });
    assert.equal(partial.body.code, "APPROVAL_PARTIAL_OVERLAP");
  });

  test("refused before payment, for a future issue date, outside the organization, and for accountants", async () => {
    const unpaid = await paidEgyptRequest({ paymentStatus: "UNDER_REVIEW" });
    const before = await issueApproval(employee, unpaid.id);
    assert.equal(before.status, 409);
    assert.equal(before.body.code, "NOT_RELEASABLE");
    const paid = await paidEgyptRequest();
    assert.equal((await issueApproval(employee, paid.id, { issuedOn: addDays(2) })).body.code, "INVALID_ISSUE_DATE");
    assert.equal((await issueApproval(otherOrgEmployee, paid.id)).status, 404);
    assert.equal((await issueApproval(accountant, paid.id)).status, 403);
    assert.equal(await prisma.contactRequestDeliverable.count({ where: { contactRequestId: { in: [unpaid.id, paid.id] } } }), 0, "nothing was stored");
  });

  test("an unsupported file type is refused by content, not by its name", async () => {
    const req = await paidEgyptRequest();
    const res = await issueApproval(employee, req.id, { file: Buffer.from("not really a pdf"), filename: "approval.pdf" });
    assert.equal(res.status, 400);
    assert.equal(await prisma.contactRequestDeliverable.count({ where: { contactRequestId: req.id } }), 0);
  });
});

describe("Egypt circular and tickets", () => {
  test("circular: needs the approval, PDF only, processing then issued; the customer downloads it", async () => {
    const req = await paidEgyptRequest({ entryDate: addDays(10) });
    const early = await employee.post(`/api/contact-requests/${req.id}/egypt/circular/processing`).send({});
    assert.equal(early.body.code, "APPROVAL_NOT_ISSUED");
    await issueApproval(employee, req.id);
    const incomplete = await employee.post(`/api/contact-requests/${req.id}/egypt/circular/processing`).send({});
    assert.equal(incomplete.body.code, "TRAVEL_PREPARATION_INCOMPLETE", "air needs the ticket before the circular");
    await employee.post(`/api/contact-requests/${req.id}/egypt/tickets`).attach("file", PDF(), { filename: "ticket.pdf", contentType: "application/pdf" });
    assert.equal((await employee.post(`/api/contact-requests/${req.id}/egypt/circular/processing`).send({})).status, 200);
    let mine = await req.tracking.request(req.id);
    assert.equal(mine.egypt.circular.status, "PROCESSING");

    const image = await employee.post(`/api/contact-requests/${req.id}/egypt/circular`).attach("file", PNG(), { filename: "c.png", contentType: "image/png" });
    assert.equal(image.body.code, "CIRCULAR_PDF_ONLY");
    const pdf = await employee.post(`/api/contact-requests/${req.id}/egypt/circular`).attach("file", PDF(), { filename: "circular.pdf", contentType: "application/pdf" });
    assert.equal(pdf.status, 201, JSON.stringify(pdf.body));
    assert.equal(pdf.body.data.kind, "CIRCULAR");
    mine = await req.tracking.request(req.id);
    assert.equal(mine.egypt.circular.status, "ISSUED");
    assert.equal(mine.egypt.timeline.find((s) => s.key === "CIRCULAR_ISSUED").state, "done");
    assert.equal(mine.egypt.approval.issued, true, "the circular never replaces the approval");
    assert.equal((await req.tracking.get(`/api/tracking/requests/${req.id}/deliverables/${pdf.body.data.id}/file`)).status, 200);
    // Re-issuing the approval withdraws the circular issued on the old one.
    await issueApproval(employee, req.id);
    mine = await req.tracking.request(req.id);
    assert.equal(mine.egypt.circular.status, "PROCESSING", "the old circular no longer matches");
    assert.equal((await req.tracking.get(`/api/tracking/requests/${req.id}/deliverables/${pdf.body.data.id}/file`)).status, 404);
    const again = await employee.post(`/api/contact-requests/${req.id}/egypt/circular`).attach("file", PDF(), { filename: "circular2.pdf", contentType: "application/pdf" });
    assert.equal(again.body.data.version, 2);
    // After the circular, the customer can no longer move the date.
    const move = await req.tracking.post(`/api/tracking/requests/${req.id}/egypt-travel-plan`).field("bookingStatus", "NEEDS_NASAEM").field("entryDate", addDays(12));
    assert.equal(move.status, 409);
  });

  test("a staff-attached ticket completes the air preparation and is not an approval", async () => {
    const req = await paidEgyptRequest({ entryDate: addDays(10) });
    const ticket = await employee.post(`/api/contact-requests/${req.id}/egypt/tickets`).attach("file", PDF(), { filename: "ticket.pdf", contentType: "application/pdf" });
    assert.equal(ticket.status, 201, JSON.stringify(ticket.body));
    let mine = await req.tracking.request(req.id);
    assert.equal(mine.egypt.approval.issued, false, "a ticket is not the approval");
    assert.ok(mine.egypt.tickets.some((t) => t.deliverableId === ticket.body.data.id && t.source === "STAFF"));
    await issueApproval(employee, req.id);
    mine = await req.tracking.request(req.id);
    assert.equal(mine.egypt.travel.preparationComplete, true);
    assert.equal(mine.egypt.timeline.find((s) => s.key === "TRAVEL_PREPARATION").state, "done");
  });
});

describe("Egypt travel date and reminders", () => {
  test("staff edit the date with a reason: canonical column, audit, reminder rescheduled and the old one superseded", async () => {
    const req = await paidEgyptRequest();
    const missingReason = await employee.patch(`/api/contact-requests/${req.id}/egypt/travel-date`).send({ entryDate: addDays(20) });
    assert.equal(missingReason.status, 400);
    assert.equal((await employee.patch(`/api/contact-requests/${req.id}/egypt/travel-date`).send({ entryDate: addDays(20), reason: "طلب العميل هاتفيًا" })).status, 200);
    let stored = await prisma.contactRequest.findUnique({ where: { id: req.id }, include: { travelReminders: true } });
    assert.equal(stored.travelEntryDate.toISOString().slice(0, 10), addDays(20));
    assert.equal(stored.intakeData.egyptTravel.entryDate, addDays(20), "kept equal for older clients");
    assert.equal(stored.travelReminders.length, 1);
    assert.equal(stored.travelReminders[0].kind, "THREE_DAY");
    assert.equal(stored.travelReminders[0].status, "SCHEDULED");

    assert.equal((await employee.patch(`/api/contact-requests/${req.id}/egypt/travel-date`).send({ entryDate: addDays(25), reason: "تغيير الرحلة" })).status, 200);
    stored = await prisma.contactRequest.findUnique({ where: { id: req.id }, include: { travelReminders: { orderBy: { createdAt: "asc" } } } });
    assert.deepEqual(stored.travelReminders.map((r) => r.status), ["SUPERSEDED", "SCHEDULED"]);
    assert.equal(stored.travelScheduleRevision, 2);
    const audit = await prisma.activityLog.findFirst({ where: { entityId: req.id, action: "EGYPT_TRAVEL_DATE_CHANGED" }, orderBy: { createdAt: "desc" } });
    assert.equal(audit.oldValue.travelDate, addDays(20));
    assert.equal(audit.newValue.travelDate, addDays(25));
    assert.equal(audit.newValue.reason, "تغيير الرحلة");
  });

  test("fewer than three days away: URGENT at once, sent once to staff, never twice", async () => {
    const req = await paidEgyptRequest();
    await employee.patch(`/api/contact-requests/${req.id}/egypt/travel-date`).send({ entryDate: addDays(1), reason: "سفر عاجل" });
    const reminder = await prisma.travelReminder.findFirst({ where: { contactRequestId: req.id } });
    assert.equal(reminder.kind, "URGENT");
    const [a, b] = await Promise.all([processDueTravelReminders(), processDueTravelReminders()]);
    assert.ok((a.outcomes.SENT || 0) + (b.outcomes.SENT || 0) >= 1);
    const notifications = await prisma.notification.findMany({ where: { contactRequestId: req.id, type: "EGYPT_TRAVEL_REMINDER_URGENT" } });
    const perUser = new Map();
    for (const n of notifications) perUser.set(n.userId, (perUser.get(n.userId) || 0) + 1);
    assert.ok(perUser.size > 0, "staff were notified");
    assert.ok([...perUser.values()].every((count) => count === 1), "each staff member once");
    // Same date again (no change): nothing new is scheduled.
    await employee.patch(`/api/contact-requests/${req.id}/egypt/travel-date`).send({ entryDate: addDays(1), reason: "تأكيد" });
    await processDueTravelReminders();
    assert.equal(await prisma.notification.count({ where: { contactRequestId: req.id, type: "EGYPT_TRAVEL_REMINDER_URGENT" } }), notifications.length);
  });

  test("a cancelled request gets no reminder", async () => {
    const req = await paidEgyptRequest();
    await employee.patch(`/api/contact-requests/${req.id}/egypt/travel-date`).send({ entryDate: addDays(2), reason: "سفر" });
    const closed = await employee.patch(`/api/contact-requests/${req.id}/status`).send({ status: "CLOSED", outcome: "CANCELLED", outcomeNote: "TEST-EGA ألغى العميل" });
    assert.equal(closed.status, 200, JSON.stringify(closed.body));
    const reminder = await prisma.travelReminder.findFirst({ where: { contactRequestId: req.id } });
    assert.equal(reminder.status, "CANCELLED");
    await processDueTravelReminders();
    assert.equal(await prisma.notification.count({ where: { contactRequestId: req.id, type: { startsWith: "EGYPT_TRAVEL_REMINDER" } } }), 0);
  });

  test("a reminder computed for an older date is never sent (stale revision)", async () => {
    const req = await paidEgyptRequest();
    await employee.patch(`/api/contact-requests/${req.id}/egypt/travel-date`).send({ entryDate: addDays(1), reason: "سفر" });
    // Simulate a date written by another path without its reminder resync.
    await prisma.contactRequest.update({ where: { id: req.id }, data: { travelEntryDate: new Date(`${addDays(30)}T00:00:00.000Z`), travelScheduleRevision: { increment: 1 } } });
    await processDueTravelReminders();
    const reminder = await prisma.travelReminder.findFirst({ where: { contactRequestId: req.id } });
    assert.equal(reminder.status, "SUPERSEDED");
    assert.equal(await prisma.notification.count({ where: { contactRequestId: req.id, type: { startsWith: "EGYPT_TRAVEL_REMINDER" } } }), 0);
  });
});

test("dates stored before reminders existed are scheduled by the reconciler", async () => {
  const req = await paidEgyptRequest({ entryDate: addDays(9) });
  assert.equal(await prisma.travelReminder.count({ where: { contactRequestId: req.id } }), 0);
  await reconcileTravelSchedules();
  const reminder = await prisma.travelReminder.findFirst({ where: { contactRequestId: req.id } });
  assert.equal(reminder.kind, "THREE_DAY");
  await reconcileTravelSchedules();
  assert.equal(await prisma.travelReminder.count({ where: { contactRequestId: req.id } }), 1, "idempotent");
});

describe("Egypt staff queue", () => {
  test("queue and schedule: stages, nearest date first, imminent/missing flags; organization-scoped", async () => {
    const soon = await paidEgyptRequest({ entryDate: addDays(2) });
    const later = await paidEgyptRequest({ entryDate: addDays(15) });
    const dateless = await paidEgyptRequest();
    const res = await employee.get("/api/contact-requests/egypt/queue?view=schedule");
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const ids = res.body.data.rows.map((row) => row.id);
    assert.ok(ids.indexOf(soon.id) < ids.indexOf(later.id));
    assert.ok(ids.indexOf(later.id) < ids.indexOf(dateless.id), "dateless last");
    const soonRow = res.body.data.rows.find((row) => row.id === soon.id);
    assert.equal(soonRow.imminent, true);
    assert.equal(soonRow.stage, "APPROVAL_IN_PROGRESS");
    assert.equal(res.body.data.rows.find((row) => row.id === dateless.id).missingDate, true);
    const other = await otherOrgEmployee.get("/api/contact-requests/egypt/queue");
    assert.ok(!other.body.data.rows.some((row) => created.includes(row.id)), "another organization sees none of them");
    const workspace = await employee.get(`/api/contact-requests/${soon.id}/egypt`);
    assert.equal(workspace.status, 200);
    assert.equal(workspace.body.data.travelDate, addDays(2));
    assert.equal((await otherOrgEmployee.get(`/api/contact-requests/${soon.id}/egypt`)).status, 404);
  });
});

test("stored approval files exist on disk at the recorded path", async () => {
  const rows = await prisma.contactRequestDeliverable.findMany({ where: { contactRequestId: { in: created }, kind: "APPROVAL" } });
  assert.ok(rows.length > 0);
  for (const row of rows) assert.ok(fs.existsSync(resolveStoredUploadPath(row.storagePath)), row.storagePath);
});
