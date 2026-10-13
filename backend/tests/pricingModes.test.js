import "./env.js";
import "./helpers/journeyLimits.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request, uniqueSuffix } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";
import { PDF, deliverable, staffDetail, testPhone, trackingClient, uploadReceipt } from "./helpers/workflow.js";

// Fixed-price versus quote-required services, end to end through the real
// API and PostgreSQL. The pricing mode is explicit admin configuration;
// FIXED requests carry a server-validated price snapshot and never get a
// second customer approval; QUOTE keeps the version-checked approval.

let admin;
let employee;
let accountant;

before(async () => {
  admin = staffClient(await createStaffUser({ role: "ADMIN" }));
  employee = staffClient(await createStaffUser({ role: "EMPLOYEE" }));
  accountant = staffClient(await createStaffUser({ role: "ACCOUNTANT" }));
});

// A visa type with one per-traveler required document, priced as given.
async function visa(pricing) {
  const created = await admin.post("/api/visa-types").send({
    code: `TEST-WF-PRICE-${uniqueSuffix()}`,
    name: "TEST-WF تأشيرة تسعير",
    country: "TEST",
    basePrice: 150,
    currency: "USD",
    active: true,
    ...pricing,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const requirement = await admin.post(`/api/visa-types/${created.body.data.id}/requirements`).send({ name: "TEST-WF صورة الجواز", type: "DOCUMENT", scope: "TRAVELER", required: true });
  assert.equal(requirement.status, 201, JSON.stringify(requirement.body));
  return { visaType: created.body.data, requirement: requirement.body.data };
}

function submit({ phone, visaType, requirement, travelers = 2, acceptedTotal, acceptedCurrency }) {
  const names = Array.from({ length: travelers }, (_, index) => `TEST-WF مسافر ${index + 1}`);
  let req = request(app)
    .post("/api/contact-requests")
    .field("name", "TEST-WF عميل")
    .field("phone", phone)
    .field("message", "TEST-WF طلب")
    .field("visaTypeId", visaType.id)
    .field("travelers", JSON.stringify(names.map((fullName, index) => ({ fullName, isPrimary: index === 0 }))))
    .field("documentLabels", JSON.stringify(names.map((_, i) => `جواز ${i}`)))
    .field("documentRequirementIds", JSON.stringify(names.map(() => requirement.id)))
    .field("documentTravelerIndexes", JSON.stringify(names.map((_, i) => String(i))));
  if (acceptedTotal !== undefined) req = req.field("acceptedTotal", String(acceptedTotal));
  if (acceptedCurrency !== undefined) req = req.field("acceptedCurrency", acceptedCurrency);
  names.forEach((_, i) => {
    req = req.attach("documents", PDF(), { filename: `passport-${i}.pdf`, contentType: "application/pdf" });
  });
  return req;
}

const countFor = (phone) => prisma.contactRequest.count({ where: { phone } });

async function acceptDocuments(id, { only } = {}) {
  const detail = await staffDetail(employee, id);
  const pending = detail.documents.filter((d) => d.status === "PENDING" && !d.supersededAt && d.classification !== "FINANCIAL_DOCUMENT");
  for (const document of only ? pending.slice(0, only) : pending) {
    const res = await employee.patch(`/api/contact-requests/${id}/documents/${document.id}/status`).send({ status: "ACCEPTED" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
}

describe("explicit pricing configuration", () => {
  test("FIXED needs a positive price; the public catalog announces the mode", async () => {
    const zero = await admin.post("/api/visa-types").send({ code: `TEST-WF-Z-${uniqueSuffix()}`, name: "TEST-WF صفر", country: "TEST", basePrice: 0, currency: "USD", pricingMode: "FIXED" });
    assert.equal(zero.status, 400);
    assert.equal(zero.body.code, "INVALID_PRICING");

    const { visaType } = await visa({ pricingMode: "QUOTE" });
    assert.equal(visaType.pricingMode, "QUOTE", "explicit, and the default is QUOTE");
    const toFixedFree = await admin.patch(`/api/visa-types/${visaType.id}`).send({ pricingMode: "FIXED", basePrice: 0 });
    assert.equal(toFixedFree.status, 400);
    const toFixed = await admin.patch(`/api/visa-types/${visaType.id}`).send({ pricingMode: "FIXED", priceUnit: "PER_TRAVELER" });
    assert.equal(toFixed.status, 200, JSON.stringify(toFixed.body));

    const catalog = await request(app).get("/api/services/public");
    assert.equal(catalog.status, 200);
    const listed = catalog.body.data.visaTypes.find((v) => v.id === visaType.id);
    assert.equal(listed.pricingMode, "FIXED");
    assert.equal(listed.priceUnit, "PER_TRAVELER");
    assert.equal(listed.paymentAfterDocumentReview, false);

    const unconfigured = await admin.post("/api/visa-types").send({ code: `TEST-WF-D-${uniqueSuffix()}`, name: "TEST-WF افتراضي", country: "TEST", basePrice: 99, currency: "USD" });
    assert.equal(unconfigured.body.data.pricingMode, "QUOTE", "a basePrice alone is never a fixed price");
  });
});

describe("fixed-price service", () => {
  test("submission → documents → payment → receipt review → execution → delivery, with no quote stage", async () => {
    const fixture = await visa({ pricingMode: "FIXED", priceUnit: "PER_TRAVELER" });
    const phone = testPhone();
    const created = await submit({ phone, ...fixture, travelers: 2, acceptedTotal: "300.00", acceptedCurrency: "USD" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;

    const stored = await prisma.contactRequest.findUnique({ where: { id }, include: { invoice: true } });
    assert.equal(stored.pricingMode, "FIXED");
    assert.equal(stored.pricingSnapshot.total, 300);
    assert.equal(stored.pricingSnapshot.unitPrice, 150);
    assert.equal(stored.pricingSnapshot.units, 2);
    assert.equal(stored.pricingSnapshot.currency, "USD");
    assert.equal(stored.invoice.status, "APPROVED");
    assert.equal(Number(stored.invoice.amount), 300);
    assert.equal(stored.invoice.version, 1);
    assert.equal(stored.invoice.createdByUserId, null);
    assert.equal(stored.paymentStatus, "AWAITING_TRANSFER");

    const tracking = trackingClient(phone);
    let mine = await tracking.request(id);
    assert.ok(!mine.allowedActions.includes("APPROVE_QUOTE"), "no second approval");
    assert.ok(mine.allowedActions.includes("UPLOAD_RECEIPT"));
    assert.equal(mine.progress.pricingMode, "FIXED");
    assert.ok(!mine.progress.steps.some((s) => s.key === "QUOTE"), "no quote circle");
    assert.equal(mine.progress.pricing.total, 300);

    // Staff cannot turn it into a quote, and the customer cannot "approve" it.
    const quote = await employee.post(`/api/contact-requests/${id}/invoice`).send({ amount: 999, currency: "USD" });
    assert.equal(quote.status, 409);
    assert.equal(quote.body.code, "FIXED_PRICE");
    const offer = await employee.post(`/api/contact-requests/${id}/offers`).send({ carrier: "TEST", amount: 1, currency: "USD" });
    assert.equal(offer.status, 409);
    const approve = await tracking.post(`/api/tracking/requests/${id}/invoice/approve`).send({ invoiceVersion: 1 });
    assert.equal(approve.status, 409);
    assert.equal(approve.body.code, "QUOTE_NOT_PENDING");
    assert.ok(!(await staffDetail(employee, id)).allowedActions.includes("ISSUE_QUOTE"));

    // Receipt uploaded is not payment accepted.
    await uploadReceipt(tracking, id);
    mine = await tracking.request(id);
    assert.equal(mine.progress.steps.find((s) => s.key === "PAYMENT").state, "done");
    assert.notEqual(mine.progress.steps.find((s) => s.key === "PAYMENT_REVIEW").state, "done");
    assert.equal((await accountant.post(`/api/contact-requests/${id}/confirm-payment`).send({})).status, 200);

    await acceptDocuments(id);
    const started = await employee.post(`/api/contact-requests/${id}/start-execution`).send({});
    assert.equal(started.status, 200, JSON.stringify(started.body));
    mine = await tracking.request(id);
    const execution = mine.progress.steps.find((s) => s.key === "EXECUTION");
    assert.equal(execution.state, "current", "started is not finished");
    assert.equal(execution.started, true);

    const detail = await staffDetail(employee, id);
    const published = await deliverable(employee, id, { travelerIds: detail.travelers.map((t) => t.id), publish: true });
    assert.equal(published.status, 201, JSON.stringify(published.body));
    const closed = await prisma.contactRequest.findUnique({ where: { id }, include: { invoice: true } });
    assert.equal(closed.outcome, "COMPLETED");
    assert.equal(Number(closed.invoice.amount), 300, "the accepted price never changed");
    assert.equal(closed.invoice.version, 1);
  });

  test("a total that differs from the server's is refused and nothing is created", async () => {
    const fixture = await visa({ pricingMode: "FIXED", priceUnit: "PER_TRAVELER" });
    const phone = testPhone();
    const low = await submit({ phone, ...fixture, travelers: 2, acceptedTotal: 150 });
    assert.equal(low.status, 409);
    assert.equal(low.body.code, "PRICE_CHANGED");
    assert.equal(low.body.details.total, 300);
    assert.match(low.body.message, /[؀-ۿ]/);
    const currency = await submit({ phone, ...fixture, travelers: 2, acceptedTotal: 300, acceptedCurrency: "SAR" });
    assert.equal(currency.status, 409);

    // The agency changes the price after the customer saw it.
    await admin.patch(`/api/visa-types/${fixture.visaType.id}`).send({ basePrice: 200 });
    const stale = await submit({ phone, ...fixture, travelers: 2, acceptedTotal: 300, acceptedCurrency: "USD" });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.details.total, 400);
    assert.equal(await countFor(phone), 0);
  });

  test("payment after document review: locked until every document is approved, then open at the same price", async () => {
    const fixture = await visa({ pricingMode: "FIXED", priceUnit: "PER_REQUEST", paymentAfterDocumentReview: true });
    const phone = testPhone();
    const created = await submit({ phone, ...fixture, travelers: 2, acceptedTotal: 150, acceptedCurrency: "USD" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    const tracking = trackingClient(phone);

    let mine = await tracking.request(id);
    assert.equal(mine.progress.paymentLocked, true);
    assert.equal(mine.progress.stage, "AWAITING_DOCUMENT_REVIEW");
    assert.ok(!mine.allowedActions.includes("UPLOAD_RECEIPT"));
    assert.deepEqual(mine.paymentAccounts, [], "no bank accounts before the documents are approved");
    const early = await tracking.post(`/api/tracking/requests/${id}/payment-receipt`).field("label", "إثبات الدفع").attach("file", PDF(), { filename: "r.pdf", contentType: "application/pdf" });
    assert.equal(early.status, 409);
    assert.equal(early.body.code, "PAYMENT_AFTER_DOCUMENT_REVIEW");

    await acceptDocuments(id, { only: 1 });
    mine = await tracking.request(id);
    assert.equal(mine.progress.paymentLocked, true, "one traveler's document is not all documents");

    await acceptDocuments(id);
    mine = await tracking.request(id);
    assert.equal(mine.progress.paymentLocked, false);
    assert.ok(mine.allowedActions.includes("UPLOAD_RECEIPT"));
    assert.ok(!mine.allowedActions.includes("APPROVE_QUOTE"));
    await uploadReceipt(tracking, id);
    const invoice = await prisma.invoice.findUnique({ where: { contactRequestId: id } });
    assert.equal(Number(invoice.amount), 150);
    assert.equal(invoice.status, "APPROVED");
  });

  test("an older client that does not send the total gets a quote request, never an unseen charge", async () => {
    const fixture = await visa({ pricingMode: "FIXED", priceUnit: "PER_TRAVELER" });
    const phone = testPhone();
    const created = await submit({ phone, ...fixture, travelers: 1 });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const stored = await prisma.contactRequest.findUnique({ where: { id: created.body.data.id }, include: { invoice: true } });
    assert.equal(stored.pricingMode, "QUOTE");
    assert.equal(stored.pricingSnapshot.reason, "FIXED_PRICE_NOT_CONFIRMED");
    assert.equal(stored.invoice, null);
    assert.equal(stored.paymentStatus, "NOT_REQUIRED");
  });
});

describe("quote-required service", () => {
  test("the agency quotes and the customer approves the exact version", async () => {
    const fixture = await visa({ pricingMode: "QUOTE" });
    const phone = testPhone();
    const created = await submit({ phone, ...fixture, travelers: 1 });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    const tracking = trackingClient(phone);
    let mine = await tracking.request(id);
    assert.equal(mine.progress.pricingMode, "QUOTE");
    assert.ok(mine.progress.steps.some((s) => s.key === "QUOTE"), "the quote circle exists");
    assert.ok(!mine.allowedActions.includes("UPLOAD_RECEIPT"));

    assert.equal((await employee.post(`/api/contact-requests/${id}/invoice`).send({ amount: 120, currency: "USD" })).status, 200);
    assert.equal((await employee.post(`/api/contact-requests/${id}/invoice`).send({ amount: 130, currency: "USD" })).status, 200);
    mine = await tracking.request(id);
    assert.equal(mine.invoice.version, 2);
    assert.ok(mine.allowedActions.includes("APPROVE_QUOTE"));
    const missing = await tracking.post(`/api/tracking/requests/${id}/invoice/approve`).send({});
    assert.equal(missing.body.code, "QUOTE_VERSION_REQUIRED");
    const stale = await tracking.post(`/api/tracking/requests/${id}/invoice/approve`).send({ invoiceVersion: 1 });
    assert.equal(stale.body.code, "QUOTE_CHANGED");
    const ok = await tracking.post(`/api/tracking/requests/${id}/invoice/approve`).send({ invoiceVersion: 2 });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    mine = await tracking.request(id);
    assert.equal(mine.progress.steps.find((s) => s.key === "QUOTE").state, "done");
    assert.ok(mine.allowedActions.includes("UPLOAD_RECEIPT"));
  });

  test("a client that confirmed a fixed total after the agency switched to quotation is refused", async () => {
    const fixture = await visa({ pricingMode: "QUOTE" });
    const phone = testPhone();
    const res = await submit({ phone, ...fixture, travelers: 1, acceptedTotal: 150, acceptedCurrency: "USD" });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "PRICING_MODE_CHANGED");
    assert.equal(await countFor(phone), 0);
  });
});

describe("Egypt travel tasks by stable key", () => {
  test("completion is blocked by a keyed task whatever its title, never by a title alone", async () => {
    const egypt = await prisma.visaType.findUnique({ where: { code: "VISA-EGYPT-CLEARANCE" } });
    assert.ok(egypt, "seeded Egypt clearance visa type");
    const created = await request(app).post("/api/contact-requests").send({
      name: "TEST-WF مصر",
      phone: testPhone(),
      message: "TEST-WF",
      visaTypeId: egypt.id,
      intakeData: { egyptTravel: { entryMode: "AIR", bookingStatus: "NEEDS_NASAEM", entryDate: "2031-01-01" } },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    await prisma.caseTask.create({ data: { contactRequestId: id, type: "OTHER", source: "SYSTEM", title: "مهمة عامة عن مصر" } });
    const codes = async () => (await staffDetail(employee, id)).progress.completionBlockers.map((r) => r.code);
    assert.ok(!(await codes()).includes("TRAVEL_TASKS_OPEN"), "a title mentioning مصر is not a travel task");
    await prisma.caseTask.create({ data: { contactRequestId: id, type: "OTHER", source: "SYSTEM", systemKey: "EGYPT_TRAVEL_CIRCULAR", title: "Circular (renamed)" } });
    assert.ok((await codes()).includes("TRAVEL_TASKS_OPEN"));
    const detail = await staffDetail(employee, id);
    assert.ok(detail.tasks.some((t) => t.systemKey === "EGYPT_TRAVEL_CIRCULAR"), "the key reaches the back-office");
  });
});

// The app currently installed from main (mobile/www on origin/main): it never
// sends acceptedTotal, approves a price with an empty body, and ignores
// progress. Its exact payloads against this backend:
describe("older installed app (main) against this backend", () => {
  test("FIXED item → quote request; empty-body approval refused with an update message; nothing approved unseen", async () => {
    const fixture = await visa({ pricingMode: "FIXED", priceUnit: "PER_REQUEST" });
    const phone = testPhone();
    const created = await submit({ phone, ...fixture, travelers: 1 });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    assert.equal((await prisma.contactRequest.findUnique({ where: { id } })).pricingMode, "QUOTE");
    assert.equal((await employee.post(`/api/contact-requests/${id}/invoice`).send({ amount: 150, currency: "USD" })).status, 200);
    const tracking = trackingClient(phone);
    const approve = await tracking.post(`/api/tracking/requests/${id}/invoice/approve`);
    assert.equal(approve.status, 409);
    assert.equal(approve.body.code, "QUOTE_VERSION_REQUIRED");
    assert.match(approve.body.message, /حدّث التطبيق/);
    assert.equal((await prisma.invoice.findUnique({ where: { contactRequestId: id } })).status, "PENDING");
  });

  test("a receipt from the old app on a fixed price awaiting document review is refused in Arabic", async () => {
    const fixture = await visa({ pricingMode: "FIXED", priceUnit: "PER_REQUEST", paymentAfterDocumentReview: true });
    const phone = testPhone();
    const created = await submit({ phone, ...fixture, travelers: 1, acceptedTotal: 150, acceptedCurrency: "USD" });
    const res = await trackingClient(phone).post(`/api/tracking/requests/${created.body.data.id}/payment-receipt`).field("label", "إثبات الدفع").attach("file", PDF(), { filename: "r.pdf", contentType: "application/pdf" });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /بعد اعتماد المستندات/);
    assert.equal(await prisma.contactRequestDocument.count({ where: { contactRequestId: created.body.data.id, classification: "FINANCIAL_DOCUMENT" } }), 0);
  });
});
