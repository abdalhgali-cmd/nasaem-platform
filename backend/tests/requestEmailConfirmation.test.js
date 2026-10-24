// AUDIT-00 G-11 / G-13: a new request is confirmed by e-mail when the
// customer gave an address (owner decision: e-mail stays optional), in
// addition to WhatsApp. The e-mail row is written in the same insert as the
// request on every creation path (form and draft), so a crash right after
// the insert still leaves it for the reconciler. Mail goes through the
// in-memory capture transport: nothing leaves the machine.
import "./env.js";
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import prisma from "../src/config/database.js";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import { createContactRequest } from "../src/modules/contact-requests/contact-requests.service.js";
import { createContactRequestSchema } from "../src/modules/contact-requests/contact-requests.validators.js";
import { processPendingConfirmations, sendRequestConfirmation } from "../src/modules/customer-messages/customer-messages.service.js";
import { clearCapturedProviderEmails, getCapturedProviderEmails } from "../src/utils/providerEmail.js";

const fakeReq = { customer: null, ip: "127.0.0.1", headers: {} };
const phone = () => `0912${String(uniqueSuffix()).slice(-6)}`;
const form = (overrides = {}) => createContactRequestSchema.parse({ name: "ضيف تجريبي", phone: phone(), message: "طلب خدمة عمرة", service: "العمرة", ...overrides });
const emailRow = (contactRequestId) => prisma.customerMessageDelivery.findFirst({ where: { contactRequestId, kind: "REQUEST_CONFIRMATION", channel: "EMAIL" } });

async function settled(contactRequestId) {
  for (let i = 0; i < 50; i += 1) {
    const row = await emailRow(contactRequestId);
    if (row && !["PENDING", "SENDING"].includes(row.status)) return row;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("e-mail confirmation did not settle");
}

let admin;
const savedTransport = process.env.PROVIDER_EMAIL_TRANSPORT;
before(async () => {
  admin = await loginAsSuperAdmin();
});
beforeEach(() => {
  process.env.PROVIDER_EMAIL_TRANSPORT = "capture";
  clearCapturedProviderEmails();
});
after(() => {
  if (savedTransport === undefined) delete process.env.PROVIDER_EMAIL_TRANSPORT;
  else process.env.PROVIDER_EMAIL_TRANSPORT = savedTransport;
});

describe("request confirmation by e-mail", () => {
  test("with an address: one e-mail with the reference and service, accepted once", async () => {
    const email = `customer-${uniqueSuffix()}@example.test`;
    const created = await createContactRequest(form({ email, travelers: [{ fullName: "مسافر", passportNo: "P7654321" }] }), fakeReq);
    const row = await settled(created.id);
    assert.equal(row.status, "ACCEPTED");
    assert.equal(row.recipient, email);
    const mails = getCapturedProviderEmails().filter((m) => m.to === email);
    assert.equal(mails.length, 1);
    assert.match(mails[0].subject, /تم استلام طلبك/);
    assert.ok(mails[0].body.includes(created.id), "the reference is in the e-mail");
    assert.ok(!mails[0].body.includes("P7654321"), "never a passport number");

    // Calling again (e.g. the reconciler) never sends a second one.
    await sendRequestConfirmation(created.id, { channel: "EMAIL" });
    await processPendingConfirmations({ limit: 500 });
    assert.equal(getCapturedProviderEmails().filter((m) => m.to === email).length, 1);
  });

  test("without an address: recorded as skipped (no recipient), nothing sent, the request is unaffected", async () => {
    const created = await createContactRequest(form(), fakeReq);
    const row = await emailRow(created.id);
    assert.deepEqual([row.status, row.lastError], ["SKIPPED", "NO_RECIPIENT"]);
    assert.equal(getCapturedProviderEmails().length, 0);
    assert.ok(await prisma.contactRequest.findUnique({ where: { id: created.id } }));
  });

  test("mail not configured: SKIPPED NOT_CONFIGURED; staff can re-send by channel once it is", async () => {
    delete process.env.PROVIDER_EMAIL_TRANSPORT;
    const email = `later-${uniqueSuffix()}@example.test`;
    const created = await createContactRequest(form({ email }), fakeReq);
    const row = await settled(created.id);
    assert.deepEqual([row.status, row.lastError], ["SKIPPED", "NOT_CONFIGURED"]);

    process.env.PROVIDER_EMAIL_TRANSPORT = "capture";
    const unknown = await admin.post(`/api/contact-requests/${created.id}/customer-messages/confirmation`).send({ channel: "SMS" });
    assert.equal(unknown.status, 400);
    const resent = await admin.post(`/api/contact-requests/${created.id}/customer-messages/confirmation`).send({ channel: "EMAIL" });
    assert.equal(resent.status, 200, JSON.stringify(resent.body));
    assert.equal(resent.body.data.status, "ACCEPTED");
    assert.equal(getCapturedProviderEmails().filter((m) => m.to === email).length, 1);
  });

  test("the draft (website wizard) path writes both confirmations with the request and sends the e-mail", async () => {
    const service = (await admin.post("/api/services").send({ code: `SVC-MAIL-${uniqueSuffix()}`, name: "Mail Draft Service", category: "qa-mail", basePrice: 100, currency: "SAR" })).body.data;
    const token = (await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: service.id })).body.data.token;
    const email = `draft-${uniqueSuffix()}@example.test`;
    assert.equal((await request(app).patch(`/api/intake-drafts/${token}`).send({ name: "Draft Customer", phone: phone(), email, travelerCount: 1, travelers: [{ fullName: "Traveler A" }] })).status, 200);
    const submitted = await request(app).post(`/api/intake-drafts/${token}/submit`).send({});
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    const rows = await prisma.customerMessageDelivery.findMany({ where: { contactRequestId: submitted.body.data.id, kind: "REQUEST_CONFIRMATION" } });
    assert.deepEqual(rows.map((r) => r.channel).sort(), ["EMAIL", "WHATSAPP"]);
    assert.equal((await settled(submitted.body.data.id)).status, "ACCEPTED");
    assert.equal(getCapturedProviderEmails().filter((m) => m.to === email).length, 1);
  });
});
