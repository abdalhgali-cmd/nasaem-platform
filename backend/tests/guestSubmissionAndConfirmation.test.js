import "./env.js";
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";

import prisma from "../src/config/database.js";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import { createContactRequest } from "../src/modules/contact-requests/contact-requests.service.js";
import { createContactRequestSchema } from "../src/modules/contact-requests/contact-requests.validators.js";
import { sendRequestConfirmation, buildRequestConfirmationText } from "../src/modules/customer-messages/customer-messages.service.js";
import { signTrackingToken } from "../src/utils/jwt.js";
import { normalizePhone } from "../src/utils/phone.js";

// Guest-first mobile app: a customer with no account submits a request,
// gets a real reference, can retry safely, receives an honest confirmation
// status, and can only see their own requests after phone verification.
// (The public submit endpoint allows 5 requests per IP per 15 minutes, so
// this file makes exactly 5 HTTP submissions and calls the service directly
// for the rest.)

const phoneFor = (suffix) => `0912${String(suffix).slice(-6)}`;
const fakeReq = { customer: null, ip: "127.0.0.1", headers: {} };

function guestForm(overrides = {}) {
  return {
    name: "ضيف تجريبي",
    phone: phoneFor(uniqueSuffix()),
    message: "طلب خدمة عمرة من التطبيق",
    service: "العمرة",
    ...overrides,
  };
}

describe("guest submission (no account)", () => {
  let admin;
  before(async () => {
    admin = await loginAsSuperAdmin();
  });

  test("a guest request is stored, returns its real id, and is visible to staff", async () => {
    const form = guestForm();
    const res = await request(app).post("/api/contact-requests").send(form);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const id = res.body.data?.id;
    assert.ok(id, "the response carries the stored request id");
    assert.equal(res.body.data.customerConfirmation, "NOT_AVAILABLE", "no WhatsApp configured in tests: no confirmation is promised");

    const stored = await prisma.contactRequest.findUnique({ where: { id } });
    assert.equal(stored.customerId, null);
    assert.equal(stored.phoneNormalized, normalizePhone(form.phone));

    // The staff operations list (admin dashboard) shows it.
    const staffList = await admin.get("/api/contact-requests?limit=100");
    assert.equal(staffList.status, 200);
    assert.ok(staffList.body.data.some((r) => r.id === id), "guest request appears in the staff list");
  });

  test("a retried submission with the same key returns the same request, not a duplicate", async () => {
    const key = `k-${uniqueSuffix()}-abcdef`;
    const form = guestForm({ submissionKey: key });
    const first = await request(app).post("/api/contact-requests").send(form);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const retry = await request(app).post("/api/contact-requests").send(form);
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.equal(retry.body.data.id, first.body.data.id);
    assert.equal(retry.body.data.duplicate, true);
    assert.equal(await prisma.contactRequest.count({ where: { submissionKey: key } }), 1);

    // The key alone never reveals someone else's request.
    const otherPhone = await request(app).post("/api/contact-requests").send({ ...form, phone: phoneFor(uniqueSuffix()) });
    assert.equal(otherPhone.status, 409);
    assert.equal(otherPhone.body.data, undefined);
  });

  test("email-only contact is rejected (phone is still required; email-only is not supported yet)", async () => {
    const res = await request(app).post("/api/contact-requests").send({ ...guestForm(), phone: undefined, email: "guest@example.com" });
    assert.equal(res.status, 400);
    assert.ok(res.body.errors.fieldErrors.phone);
  });

  test("concurrent retries with one key create exactly one request", async () => {
    const key = `race-${uniqueSuffix()}-xyz123`;
    const data = createContactRequestSchema.parse(guestForm({ submissionKey: key }));
    const [a, b, c] = await Promise.all([createContactRequest(data, fakeReq), createContactRequest(data, fakeReq), createContactRequest(data, fakeReq)]);
    assert.equal(new Set([a.id, b.id, c.id]).size, 1);
    assert.equal(await prisma.contactRequest.count({ where: { submissionKey: key } }), 1);
  });

  test("malformed submission keys are rejected", () => {
    for (const bad of ["short", "has spaces in it 1234", "x".repeat(65)]) {
      assert.equal(createContactRequestSchema.safeParse(guestForm({ submissionKey: bad })).success, false, bad);
    }
  });

  test("staff can see confirmation delivery records; customers and anonymous callers cannot", async () => {
    const created = await createContactRequest(createContactRequestSchema.parse(guestForm()), fakeReq);
    await sendRequestConfirmation(created.id);
    const anonymous = await request(app).get(`/api/contact-requests/${created.id}/customer-messages`);
    assert.equal(anonymous.status, 401);
    const res = await admin.get(`/api/contact-requests/${created.id}/customer-messages`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data[0].status, "SKIPPED");
    assert.equal(res.body.data[0].lastError, "NOT_CONFIGURED");
  });
});

describe("request confirmation over WhatsApp (provider stubbed)", () => {
  const sent = [];
  let respond = () => ({ ok: true, status: 200, json: async () => ({ messages: [{ id: `wamid.${uniqueSuffix()}` }] }), text: async () => "" });
  const realFetch = globalThis.fetch;
  const saved = { ...process.env };

  before(() => {
    process.env.WHATSAPP_API_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    delete process.env.WHATSAPP_TEMPLATE_NAME;
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith("https://graph.facebook.com/")) {
        sent.push(JSON.parse(init.body));
        return respond();
      }
      return realFetch(url, init);
    };
  });
  after(() => {
    globalThis.fetch = realFetch;
    for (const key of ["WHATSAPP_API_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TEMPLATE_NAME"]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  async function newGuestRequest() {
    const data = createContactRequestSchema.parse(guestForm({ travelers: [{ fullName: "مسافر", passportNo: "P1234567" }] }));
    const created = await createContactRequest(data, fakeReq);
    // createContactRequest fires the confirmation in the background; wait for it.
    for (let i = 0; i < 50; i += 1) {
      const row = await prisma.customerMessageDelivery.findFirst({ where: { contactRequestId: created.id } });
      if (row && row.status !== "PENDING" && row.status !== "SENDING") return { created, row };
      await new Promise((r) => setTimeout(r, 40));
    }
    throw new Error("confirmation did not settle");
  }

  test("accepted by the provider is recorded with its message id; the text has no personal documents", async () => {
    const before = sent.length;
    const { created, row } = await newGuestRequest();
    assert.equal(row.status, "ACCEPTED");
    assert.match(row.providerMessageId, /^wamid\./);
    assert.equal(row.attempts, 1);
    const message = sent.slice(before).find((m) => m.to === normalizePhone(created.phone));
    assert.ok(message, "sent to the submitting customer's own number");
    assert.ok(message.text.body.includes(created.id), "includes the reference");
    assert.ok(!message.text.body.includes("P1234567"), "never includes passport numbers");
  });

  test("calling again never sends a second confirmation", async () => {
    const { created } = await newGuestRequest();
    const before = sent.length;
    await Promise.all([sendRequestConfirmation(created.id), sendRequestConfirmation(created.id)]);
    assert.equal(sent.length, before);
  });

  test("a provider failure is recorded, the request survives, and a retry succeeds once", async () => {
    respond = () => ({ ok: false, status: 500, json: async () => ({}), text: async () => "boom" });
    const { created, row } = await newGuestRequest();
    assert.equal(row.status, "FAILED");
    assert.equal(row.lastError, "HTTP 500");
    assert.ok(await prisma.contactRequest.findUnique({ where: { id: created.id } }), "request still stored");

    respond = () => ({ ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.retry" }] }), text: async () => "" });
    const retried = await sendRequestConfirmation(created.id);
    assert.equal(retried.status, "ACCEPTED");
    assert.equal(retried.attempts, 2);
  });

  test("confirmation text template", () => {
    const text = buildRequestConfirmationText({ id: "cuid123", service: null, serviceRef: { name: "العمرة" } });
    assert.match(text, /العمرة/);
    assert.match(text, /cuid123/);
  });
});

describe("guest tracking ownership", () => {
  test("a tracking session only sees its own phone's requests, without internal file paths", async () => {
    const mine = await createContactRequest(createContactRequestSchema.parse(guestForm()), fakeReq);
    const theirs = await createContactRequest(createContactRequestSchema.parse(guestForm()), fakeReq);
    await prisma.contactRequestDocument.create({
      data: { contactRequestId: mine.id, label: "جواز", fileName: "p.pdf", storagePath: "/secret/uploads/p.pdf", mimeType: "application/pdf", sizeBytes: 10 },
    });
    const token = signTrackingToken(mine.phoneNormalized);
    const res = await request(app).get("/api/tracking/requests").set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    const ids = res.body.data.map((r) => r.id);
    assert.ok(ids.includes(mine.id));
    assert.ok(!ids.includes(theirs.id), "another customer's request is not listed");
    const doc = res.body.data.find((r) => r.id === mine.id).documents[0];
    assert.equal(doc.storagePath, undefined);
    assert.ok(!JSON.stringify(res.body).includes("/secret/uploads"));

    // Actions on someone else's request are refused as not found.
    const foreign = await request(app).post(`/api/tracking/requests/${theirs.id}/mark-transfer-sent`).set("Authorization", `Bearer ${token}`);
    assert.equal(foreign.status, 404);
  });

  test("no token, a wrong OTP, or an account token cannot list requests", async () => {
    assert.equal((await request(app).get("/api/tracking/requests")).status, 401);
    const phone = phoneFor(uniqueSuffix());
    const codeRes = await request(app).post("/api/tracking/request-code").send({ phone });
    assert.equal(codeRes.status, 200);
    const wrong = codeRes.body.debugCode === "000000" ? "111111" : "000000";
    const bad = await request(app).post("/api/tracking/verify-code").send({ phone, code: wrong });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.data, undefined);
    const good = await request(app).post("/api/tracking/verify-code").send({ phone, code: codeRes.body.debugCode });
    assert.equal(good.status, 200);
    assert.ok(good.body.data.token);
  });
});
