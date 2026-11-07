import "./env.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";
import { PDF, testPhone, trackingClient } from "./helpers/workflow.js";
import { normalizePhone } from "../src/utils/phone.js";
import { clearCapturedProviderEmails, getCapturedProviderEmails } from "../src/utils/providerEmail.js";
import { deliverPaymentReceipt, processPendingReceipts } from "../src/modules/customer-messages/customer-messages.service.js";
import { rtlText, receiptLines } from "../src/modules/payment-receipts/receipt-pdf.js";
import { sanitizeQualitySignal } from "../src/modules/egypt-clearance/document-quality.js";

// Paid receipt (PDF + e-mail outbox) on payment confirmation, staff re-send,
// downloads, and the Egypt "book my flight" inquiry. E-mail runs on the
// in-memory capture transport only: nothing leaves the machine. Fixtures
// (TEST-EGR) live in the disposable test database.

let employee;
let accountant;
let airVisa;
const created = [];

async function underReviewRequest({ email = "test-egr@example.test", amount = 120, currency = "USD", amountSdg = 312000, rate = 2600 } = {}) {
  const phone = testPhone();
  const row = await prisma.contactRequest.create({
    data: {
      name: "TEST-EGR عميل",
      phone,
      phoneNormalized: normalizePhone(phone),
      email,
      message: "TEST-EGR",
      visaTypeId: airVisa.id,
      requestKind: "SERVICE_APPLICATION",
      pricingMode: "FIXED",
      paymentStatus: "UNDER_REVIEW",
      intakeData: { egyptRoute: { entryMode: "AIR", departureCity: "بورتسودان", arrivalAirport: "القاهرة" } },
      travelers: { create: [{ fullName: "TEST-EGR مسافر", sortOrder: 0, isPrimary: true }] },
      invoice: { create: { amount, currency, status: "APPROVED", exchangeRateToSdg: rate, amountSdg, rateFixedAt: new Date() } },
    },
  });
  created.push(row.id);
  return { ...row, tracking: trackingClient(phone) };
}

before(async () => {
  process.env.PROVIDER_EMAIL_TRANSPORT = "capture";
  employee = staffClient(await createStaffUser({ role: "EMPLOYEE" }));
  accountant = staffClient(await createStaffUser({ role: "ACCOUNTANT" }));
  airVisa = await prisma.visaType.findUnique({ where: { code: "VISA-EGYPT-CLEARANCE-AIR" } });
});

after(async () => {
  delete process.env.PROVIDER_EMAIL_TRANSPORT;
  await prisma.contactRequest.deleteMany({ where: { OR: [{ id: { in: created } }, { parentRequestId: { in: created } }] } });
});

// Payment confirmation also starts the receipt delivery in the background
// (contact-requests.service.js, after commit). The test's own call can find
// that attempt holding the row (SENDING) and return at once, so wait —
// bounded — until the one attempt that owns it has finished.
async function settledReceiptDelivery(contactRequestId) {
  const where = { contactRequestId_kind_channel: { contactRequestId, kind: "PAYMENT_RECEIPT", channel: "EMAIL" } };
  for (let i = 0; i < 200; i += 1) {
    const row = await prisma.customerMessageDelivery.findUnique({ where });
    if (row && !["PENDING", "SENDING"].includes(row.status)) return row;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return prisma.customerMessageDelivery.findUnique({ where });
}

describe("paid receipt on payment confirmation", () => {
  test("one receipt with the frozen amount, a PDF and one e-mail with the PDF attached", async () => {
    clearCapturedProviderEmails();
    const req = await underReviewRequest();
    const [a, b] = await Promise.all([
      accountant.post(`/api/contact-requests/${req.id}/confirm-payment`).send({ reason: "تمت المطابقة مع كشف البنك" }),
      accountant.post(`/api/contact-requests/${req.id}/confirm-payment`).send({ reason: "تمت المطابقة مع كشف البنك" }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409], "exactly one confirmation wins");
    const receipts = await prisma.paymentReceipt.findMany({ where: { contactRequestId: req.id } });
    assert.equal(receipts.length, 1);
    assert.match(receipts[0].receiptNo, /^NR-\d{4}-\d{6}$/);
    assert.equal(Number(receipts[0].amount), 120);
    assert.equal(receipts[0].currency, "USD");
    assert.equal(Number(receipts[0].amountSdg), 312000);
    assert.equal(receipts[0].customerEmail, "test-egr@example.test");

    await deliverPaymentReceipt(req.id);
    const delivery = await settledReceiptDelivery(req.id);
    const receipt = await prisma.paymentReceipt.findUnique({ where: { contactRequestId: req.id } });
    assert.equal(receipt.pdfStatus, "READY");
    assert.equal(delivery.status, "ACCEPTED");
    assert.equal(delivery.attempts, 1, "one delivery attempt, not one per caller");
    const sent = getCapturedProviderEmails().filter((mail) => mail.to === "test-egr@example.test" && mail.subject.includes(receipt.receiptNo));
    assert.equal(sent.length, 1, "sent once");
    assert.equal(sent[0].attachments[0].contentType, "application/pdf");
    assert.ok(sent[0].attachments[0].size > 1000);
    assert.ok(sent[0].body.includes("ليس فاتورة ضريبية"));
    await deliverPaymentReceipt(req.id);
    assert.equal(getCapturedProviderEmails().filter((mail) => mail.subject.includes(receipt.receiptNo)).length, 1, "never twice automatically");

    const mine = await req.tracking.request(req.id);
    assert.equal(mine.egypt.receipt.available, true);
    assert.equal(mine.egypt.timeline.find((s) => s.key === "PAYMENT_CONFIRMED").state, "done");
    const file = await req.tracking.get(`/api/tracking/requests/${req.id}/payment-receipt/file`);
    assert.equal(file.status, 200);
    assert.equal(file.headers["content-type"], "application/pdf");
    assert.equal(file.body.subarray(0, 4).toString(), "%PDF");
    assert.equal((await trackingClient(testPhone()).get(`/api/tracking/requests/${req.id}/payment-receipt/file`)).status, 404, "another phone cannot download it");
    assert.equal((await employee.get(`/api/contact-requests/${req.id}/payment-receipt/file`)).status, 200);
  });

  test("no e-mail address: the receipt is still issued and downloadable; the e-mail is SKIPPED, never blocking", async () => {
    const req = await underReviewRequest({ email: null });
    assert.equal((await accountant.post(`/api/contact-requests/${req.id}/confirm-payment`).send({ reason: "تمت المطابقة مع كشف البنك" })).status, 200);
    await deliverPaymentReceipt(req.id);
    const delivery = await settledReceiptDelivery(req.id);
    assert.equal(delivery.status, "SKIPPED");
    assert.equal(delivery.lastError, "NO_RECIPIENT");
    const stored = await prisma.contactRequest.findUnique({ where: { id: req.id } });
    assert.equal(stored.paymentStatus, "CONFIRMED");
    assert.equal((await req.tracking.get(`/api/tracking/requests/${req.id}/payment-receipt/file`)).status, 200);
  });

  test("mail API not configured: SKIPPED NOT_CONFIGURED, payment unaffected; staff re-send with a corrected address is audited", async () => {
    delete process.env.PROVIDER_EMAIL_TRANSPORT;
    const req = await underReviewRequest();
    assert.equal((await accountant.post(`/api/contact-requests/${req.id}/confirm-payment`).send({ reason: "تمت المطابقة مع كشف البنك" })).status, 200);
    await deliverPaymentReceipt(req.id);
    let delivery = await settledReceiptDelivery(req.id);
    assert.equal(delivery.status, "SKIPPED");
    assert.equal(delivery.lastError, "NOT_CONFIGURED");
    process.env.PROVIDER_EMAIL_TRANSPORT = "capture";
    assert.equal((await employee.post(`/api/contact-requests/${req.id}/payment-receipt/resend`).send({ email: "not-an-email" })).status, 400);
    const resent = await employee.post(`/api/contact-requests/${req.id}/payment-receipt/resend`).send({ email: "corrected@example.test" });
    assert.equal(resent.status, 200, JSON.stringify(resent.body));
    assert.equal(resent.body.data.status, "ACCEPTED");
    delivery = await prisma.customerMessageDelivery.findFirst({ where: { contactRequestId: req.id, kind: "PAYMENT_RECEIPT" } });
    assert.equal(delivery.recipient, "corrected@example.test");
    const audit = await prisma.activityLog.findFirst({ where: { entityId: req.id, action: "PAYMENT_RECEIPT_EMAIL_RESENT" } });
    assert.equal(audit.oldValue.status, "SKIPPED");
  });

  test("the reconciler produces pending PDFs and sends due e-mails", async () => {
    const req = await underReviewRequest({ email: "reconcile@example.test" });
    // Payment confirmed while the background delivery is not run (crash).
    await prisma.$transaction(async (tx) => {
      const { createReceiptInTransaction } = await import("../src/modules/payment-receipts/payment-receipts.service.js");
      const locked = await tx.contactRequest.findUnique({ where: { id: req.id }, include: { invoice: true, offers: true, travelers: true, visaType: true } });
      await createReceiptInTransaction(tx, locked, { userId: null, paidAt: new Date() });
      await tx.contactRequest.update({ where: { id: req.id }, data: { paymentStatus: "CONFIRMED", paymentConfirmedAt: new Date() } });
    });
    await processPendingReceipts();
    assert.equal((await prisma.paymentReceipt.findUnique({ where: { contactRequestId: req.id } })).pdfStatus, "READY");
    const delivery = await prisma.customerMessageDelivery.findFirst({ where: { contactRequestId: req.id, kind: "PAYMENT_RECEIPT" } });
    assert.equal(delivery.status, "ACCEPTED");
  });

  test("a request with no confirmed amount gets no invented receipt", async () => {
    const phone = testPhone();
    const row = await prisma.contactRequest.create({ data: { name: "TEST-EGR", phone, phoneNormalized: normalizePhone(phone), message: "TEST-EGR", paymentStatus: "UNDER_REVIEW" } });
    created.push(row.id);
    assert.equal((await accountant.post(`/api/contact-requests/${row.id}/confirm-payment`).send({ reason: "تمت المطابقة مع كشف البنك" })).status, 200);
    assert.equal(await prisma.paymentReceipt.count({ where: { contactRequestId: row.id } }), 0);
  });
});

describe("receipt PDF text", () => {
  test("labels are a payment receipt, never a tax invoice; amounts as recorded", () => {
    const lines = receiptLines({ receiptNo: "NR-2026-000001", paidAt: new Date("2026-10-19T10:00:00Z"), customerName: "س", serviceName: "خ", travelerCount: 1, contactRequestId: "r1", amount: "120.00", currency: "USD", amountSdg: "312000.00", exchangeRateToSdg: "2600" });
    const labels = lines.map(([label]) => label);
    assert.ok(labels.includes("المبلغ المدفوع"));
    assert.ok(!labels.some((label) => /ضريب|VAT/i.test(label)));
    assert.equal(lines.find(([label]) => label === "المبلغ المدفوع")[1], "120.00 USD");
    assert.equal(lines.find(([label]) => label === "ما يعادل بالجنيه السوداني")[1], "312,000.00 SDG");
  });

  test("RTL helper keeps numbers readable and leaves Latin-only text alone", () => {
    assert.equal(rtlText("رقم 123"), "رقم 321");
    assert.equal(rtlText("Payment Receipt"), "Payment Receipt");
    assert.equal(rtlText("آليًا"), "آليا", "vowel marks dropped");
  });
});

describe("Egypt: book the flight through Nasaem", () => {
  test("REQUEST opens exactly one linked flight inquiry (no fare, no booking); BOOKED/LATER open none", async () => {
    const req = await underReviewRequest();
    const [a, b] = await Promise.all([
      req.tracking.post(`/api/tracking/requests/${req.id}/egypt/flight`).send({ choice: "REQUEST" }),
      req.tracking.post(`/api/tracking/requests/${req.id}/egypt/flight`).send({ choice: "REQUEST" }),
    ]);
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(b.status, 200, JSON.stringify(b.body));
    const children = await prisma.contactRequest.findMany({ where: { parentRequestId: req.id }, include: { invoice: true, offers: true } });
    assert.equal(children.length, 1);
    assert.equal(children[0].linkKind, "EGYPT_FLIGHT");
    assert.equal(children[0].pricingMode, "QUOTE");
    assert.equal(children[0].invoice, null, "no price invented");
    assert.equal(children[0].offers.length, 0);
    assert.equal(children[0].phoneNormalized, req.phoneNormalized, "same customer");
    const mine = await req.tracking.request(req.id);
    assert.equal(mine.egypt.flight.choice, "REQUEST");
    assert.equal(mine.egypt.flight.inquiry.id, children[0].id);
    assert.equal(mine.egypt.approval.issued, false, "the inquiry does not touch the approval");

    const other = await underReviewRequest();
    assert.equal((await other.tracking.post(`/api/tracking/requests/${other.id}/egypt/flight`).send({ choice: "LATER" })).status, 200);
    assert.equal(await prisma.contactRequest.count({ where: { parentRequestId: other.id } }), 0);
    assert.equal((await trackingClient(testPhone()).post(`/api/tracking/requests/${other.id}/egypt/flight`).send({ choice: "REQUEST" })).status, 404, "another phone cannot act on it");
    assert.equal((await other.tracking.post(`/api/tracking/requests/${other.id}/egypt/flight`).send({ choice: "SOON" })).status, 400);
  });

  test("a stored REQUEST without its inquiry (interrupted submission) is repaired once", async () => {
    const req = await underReviewRequest();
    await prisma.contactRequest.update({ where: { id: req.id }, data: { intakeData: { ...req.intakeData, egyptFlight: { choice: "REQUEST" } } } });
    const { reconcileFlightInquiries } = await import("../src/modules/egypt-clearance/linked-flight.service.js");
    await reconcileFlightInquiries();
    await reconcileFlightInquiries();
    assert.equal(await prisma.contactRequest.count({ where: { parentRequestId: req.id } }), 1);
  });

  test("a ticket published on the linked inquiry shows on the approval request", async () => {
    const req = await underReviewRequest();
    await req.tracking.post(`/api/tracking/requests/${req.id}/egypt/flight`).send({ choice: "REQUEST" });
    const child = await prisma.contactRequest.findFirst({ where: { parentRequestId: req.id } });
    const uploader = await prisma.user.findFirst({ where: { role: "EMPLOYEE" } });
    const ticket = await prisma.contactRequestDeliverable.create({ data: { contactRequestId: child.id, label: "تذكرة", fileName: "t.pdf", storagePath: "contact-request-deliverables/none.pdf", mimeType: "application/pdf", sizeBytes: 10, uploadedByUserId: uploader.id, publishedAt: new Date() } });
    const mine = await req.tracking.request(req.id);
    assert.ok(mine.egypt.tickets.some((t) => t.source === "LINKED_BOOKING" && t.deliverableId === ticket.id && t.requestId === child.id));
  });
});

describe("passport quality hints", () => {
  test("only known warning codes and bounded numbers are kept", () => {
    assert.deepEqual(sanitizeQualitySignal({ warnings: ["BLURRY", "HACK", "BLURRY"], checks: { sharpness: 12.34567, evil: 1, width: 1e9 }, capture: "CAMERA", acceptedWithWarnings: true }), {
      source: "DEVICE",
      warnings: ["BLURRY"],
      checks: { sharpness: 12.346 },
      capture: "CAMERA",
      acceptedWithWarnings: true,
    });
    assert.equal(sanitizeQualitySignal("x"), null);
    assert.equal(sanitizeQualitySignal({}), null);
  });

  test("hints sent with a submission are stored with the document, never refusing it", async () => {
    const visa = await prisma.visaType.findUnique({ where: { code: "VISA-EGYPT-CLEARANCE" }, include: { requirements: { where: { active: true } } } });
    const passport = visa.requirements.find((r) => r.attachmentType === "passport_copy") || visa.requirements.find((r) => r.type === "DOCUMENT");
    const phone = testPhone();
    const res = await request(app)
      .post("/api/contact-requests")
      .field("name", "TEST-EGR عميل")
      .field("phone", phone)
      .field("message", "TEST-EGR")
      .field("visaTypeId", visa.id)
      .field("travelers", JSON.stringify([{ fullName: "TEST-EGR مسافر", isPrimary: true }]))
      .field("documentLabels", JSON.stringify(["جواز"]))
      .field("documentRequirementIds", JSON.stringify([passport.id]))
      .field("documentTravelerIndexes", JSON.stringify(["0"]))
      .field("documentQuality", JSON.stringify([{ warnings: ["GLARE"], checks: { glare: 0.12 }, capture: "CAMERA", acceptedWithWarnings: true }]))
      .attach("documents", PDF(), { filename: "passport.pdf", contentType: "application/pdf" });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    created.push(res.body.data.id);
    const doc = await prisma.contactRequestDocument.findFirst({ where: { contactRequestId: res.body.data.id } });
    assert.deepEqual(doc.qualitySignal.warnings, ["GLARE"]);
    assert.equal(doc.status, "PENDING", "a hint never decides the review");
  });
});
