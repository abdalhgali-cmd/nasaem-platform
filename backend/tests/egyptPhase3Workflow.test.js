import "./env.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";
import { PDF, testPhone, trackingClient } from "./helpers/workflow.js";
import { normalizePhone } from "../src/utils/phone.js";
import { todayInKhartoum } from "../src/modules/egypt-clearance/egypt-approval-rules.js";

// Phase 3: the circular's issue date and its own «جاري إصدار التعميم»
// stage, flight details (customer entry, staff verification), and the
// travel schedule (entry point, priority, assignee filters). Fixtures
// (TEST-EP3) live in the disposable test database only.

let employee;
let employeeUser;
let admin;
let airVisa;
let borderVisa;
const created = [];

function addDays(days) {
  const [y, m, d] = todayInKhartoum().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

async function paidRequest({ visa = airVisa, entryDate = null, route = { entryMode: "AIR", departureCity: "بورتسودان", arrivalAirport: "مطار القاهرة الدولي" }, data = {} } = {}) {
  const phone = testPhone();
  const request = await prisma.contactRequest.create({
    data: {
      name: "TEST-EP3 عميل",
      phone,
      phoneNormalized: normalizePhone(phone),
      message: "TEST-EP3",
      visaTypeId: visa.id,
      requestKind: "SERVICE_APPLICATION",
      pricingMode: "FIXED",
      paymentStatus: "CONFIRMED",
      paymentConfirmedAt: new Date(),
      intakeData: { egyptRoute: route, ...(entryDate ? { egyptTravel: { entryMode: route.entryMode, bookingStatus: "EXISTING", entryDate } } : {}) },
      travelEntryDate: entryDate ? new Date(`${entryDate}T00:00:00.000Z`) : null,
      travelers: { create: [{ fullName: "TEST-EP3 مسافر", sortOrder: 0, isPrimary: true }] },
      invoice: { create: { amount: 85, currency: "USD", status: "APPROVED" } },
      ...data,
    },
  });
  created.push(request.id);
  return { ...request, phone, tracking: trackingClient(phone) };
}

const issueApproval = (id) => employee.post(`/api/contact-requests/${id}/egypt/approval`).field("issuedOn", addDays(0)).attach("file", PDF(), { filename: "approval.pdf", contentType: "application/pdf" });

before(async () => {
  employeeUser = await createStaffUser({ role: "EMPLOYEE" });
  employee = staffClient(employeeUser);
  admin = staffClient(await createStaffUser({ role: "ADMIN" }));
  airVisa = await prisma.visaType.findUnique({ where: { code: "VISA-EGYPT-CLEARANCE-AIR" } });
  borderVisa = await prisma.visaType.findUnique({ where: { code: "VISA-EGYPT-CLEARANCE-BORDER" } });
});

after(async () => {
  await prisma.contactRequest.deleteMany({ where: { id: { in: created } } });
});

describe("circular stage and issue date", () => {
  test("travel ready → «جاري إصدار التعميم» is current; the circular records its issue date (never in the future) and the customer sees it", async () => {
    const req = await paidRequest({ entryDate: addDays(10) });
    assert.equal((await issueApproval(req.id)).status, 201);
    await employee.post(`/api/contact-requests/${req.id}/egypt/tickets`).attach("file", PDF(), { filename: "ticket.pdf", contentType: "application/pdf" });
    let mine = await req.tracking.request(req.id);
    const current = mine.egypt.timeline.find((s) => s.state === "current");
    assert.equal(current.key, "CIRCULAR_IN_PROGRESS");
    assert.equal(current.label, "جاري إصدار التعميم");

    const future = await employee.post(`/api/contact-requests/${req.id}/egypt/circular`).field("issuedOn", addDays(3)).attach("file", PDF(), { filename: "c.pdf", contentType: "application/pdf" });
    assert.equal(future.status, 400);
    assert.equal(future.body.code, "INVALID_ISSUE_DATE");
    const issuedOn = addDays(-1);
    const ok = await employee.post(`/api/contact-requests/${req.id}/egypt/circular`).field("issuedOn", issuedOn).attach("file", PDF(), { filename: "c.pdf", contentType: "application/pdf" });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    mine = await req.tracking.request(req.id);
    assert.equal(mine.egypt.circular.status, "ISSUED");
    assert.equal(mine.egypt.circular.issuedOn, issuedOn);
    assert.equal(mine.egypt.circular.files[0].issuedOn, issuedOn);
    assert.ok(mine.egypt.timeline.every((s) => s.state === "done"));
    const audit = await prisma.activityLog.findFirst({ where: { entityId: req.id, action: "EGYPT_CIRCULAR_ISSUED" } });
    assert.equal(audit.newValue.issuedOn, issuedOn);

    // A new version supersedes the old one; only the current one is offered.
    const again = await employee.post(`/api/contact-requests/${req.id}/egypt/circular`).attach("file", PDF(), { filename: "c2.pdf", contentType: "application/pdf" });
    assert.equal(again.status, 201);
    mine = await req.tracking.request(req.id);
    assert.equal(mine.egypt.circular.files.length, 1);
    assert.equal(mine.egypt.circular.files[0].version, 2);
    assert.equal(mine.egypt.circular.issuedOn, addDays(0), "defaults to today");
  });
});

describe("flight details", () => {
  test("the customer adds flight details with the ticket; staff verify or correct them, audited; a customer edit needs verifying again", async () => {
    const req = await paidRequest();
    const save = (fields) => {
      let r = req.tracking.post(`/api/tracking/requests/${req.id}/egypt-travel-plan`).field("bookingStatus", "EXISTING").field("entryDate", addDays(12));
      for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
      return r.attach("file", PDF(), { filename: "ticket.pdf", contentType: "application/pdf" });
    };
    const bad = await save({ flightNumber: "!!", departureTime: "25:00" });
    assert.equal(bad.status, 400, "invalid flight number and time refused");
    const saved = await save({ flightNumber: "sd 345", airline: "سودانير", departureTime: "08:30", arrivalTime: "10:45" });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    let mine = await req.tracking.request(req.id);
    assert.deepEqual(
      [mine.egypt.flight.details.flightNumber, mine.egypt.flight.details.airline, mine.egypt.flight.details.departureTime, mine.egypt.flight.details.verified],
      ["SD 345", "سودانير", "08:30", false]
    );
    assert.equal("verifiedByUserId" in mine.egypt.flight.details, false, "staff ids are not shown to the customer");

    const verified = await employee.patch(`/api/contact-requests/${req.id}/egypt/flight-details`).send({ arrivalTime: "11:05", verified: true, reason: "مطابقة التذكرة" });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.data.flightDetails.arrivalTime, "11:05");
    assert.equal(verified.body.data.flightDetails.source, "STAFF");
    assert.equal(verified.body.data.flightDetails.verifiedByUserId, employeeUser.id);
    mine = await req.tracking.request(req.id);
    assert.equal(mine.egypt.flight.details.verified, true);
    const audit = await prisma.activityLog.findFirst({ where: { entityId: req.id, action: "EGYPT_FLIGHT_DETAILS_VERIFIED" } });
    assert.equal(audit.oldValue.flightDetails.arrivalTime, "10:45");
    assert.equal(audit.newValue.reason, "مطابقة التذكرة");

    assert.equal((await save({ flightNumber: "MS 852" })).status, 200);
    mine = await req.tracking.request(req.id);
    assert.equal(mine.egypt.flight.details.flightNumber, "MS 852");
    assert.equal(mine.egypt.flight.details.verified, false, "changed by the customer: to be verified again");
    assert.equal((await employee.patch(`/api/contact-requests/${req.id}/egypt/flight-details`).send({ verified: true, extra: 1 })).status, 400);
  });

  test("staff can clear a field; a flight correction after the circular withdraws it to processing", async () => {
    const req = await paidRequest({ entryDate: addDays(9) });
    assert.equal((await issueApproval(req.id)).status, 201);
    await employee.post(`/api/contact-requests/${req.id}/egypt/tickets`).attach("file", PDF(), { filename: "t.pdf", contentType: "application/pdf" });
    const set = await employee.patch(`/api/contact-requests/${req.id}/egypt/flight-details`).send({ flightNumber: "SD 345", arrivalTime: "10:45", verified: true });
    assert.equal(set.status, 200, JSON.stringify(set.body));
    const cleared = await employee.patch(`/api/contact-requests/${req.id}/egypt/flight-details`).send({ arrivalTime: null, verified: true });
    assert.equal(cleared.body.data.flightDetails.arrivalTime, null, "explicitly cleared");
    assert.equal(cleared.body.data.flightDetails.flightNumber, "SD 345", "omitted fields kept");

    assert.equal((await employee.post(`/api/contact-requests/${req.id}/egypt/circular`).attach("file", PDF(), { filename: "c.pdf", contentType: "application/pdf" })).status, 201);
    const same = await employee.patch(`/api/contact-requests/${req.id}/egypt/flight-details`).send({ verified: true });
    assert.equal(same.body.data.circularWithdrawn, false, "re-verifying the same values keeps the circular");
    const changed = await employee.patch(`/api/contact-requests/${req.id}/egypt/flight-details`).send({ flightNumber: "MS 852", verified: true, reason: "تغيير الرحلة" });
    assert.equal(changed.body.data.circularWithdrawn, true);
    const mine = await req.tracking.request(req.id);
    assert.equal(mine.egypt.circular.status, "PROCESSING");
    assert.equal(mine.egypt.circular.files.length, 0, "the outdated circular is no longer offered");
  });

  test("overland requests have no flight details; the accountant role cannot verify", async () => {
    const req = await paidRequest({ visa: borderVisa, route: { entryMode: "BORDER", entryPort: "أرقين" } });
    const res = await employee.patch(`/api/contact-requests/${req.id}/egypt/flight-details`).send({ flightNumber: "SD 1", verified: true });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "NOT_AIR");
    const accountant = staffClient(await createStaffUser({ role: "ACCOUNTANT" }));
    assert.equal((await accountant.patch(`/api/contact-requests/${req.id}/egypt/flight-details`).send({ verified: true })).status, 403);
  });
});

describe("travel schedule", () => {
  test("entry point, priority order within the same date, assignee and priority filters", async () => {
    const date = addDays(4);
    const normal = await paidRequest({ entryDate: date });
    const urgent = await paidRequest({ entryDate: date, data: { priority: "URGENT" } });
    const border = await paidRequest({ visa: borderVisa, entryDate: addDays(2), route: { entryMode: "BORDER", entryPort: "أشكيت" }, data: { assignedUserId: employeeUser.id } });
    const { body } = await employee.get(`/api/contact-requests/egypt/queue?view=schedule&search=TEST-EP3`);
    const rows = body.data.rows;
    const index = (id) => rows.findIndex((row) => row.id === id);
    assert.ok(index(border.id) < index(urgent.id), "nearest date first");
    assert.ok(index(urgent.id) < index(normal.id), "same date: higher priority first");
    assert.equal(rows[index(border.id)].entryPoint, "أشكيت");
    assert.equal(rows[index(normal.id)].entryPoint, "مطار القاهرة الدولي");
    assert.ok(Number.isInteger(body.data.leadDays));

    const mine = await employee.get(`/api/contact-requests/egypt/queue?view=schedule&assignee=mine&search=TEST-EP3`);
    assert.deepEqual(mine.body.data.rows.map((row) => row.id), [border.id]);
    const unassigned = await employee.get(`/api/contact-requests/egypt/queue?assignee=unassigned&search=TEST-EP3`);
    assert.ok(!unassigned.body.data.rows.some((row) => row.id === border.id));
    const high = await admin.get(`/api/contact-requests/egypt/queue?filter=HIGH_PRIORITY&search=TEST-EP3`);
    assert.ok(high.body.data.rows.some((row) => row.id === urgent.id));
    assert.ok(!high.body.data.rows.some((row) => row.id === normal.id));
    assert.equal((await employee.get(`/api/contact-requests/egypt/queue?assignee=${encodeURIComponent("x y")}`)).status, 400);
  });
});
