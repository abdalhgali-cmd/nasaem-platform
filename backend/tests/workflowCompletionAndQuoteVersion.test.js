import "./env.js";
import "./helpers/journeyLimits.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";
import { PDF, acceptAllDocuments, activityActions, createTestVisa, staffDetail, submitRequest, testPhone, trackingClient, uploadReceipt } from "./helpers/workflow.js";

// Review of 31c25c6: (1) an unpriced service application could be completed
// as if it were an inquiry; (2) a paid, executed, delivered Egypt-clearance
// request could be completed by hand without its travel plan; (3) a customer
// price decision without the quote version skipped the stale-price check.
// Real API, real PostgreSQL.

let admin;
let employee;
let accountant;
let fixture;

before(async () => {
  admin = staffClient(await createStaffUser({ role: "ADMIN" }));
  employee = staffClient(await createStaffUser({ role: "EMPLOYEE" }));
  accountant = staffClient(await createStaffUser({ role: "ACCOUNTANT" }));
  fixture = await createTestVisa(admin);
});

const complete = (client, id) => client.patch(`/api/contact-requests/${id}/status`).send({ status: "CLOSED", outcome: "COMPLETED" });

function assertConflict(res, label) {
  assert.equal(res.status, 409, `${label}: expected 409, got ${res.status} ${JSON.stringify(res.body)}`);
  assert.match(res.body.message || "", /[؀-ۿ]/, `${label}: Arabic message`);
}

describe("inquiries versus service applications", () => {
  test("an unpriced visa application with a missing required document cannot be completed", async () => {
    const phone = testPhone();
    const id = await submitRequest({ phone, ...fixture, travelers: 2, withDocsFor: [0] });
    assert.equal((await staffDetail(employee, id)).requestKind, "SERVICE_APPLICATION");
    const res = await complete(employee, id);
    assertConflict(res, "unpriced application");
    assert.ok(res.body.reasons.some((r) => r.code === "DOCUMENTS_MISSING"), JSON.stringify(res.body));
    assert.ok(!(await staffDetail(employee, id)).allowedActions.includes("COMPLETE"));
  });

  test("an unpriced flight application (configured requirement, nothing uploaded) cannot be completed", async () => {
    const flight = await prisma.service.findUnique({ where: { code: "SVC-FLIGHT" } });
    const added = await admin.post(`/api/services/${flight.id}/requirements`).send({ name: "TEST-WF جواز (اختبار)", type: "DOCUMENT", scope: "TRAVELER", required: true });
    assert.equal(added.status, 201, JSON.stringify(added.body));
    try {
      const created = await request(app).post("/api/contact-requests").send({
        name: "TEST-WF طيران",
        phone: testPhone(),
        service: "تذاكر الطيران",
        serviceId: flight.id,
        message: "TEST-WF طلب طيران",
        travelers: [{ fullName: "TEST-WF مسافر", isPrimary: true }],
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const res = await complete(employee, created.body.data.id);
      assertConflict(res, "unpriced flight");
      assert.ok(res.body.reasons.some((r) => r.code === "DOCUMENTS_MISSING"));
    } finally {
      await admin.delete(`/api/services/requirements/${added.body.data.id}`);
    }
  });

  test("removing or never issuing a quote does not bypass the service workflow", async () => {
    const phone = testPhone();
    const tracking = trackingClient(phone);
    const id = await submitRequest({ phone, ...fixture, travelers: 1 });
    await acceptAllDocuments(employee, id);
    // documents complete, but nothing paid, executed or delivered
    let res = await complete(employee, id);
    assertConflict(res, "no quote at all");
    assert.ok(res.body.reasons.some((r) => r.code === "QUOTE_MISSING" || r.code === "PAYMENT_NOT_CONFIRMED"));
    // a quote issued, rejected by the customer, then removed from the record
    await employee.post(`/api/contact-requests/${id}/invoice`).send({ amount: 90, currency: "USD" });
    const version = (await tracking.request(id)).invoice.version;
    assert.equal((await tracking.post(`/api/tracking/requests/${id}/invoice/reject`).send({ invoiceVersion: version })).status, 200);
    await prisma.invoice.deleteMany({ where: { contactRequestId: id } });
    res = await complete(employee, id);
    assertConflict(res, "quote removed");
  });

  test("a genuine inquiry (contact form, no service) is resolved by closing it as completed", async () => {
    const created = await request(app).post("/api/contact-requests").send({ name: "TEST-WF استفسار", phone: testPhone(), service: "عمرة", message: "TEST-WF كم سعر العمرة؟" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    const detail = await staffDetail(employee, id);
    assert.equal(detail.requestKind, "INQUIRY");
    assert.ok(detail.allowedActions.includes("COMPLETE"));
    assert.equal((await accountant.patch(`/api/contact-requests/${id}/status`).send({ status: "CLOSED", outcome: "COMPLETED" })).status, 403, "only the roles that work requests");
    const res = await complete(employee, id);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.outcome, "COMPLETED");
  });

  test("legacy records (no recorded kind): a service reference means the full workflow; none at all means a legacy inquiry", async () => {
    const legacyApplication = await prisma.contactRequest.create({
      data: { name: "TEST-WF legacy", phone: "0900000000", phoneNormalized: "249900000000", message: "legacy", visaTypeId: fixture.visaType.id, travelerCount: 1, requirementsSnapshot: [{ id: fixture.requirement.id, name: "جواز", required: true, type: "DOCUMENT", scope: "TRAVELER" }] },
    });
    assert.equal(legacyApplication.requestKind, null, "nothing is reclassified");
    const res = await complete(employee, legacyApplication.id);
    assertConflict(res, "legacy application");

    const legacyInquiry = await prisma.contactRequest.create({ data: { name: "TEST-WF legacy inquiry", phone: "0900000001", phoneNormalized: "249900000001", message: "سؤال" } });
    assert.equal((await complete(employee, legacyInquiry.id)).status, 200);
    assert.equal((await prisma.contactRequest.findUnique({ where: { id: legacyInquiry.id } })).requestKind, null, "still not reclassified");
  });
});

describe("Egypt clearance completion needs its travel plan", () => {
  let egypt;
  let entryRequirement;
  let passportRequirement;

  before(async () => {
    egypt = await prisma.visaType.findUnique({ where: { code: "VISA-EGYPT-CLEARANCE" } });
    const requirements = (await request(app).get(`/api/visa-types/${egypt.id}/requirements/public`)).body.data;
    passportRequirement = requirements.find((r) => (r.type || "DOCUMENT") === "DOCUMENT" && r.required);
    entryRequirement = requirements.find((r) => r.type === "SELECT" && r.required);
    assert.ok(passportRequirement && entryRequirement, "seeded Egypt requirements");
  });

  async function deliveredEgyptRequest() {
    const phone = testPhone();
    const tracking = trackingClient(phone);
    const option = entryRequirement.options[0];
    const created = await request(app)
      .post("/api/contact-requests")
      .field("name", "TEST-WF مصر")
      .field("phone", phone)
      .field("message", "TEST-WF موافقة أمنية")
      .field("visaTypeId", egypt.id)
      .field("travelers", JSON.stringify([{ fullName: "TEST-WF مسافر مصر", isPrimary: true }]))
      .field("answers", JSON.stringify({ [entryRequirement.id]: typeof option === "string" ? option : option.value }))
      .field("documentLabels", JSON.stringify(["جواز"]))
      .field("documentRequirementIds", JSON.stringify([passportRequirement.id]))
      .field("documentTravelerIndexes", JSON.stringify(["0"]))
      .attach("documents", PDF(), { filename: "p.pdf", contentType: "application/pdf" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    await acceptAllDocuments(employee, id);
    await employee.post(`/api/contact-requests/${id}/invoice`).send({ amount: 50000, currency: "SDG" });
    const version = (await tracking.request(id)).invoice.version;
    assert.equal((await tracking.post(`/api/tracking/requests/${id}/invoice/approve`).send({ invoiceVersion: version })).status, 200);
    await uploadReceipt(tracking, id);
    assert.equal((await accountant.post(`/api/contact-requests/${id}/confirm-payment`).send({})).status, 200);
    assert.equal((await employee.post(`/api/contact-requests/${id}/start-execution`).send({})).status, 200);
    const published = await employee.post(`/api/contact-requests/${id}/deliverables`).field("label", "TEST-WF الموافقة").field("publish", "true").attach("file", PDF(), { filename: "approval.pdf", contentType: "application/pdf" });
    assert.equal(published.status, 201, JSON.stringify(published.body));
    return { id, tracking };
  }

  const entryDate = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

  test("the published approval alone does not allow closing; the refusal names the travel plan", async () => {
    const { id, tracking } = await deliveredEgyptRequest();
    const detail = await staffDetail(employee, id);
    assert.equal(detail.status, "CONTACTED");
    assert.ok(!detail.allowedActions.includes("COMPLETE"));
    assert.ok(detail.progress.completionBlockers.some((b) => b.code === "TRAVEL_PLAN_MISSING"));
    const res = await complete(employee, id);
    assertConflict(res, "no travel plan");
    assert.ok(res.body.reasons.some((r) => r.code === "TRAVEL_PLAN_MISSING"), JSON.stringify(res.body));
    const customer = await tracking.request(id);
    assert.ok(customer.allowedActions.includes("SAVE_TRAVEL_PLAN"));
    assert.equal(customer.progress.steps.find((s) => s.key === "TRAVEL_PLAN").state, "current");
  });

  test("an existing booking needs its ticket reviewed; a booking the agency must make needs its task done", async () => {
    const existing = await deliveredEgyptRequest();
    const saved = await existing.tracking.post(`/api/tracking/requests/${existing.id}/egypt-travel-plan`).field("entryMode", "AIR").field("bookingStatus", "EXISTING").field("entryDate", entryDate(20)).attach("file", PDF(), { filename: "ticket.pdf", contentType: "application/pdf" });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    let res = await complete(employee, existing.id);
    assertConflict(res, "ticket under review");
    assert.ok(res.body.reasons.some((r) => r.code === "DOCUMENTS_UNDER_REVIEW"));

    const agency = await deliveredEgyptRequest();
    const needs = await agency.tracking.post(`/api/tracking/requests/${agency.id}/egypt-travel-plan`).field("entryMode", "BORDER").field("bookingStatus", "NEEDS_NASAEM").field("entryDate", entryDate(20));
    assert.equal(needs.status, 200, JSON.stringify(needs.body));
    res = await complete(employee, agency.id);
    assertConflict(res, "agency booking open");
    assert.ok(res.body.reasons.some((r) => r.code === "TRAVEL_TASKS_OPEN"), JSON.stringify(res.body));
  });

  test("a complete travel-plan workflow permits completion", async () => {
    const { id, tracking } = await deliveredEgyptRequest();
    const saved = await tracking.post(`/api/tracking/requests/${id}/egypt-travel-plan`).field("entryMode", "AIR").field("bookingStatus", "EXISTING").field("entryDate", entryDate(20)).attach("file", PDF(), { filename: "ticket.pdf", contentType: "application/pdf" });
    assert.equal(saved.status, 200);
    await acceptAllDocuments(employee, id);
    let res = await complete(employee, id);
    assertConflict(res, "circular task open");
    assert.ok(res.body.reasons.some((r) => r.code === "TRAVEL_TASKS_OPEN"));
    for (const task of await prisma.caseTask.findMany({ where: { contactRequestId: id, status: "OPEN", source: "SYSTEM" } })) {
      const done = await employee.patch(`/api/contact-requests/${id}/tasks/${task.id}/complete`).send({});
      assert.equal(done.status, 200, JSON.stringify(done.body));
    }
    // A completed task is not the circular itself (AUDIT-00 G-04).
    res = await complete(employee, id);
    assertConflict(res, "circular not issued");
    assert.deepEqual(res.body.reasons.map((r) => r.code), ["CIRCULAR_NOT_ISSUED"]);
    const circular = await employee.post(`/api/contact-requests/${id}/egypt/circular`).attach("file", PDF(), { filename: "circular.pdf", contentType: "application/pdf" });
    assert.equal(circular.status, 201, JSON.stringify(circular.body));
    const detail = await staffDetail(employee, id);
    assert.deepEqual(detail.progress.completionBlockers, []);
    assert.ok(detail.allowedActions.includes("COMPLETE"));
    res = await complete(employee, id);
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });
});

describe("customer price decisions require the exact quote version", () => {
  async function quoted(amount = 100) {
    const phone = testPhone();
    const tracking = trackingClient(phone);
    const id = await submitRequest({ phone, ...fixture, travelers: 1 });
    assert.equal((await employee.post(`/api/contact-requests/${id}/invoice`).send({ amount, currency: "USD" })).status, 200);
    return { id, tracking };
  }

  async function unchanged(id) {
    const row = await prisma.contactRequest.findUnique({ where: { id }, include: { invoice: true } });
    assert.equal(row.paymentStatus, "NOT_REQUIRED", "payment state untouched");
    assert.equal(row.invoice.status, "PENDING", "quote state untouched");
    assert.equal(await prisma.notification.count({ where: { contactRequestId: id, type: { in: ["CONTACT_REQUEST_INVOICE_APPROVED", "CONTACT_REQUEST_INVOICE_REJECTED"] } } }), 0, "no success notification");
    const actions = await activityActions(id);
    assert.ok(!actions.includes("CONTACT_REQUEST_INVOICE_APPROVED") && !actions.includes("CONTACT_REQUEST_INVOICE_REJECTED"));
  }

  test("missing, malformed and stale versions are refused without any change; the displayed version succeeds", async () => {
    const { id, tracking } = await quoted(100);
    for (const path of ["approve", "reject"]) {
      const missing = await tracking.post(`/api/tracking/requests/${id}/invoice/${path}`).send({});
      assertConflict(missing, `${path} without version`);
      assert.equal(missing.body.code, "QUOTE_VERSION_REQUIRED");
      for (const bad of ["abc", "2026-10-11T10:00:00.000Z", "-1", "1.5", 0]) {
        const malformed = await tracking.post(`/api/tracking/requests/${id}/invoice/${path}`).send({ invoiceVersion: bad });
        assertConflict(malformed, `${path} malformed ${bad}`);
        assert.equal(malformed.body.code, "QUOTE_VERSION_INVALID");
      }
    }
    const seen = (await tracking.request(id)).invoice;
    assert.equal(Number(seen.amount), 100);
    assert.equal((await employee.post(`/api/contact-requests/${id}/invoice`).send({ amount: 175, currency: "USD" })).status, 200);
    const stale = await tracking.post(`/api/tracking/requests/${id}/invoice/approve`).send({ invoiceVersion: seen.version });
    assertConflict(stale, "stale");
    assert.equal(stale.body.code, "QUOTE_CHANGED");
    await unchanged(id);

    const current = (await tracking.request(id)).invoice;
    assert.equal(Number(current.amount), 175);
    const ok = await tracking.post(`/api/tracking/requests/${id}/invoice/approve`).send({ invoiceVersion: current.version });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const row = await prisma.invoice.findUnique({ where: { contactRequestId: id } });
    assert.equal(row.status, "APPROVED");
    assert.equal(Number(row.amount), 175);
  });

  test("every revision changes the version, even several within the same millisecond window", async () => {
    const { id } = await quoted(100);
    const versions = [(await prisma.invoice.findUnique({ where: { contactRequestId: id } })).version];
    for (const amount of [101, 102, 103]) {
      assert.equal((await employee.post(`/api/contact-requests/${id}/invoice`).send({ amount, currency: "USD" })).status, 200);
      versions.push((await prisma.invoice.findUnique({ where: { contactRequestId: id } })).version);
    }
    assert.equal(new Set(versions).size, 4, `versions must all differ: ${versions}`);
    assert.deepEqual(versions, [...versions].sort((a, b) => a - b));
  });

  test("concurrent repricing and approval never approve an amount the customer did not see", async () => {
    for (let round = 0; round < 5; round += 1) {
      const { id, tracking } = await quoted(100);
      const seen = (await tracking.request(id)).invoice;
      const [revise, approve] = await Promise.all([
        employee.post(`/api/contact-requests/${id}/invoice`).send({ amount: 250, currency: "USD" }),
        tracking.post(`/api/tracking/requests/${id}/invoice/approve`).send({ invoiceVersion: seen.version }),
      ]);
      const row = await prisma.invoice.findUnique({ where: { contactRequestId: id } });
      if (approve.status === 200) {
        assert.equal(row.status, "APPROVED");
        assert.equal(Number(row.amount), 100, "the approved amount is the one displayed");
        assert.equal(revise.status, 409, "the later revision cannot change an approved price");
      } else {
        assertConflict(approve, "approval after the revision");
        assert.equal(approve.body.code, "QUOTE_CHANGED");
        assert.equal(row.status, "PENDING");
        assert.equal(Number(row.amount), 250);
        await unchanged(id);
      }
    }
  });
});

after(async () => {
  await prisma.visaType.update({ where: { id: fixture.visaType.id }, data: { active: false } }).catch(() => {});
});
