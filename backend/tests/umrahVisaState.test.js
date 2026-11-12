// T07: one pilgrim's visa state (pending / in progress / delayed / rejected),
// with reason and follow-up date, audited, behind the execution gate. "Issued"
// stays tied to the published file; a delayed or rejected pilgrim keeps the
// whole request open; nothing is refunded or closed automatically.
import "./env.js";
import "./helpers/journeyLimits.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { withUmrahPassports } from "./helpers/umrah-intake.js";
import { registerCustomer, uniqueSuffix } from "./helpers/api.js";
import { createOrganization, createStaffUser, staffClient } from "./helpers/staff.js";
import { PDF, trackingClient } from "./helpers/workflow.js";
import { request } from "./helpers/api.js";
import { app } from "./helpers/api.js";
import { validateVisaStateInput } from "../src/modules/umrah/umrah-visa-state.js";

const PRICE = 500;
let admin;
let employee;
let accountant;

before(async () => {
  admin = staffClient(await createStaffUser({ role: "ADMIN" }));
  employee = staffClient(await createStaffUser({ role: "EMPLOYEE" }));
  accountant = staffClient(await createStaffUser({ role: "ACCOUNTANT" }));
  const account = await admin.post("/api/payment-accounts").send({ name: `TEST-VS حساب ${uniqueSuffix()}`, bankName: "TEST-VS Bank", accountName: "TEST-VS Holder", accountNumber: `6${uniqueSuffix().slice(-9)}`, currency: "SAR" });
  assert.equal(account.status, 201, JSON.stringify(account.body));
});

async function pkg() {
  const created = await admin.post("/api/services").send({ code: `TEST-VS-${uniqueSuffix()}`, name: "TEST-VS باقة", category: "UMRAH_PACKAGE", basePrice: PRICE, currency: "SAR", active: true, pricingMode: "FIXED", priceUnit: "PER_TRAVELER", features: ["KIND: VISA_ONLY"] });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body.data;
}

async function requestToExecution({ start = true } = {}) {
  const service = await pkg();
  const { agent, customer: owner } = await registerCustomer();
  const res = await withUmrahPassports(agent
    .post("/api/contact-requests")
    .set("X-Requested-With", "XMLHttpRequest")
    .field("name", "TEST-VS مقدم")
    .field("phone", owner.phone)
    .field("service", service.name)
    .field("serviceId", service.id)
    .field("message", "TEST-VS")
    .field("travelerCount", "3")
    .field("travelers", JSON.stringify([1, 2, 3].map((i) => ({ fullName: `المعتمر ${i}`, passportNo: `P3000${i}`, isPrimary: i === 1 }))))
    .field("acceptedTotal", String(PRICE * 3))
    .field("acceptedCurrency", "SAR")
    .field("guarantorPhone", "+966 55 000 2222"), service.id, 3);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const id = res.body.data.id;
  assert.equal((await employee.post(`/api/contact-requests/${id}/claim`).send({})).status, 200);
  const customer = trackingClient(owner.phone);
  // The package asks for the guarantor's residence permit: the customer sends it, staff accept it.
  const checklist = (await request(app).get(`/api/services/${service.id}/requirements/public`)).body.data.filter((r) => r.type === "DOCUMENT" && r.required);
  for (const requirement of checklist.filter(r => r.scope !== "TRAVELER")) {
    const sent = await customer.post(`/api/tracking/requests/${id}/documents`).field("label", requirement.name).field("requirementId", requirement.id).attach("file", PDF(), { filename: "doc.pdf", contentType: "application/pdf" });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
  }
  const detail = (await employee.get(`/api/contact-requests/${id}`)).body.data;
  for (const document of detail.documents.filter((d) => d.status === "PENDING" && d.classification !== "FINANCIAL_DOCUMENT")) {
    assert.equal((await employee.patch(`/api/contact-requests/${id}/documents/${document.id}/status`).send({ status: "ACCEPTED" })).status, 200);
  }
  assert.equal((await customer.post(`/api/tracking/requests/${id}/payment-receipt`).attach("file", PDF(), { filename: "receipt.pdf", contentType: "application/pdf" })).status, 201);
  assert.equal((await accountant.post(`/api/contact-requests/${id}/confirm-payment`).send({})).status, 200);
  if (start) { const started = await employee.post(`/api/contact-requests/${id}/start-execution`).send({}); assert.equal(started.status, 200, JSON.stringify(started.body)); }
  const travelers = await prisma.traveler.findMany({ where: { contactRequestId: id }, orderBy: { sortOrder: "asc" } });
  return { id, customer, travelers };
}

const setState = (client, id, travelerId, body) => client.patch(`/api/contact-requests/${id}/travelers/${travelerId}/visa-state`).send(body);
const journey = async (customer, id) => (await customer.request(id)).progress.umrah;
const publishVisa = (id, travelerId) =>
  employee.post(`/api/contact-requests/${id}/deliverables`).field("label", "تأشيرة").field("travelerIds", JSON.stringify([travelerId])).field("publish", "true").attach("file", PDF(), { filename: "visa.pdf", contentType: "application/pdf" });
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

describe("visa state input rules (pure)", () => {
  test("reason is required for delayed/rejected, a follow-up date for delayed, and unused fields are dropped", () => {
    assert.equal(validateVisaStateInput({ state: "REJECTED" }).error.code, "REASON_REQUIRED");
    assert.equal(validateVisaStateInput({ state: "REJECTED", reason: "abc" }).error.code, "REASON_REQUIRED");
    assert.equal(validateVisaStateInput({ state: "DELAYED", reason: "بانتظار السفارة" }).error.code, "FOLLOW_UP_REQUIRED");
    assert.equal(validateVisaStateInput({ state: "DELAYED", reason: "بانتظار السفارة", followUpAt: "2020-01-01" }).error.code, "FOLLOW_UP_PASSED");
    assert.equal(validateVisaStateInput({ state: "DELAYED", reason: "بانتظار السفارة", followUpAt: "2026-02-30" }).error.code, "FOLLOW_UP_INVALID");
    assert.equal(validateVisaStateInput({ state: "ISSUED" }).error.code, "VALIDATION_ERROR", "issued is not a settable state");
    const ok = validateVisaStateInput({ state: "IN_PROGRESS", reason: "ignored", followUpAt: tomorrow() });
    assert.deepEqual(ok.data, { state: "IN_PROGRESS", reason: null, followUpAt: null });
  });
});

describe("per-pilgrim visa state over HTTP", () => {
  test("not before execution has started, and only for staff of the request's organization", async () => {
    const { id, travelers } = await requestToExecution({ start: false });
    const early = await setState(employee, id, travelers[0].id, { state: "IN_PROGRESS" });
    assert.equal(early.status, 409, JSON.stringify(early.body));
    assert.equal(early.body.code, "EXECUTION_NOT_STARTED");
    assert.equal((await employee.post(`/api/contact-requests/${id}/start-execution`).send({})).status, 200);
    assert.equal((await setState(accountant, id, travelers[0].id, { state: "IN_PROGRESS" })).status, 403, "finance does not set visa states");
    assert.equal((await request(app).patch(`/api/contact-requests/${id}/travelers/${travelers[0].id}/visa-state`).send({ state: "IN_PROGRESS" })).status, 401);
    const otherOrg = staffClient(await createStaffUser({ role: "ADMIN", organizationId: (await createOrganization("vs")).id }));
    assert.equal((await setState(otherOrg, id, travelers[0].id, { state: "IN_PROGRESS" })).status, 404, "another organization cannot see it");
    assert.equal((await setState(employee, id, "no-such-traveler", { state: "IN_PROGRESS" })).status, 404);
  });

  test("delayed and rejected: reason and date stored, audited, shown to the customer; the request stays open", async () => {
    const { id, customer, travelers } = await requestToExecution();
    const [p1, p2, p3] = travelers;
    assert.equal((await setState(employee, id, p2.id, { state: "DELAYED", reason: "بانتظار رد السفارة" })).status, 400, "delayed needs a follow-up date");
    const delayed = await setState(employee, id, p2.id, { state: "DELAYED", reason: "بانتظار رد السفارة", followUpAt: tomorrow() });
    assert.equal(delayed.status, 200, JSON.stringify(delayed.body));
    const rejected = await setState(employee, id, p3.id, { state: "REJECTED", reason: "بيانات الجواز غير مطابقة" });
    assert.equal(rejected.status, 200, JSON.stringify(rejected.body));

    const j = await journey(customer, id);
    assert.deepEqual(j.pilgrims.map((p) => p.visa), ["IN_PROGRESS", "DELAYED", "REJECTED"]);
    assert.equal(j.pilgrims[1].visaReason, "بانتظار رد السفارة");
    assert.equal(String(j.pilgrims[1].visaFollowUpAt).slice(0, 10), tomorrow());
    assert.equal(j.pilgrims[2].visaReason, "بيانات الجواز غير مطابقة");

    const audits = await prisma.activityLog.findMany({ where: { entityId: id, action: "UMRAH_VISA_STATE_CHANGED" } });
    assert.equal(audits.length, 2);
    assert.ok(audits.every((a) => a.userId), "who is recorded");
    const types = (await prisma.notification.findMany({ where: { contactRequestId: id }, select: { type: true } })).map((n) => n.type);
    assert.ok(types.includes("UMRAH_VISA_DELAYED") && types.includes("UMRAH_VISA_REJECTED"));

    // one issued visa never completes the group, and an unresolved pilgrim is named
    assert.equal((await publishVisa(id, p1.id)).status, 201);
    const blocked = await employee.patch(`/api/contact-requests/${id}/status`).send({ status: "CLOSED", outcome: "COMPLETED" });
    const text = JSON.stringify(blocked.body);
    assert.ok(text.includes("VISA_UNRESOLVED") || text.includes("VISAS_INCOMPLETE"), text);
    assert.match(text, /مرفوضة|متأخرة/);
    const row = await prisma.contactRequest.findUnique({ where: { id }, select: { status: true, outcome: true } });
    assert.notEqual(row.status, "CLOSED");
    const invoice = await prisma.invoice.findUnique({ where: { contactRequestId: id } });
    assert.equal(Number(invoice.amount), PRICE * 3, "the price is untouched");
    assert.equal((await prisma.contactRequest.findUnique({ where: { id }, select: { paymentStatus: true } })).paymentStatus, "CONFIRMED", "no refund or payment change happens automatically");
  });

  test("an issued visa is tied to its file: its pilgrim cannot be marked rejected, and a file overrides a delayed state", async () => {
    const { id, customer, travelers } = await requestToExecution();
    const [p1, p2] = travelers;
    assert.equal((await publishVisa(id, p1.id)).status, 201);
    const refused = await setState(employee, id, p1.id, { state: "REJECTED", reason: "خطأ إدخال" });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, "VISA_ALREADY_ISSUED");
    assert.equal((await setState(employee, id, p2.id, { state: "DELAYED", reason: "بانتظار السفارة", followUpAt: tomorrow() })).status, 200);
    assert.equal((await publishVisa(id, p2.id)).status, 201);
    const j = await journey(customer, id);
    assert.equal(j.pilgrims[1].visa, "ISSUED", "the published file decides");
    assert.equal(j.pilgrims[1].visaReason, undefined);
  });

  test("moving back to in progress clears the reason and date; concurrent updates leave one consistent final state", async () => {
    const { id, customer, travelers } = await requestToExecution();
    const [, p2] = travelers;
    assert.equal((await setState(employee, id, p2.id, { state: "REJECTED", reason: "سبب أول" })).status, 200);
    const results = await Promise.all([
      setState(employee, id, p2.id, { state: "DELAYED", reason: "سبب ثان للتأخير", followUpAt: tomorrow() }),
      setState(admin, id, p2.id, { state: "IN_PROGRESS" }),
    ]);
    assert.deepEqual(results.map((r) => r.status), [200, 200]);
    const row = await prisma.traveler.findUnique({ where: { id: p2.id } });
    if (row.visaState === "IN_PROGRESS") assert.ok(row.visaStateReason === null && row.visaFollowUpAt === null);
    else assert.equal(row.visaState, "DELAYED");
    assert.equal(await prisma.activityLog.count({ where: { entityId: id, action: "UMRAH_VISA_STATE_CHANGED" } }), 3, "every accepted change is audited exactly once");
    assert.equal((await setState(employee, id, p2.id, { state: "IN_PROGRESS" })).status, 200);
    const cleared = await prisma.traveler.findUnique({ where: { id: p2.id } });
    assert.equal(cleared.visaStateReason, null);
    assert.equal(cleared.visaFollowUpAt, null);
    const j = await journey(customer, id);
    assert.equal(j.pilgrims[1].visa, "IN_PROGRESS");
  });
});
