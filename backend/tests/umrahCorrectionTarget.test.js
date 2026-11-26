// A correction names the exact file: the customer's notification carries the
// requirement and the pilgrim, and replacing the second pilgrim's passport from
// the signed-in account keeps the first passport, the payment receipt and the
// request reference as they were.
import "./env.js";
import "./helpers/journeyLimits.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../src/config/database.js";
import { registerCustomer, uniqueSuffix } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";
import { PDF } from "./helpers/workflow.js";

const PRICE = 500;
let admin;
let service;
let passport;
let residence;

before(async () => {
  admin = staffClient(await createStaffUser({ role: "ADMIN" }));
  const created = await admin.post("/api/services").send({
    code: `TEST-CORR-${uniqueSuffix()}`, name: `TEST تصحيح ${uniqueSuffix()}`, category: "UMRAH_PACKAGE", basePrice: PRICE, currency: "SAR",
    active: true, pricingMode: "FIXED", priceUnit: "PER_TRAVELER", features: ["KIND: VISA_ONLY"],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  service = created.body.data;
  for (const requirement of [
    { name: "صورة الجواز", type: "DOCUMENT", scope: "TRAVELER", required: true },
    { name: "إقامة الضامن", type: "DOCUMENT", scope: "CASE", required: true },
  ]) assert.equal((await admin.post(`/api/services/${service.id}/requirements`).send(requirement)).status, 201);
  const rows = await prisma.visaRequirement.findMany({ where: { serviceId: service.id, active: true } });
  passport = rows.find((r) => r.scope === "TRAVELER" && r.name.includes("الجواز"));
  residence = rows.find((r) => r.name.includes("إقامة الضامن"));
  assert.ok(passport && residence);
  const account = await admin.post("/api/payment-accounts").send({ name: `TEST-CORR ${uniqueSuffix()}`, bankName: "TEST", accountName: "TEST", accountNumber: `7${uniqueSuffix().slice(-9)}`, currency: "SAR" });
  assert.equal(account.status, 201, JSON.stringify(account.body));
});

describe("a correction opens and replaces exactly one pilgrim's file", () => {
  test("reject pilgrim 2's passport → targeted notification → replacement keeps pilgrim 1, the receipt and the reference", async () => {
    const { agent, customer } = await registerCustomer();
    const travelers = [{ fullName: "المعتمر الأول", isPrimary: true }, { fullName: "المعتمر الثاني" }];
    let req = agent.post("/api/contact-requests").set("X-Requested-With", "XMLHttpRequest")
      .field("name", "TEST تصحيح").field("phone", customer.phone).field("serviceId", service.id).field("service", service.name)
      .field("message", "TEST تصحيح مستند").field("travelerCount", "2").field("travelers", JSON.stringify(travelers))
      .field("acceptedTotal", String(PRICE * 2)).field("acceptedCurrency", "SAR").field("guarantorPhone", "+966 55 000 2222")
      .field("submissionKey", randomUUID())
      .field("documentLabels", JSON.stringify([passport.name, passport.name, residence.name]))
      .field("documentRequirementIds", JSON.stringify([passport.id, passport.id, residence.id]))
      .field("documentTravelerIndexes", JSON.stringify(["0", "1", ""]));
    for (let i = 0; i < 3; i++) req = req.attach("documents", PDF(), { filename: `doc-${i}.pdf`, contentType: "application/pdf" });
    const created = await req;
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;

    // The customer pays (receipt on file) before the correction.
    const access = created.body.data.paymentAccess;
    const summary = (await agent.get(`/api/contact-requests/${id}/payment-access`).set("x-payment-access", access.token)).body.data;
    const accountId = summary.accounts?.[0]?.id || summary.paymentAccounts?.[0]?.id;
    const receipt = await agent.post(`/api/contact-requests/${id}/payment-access/receipt`).set("x-payment-access", access.token)
      .field("settlementAccountId", accountId).field("invoiceVersion", String(summary.invoiceVersion))
      .attach("file", PDF(), { filename: "receipt.pdf", contentType: "application/pdf" });
    assert.equal(receipt.status, 201, JSON.stringify(receipt.body));

    const before = await prisma.contactRequest.findUnique({ where: { id }, include: { travelers: { orderBy: { sortOrder: "asc" } }, documents: true } });
    assert.equal(before.customerId, customer.id, "submitted from the signed-in account");
    const [p1, p2] = before.travelers;
    const passport1 = before.documents.find((d) => d.requirementId === passport.id && d.travelerId === p1.id);
    const passport2 = before.documents.find((d) => d.requirementId === passport.id && d.travelerId === p2.id);
    const receiptDoc = before.documents.find((d) => d.classification === "FINANCIAL_DOCUMENT");
    assert.ok(passport1 && passport2 && receiptDoc);

    const rejected = await admin.patch(`/api/contact-requests/${id}/documents/${passport2.id}/status`).send({ status: "REJECTED", reviewNote: "الصورة غير واضحة" });
    assert.equal(rejected.status, 200, JSON.stringify(rejected.body));

    // The account's notification names the exact requirement and pilgrim.
    const list = await agent.get("/api/customer/notifications");
    assert.equal(list.status, 200);
    const notice = list.body.data.find((n) => n.contactRequestId === id && n.type === "CONTACT_REQUEST_DOCUMENT_REJECTED");
    assert.ok(notice, JSON.stringify(list.body.data).slice(0, 400));
    assert.equal(notice.requirementId, passport.id);
    assert.equal(notice.travelerId, p2.id);

    // The account's request detail shows that row as rejected, with its reason.
    const detail = (await agent.get(`/api/customer/requests/${id}`)).body.data;
    const row = detail.checklist.find((r) => r.requirementId === passport.id && r.travelerId === p2.id);
    assert.equal(row.state, "REJECTED");
    assert.equal(row.reviewNote, "الصورة غير واضحة");

    const replaced = await agent.post(`/api/customer/requests/${id}/documents`).set("X-Requested-With", "XMLHttpRequest")
      .field("label", passport.name).field("requirementId", passport.id).field("travelerId", p2.id)
      .attach("file", PDF(), { filename: "passport-2-new.pdf", contentType: "application/pdf" });
    assert.equal(replaced.status, 201, JSON.stringify(replaced.body));

    const after = await prisma.contactRequest.findUnique({ where: { id }, include: { documents: true } });
    assert.equal(after.id, id, "same reference");
    const byId = new Map(after.documents.map((d) => [d.id, d]));
    assert.equal(byId.get(passport1.id).supersededAt, null, "pilgrim 1's passport is untouched");
    assert.equal(byId.get(passport1.id).status, passport1.status);
    assert.equal(byId.get(receiptDoc.id).supersededAt, null, "the receipt is untouched");
    assert.equal(after.paymentStatus, before.paymentStatus, "payment state is unchanged");
    assert.ok(byId.get(passport2.id).supersededAt, "only the rejected passport is superseded");
    const current2 = after.documents.filter((d) => d.requirementId === passport.id && d.travelerId === p2.id && !d.supersededAt);
    assert.equal(current2.length, 1);
    assert.equal(current2[0].status, "PENDING");
    assert.equal(after.documents.filter((d) => !d.supersededAt).length, before.documents.length, "one file replaced, none added or lost");
  });
});
