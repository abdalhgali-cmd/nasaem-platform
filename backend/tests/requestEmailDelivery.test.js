// AUDIT-00 G-11, end to end over the real HTTP mail transport (not the
// in-memory capture): a request submitted through the public API with a
// valid address makes the server call the mail API exactly once, with the
// confirmation for that request, and records the provider's acceptance.
// The "mail API" is a local stub on 127.0.0.1 and the address is synthetic
// (example.test): no real customer data, nothing leaves the machine.
// Real inbox delivery depends on the owner's provider and is not tested here.
import "./env.js";
import http from "node:http";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";

import prisma from "../src/config/database.js";
import { app, request, uniqueSuffix } from "./helpers/api.js";
import { pendingConfirmationCreate, processPendingConfirmations, sendRequestConfirmation } from "../src/modules/customer-messages/customer-messages.service.js";
import { normalizePhone } from "../src/utils/phone.js";

const received = [];
let reply = () => 202;
let delayMs = 0;
let server;
const saved = {};
const KEYS = ["PROVIDER_EMAIL_TRANSPORT", "PROVIDER_EMAIL_API_URL", "PROVIDER_EMAIL_API_KEY"];

before(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      received.push({ method: req.method, path: req.url, headers: req.headers, body: JSON.parse(raw || "{}") });
      setTimeout(() => {
        res.statusCode = reply();
        res.end("{}");
      }, delayMs);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  for (const key of KEYS) saved[key] = process.env[key];
  delete process.env.PROVIDER_EMAIL_TRANSPORT;
  process.env.PROVIDER_EMAIL_API_URL = `http://127.0.0.1:${server.address().port}/send`;
  process.env.PROVIDER_EMAIL_API_KEY = "stub-key";
});

after(async () => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  await new Promise((resolve) => server.close(resolve));
});

async function emailRow(contactRequestId, done = (row) => !["PENDING", "SENDING"].includes(row.status)) {
  for (let i = 0; i < 100; i += 1) {
    const row = await prisma.customerMessageDelivery.findFirst({ where: { contactRequestId, kind: "REQUEST_CONFIRMATION", channel: "EMAIL" } });
    if (row && done(row)) return row;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("e-mail confirmation did not settle");
}

function submit(email) {
  return request(app).post("/api/contact-requests").send({
    name: "عميل تجريبي",
    phone: `0912${String(uniqueSuffix()).slice(-6)}`,
    email,
    message: "طلب تأشيرة تجريبي",
    service: "تأشيرة",
    travelers: [{ fullName: "مسافر تجريبي", passportNo: "SYN0000001" }],
  });
}

describe("request confirmation e-mail over the HTTP mail API (local stub)", () => {
  test("a valid address: the mail API receives one confirmation for that request; the delivery is ACCEPTED", async () => {
    const email = `synthetic-${uniqueSuffix()}@example.test`;
    const before = received.length;
    const res = await submit(email);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const id = res.body.data.id;
    const row = await emailRow(id);
    assert.equal(row.status, "ACCEPTED", JSON.stringify(row));
    assert.equal(row.attempts, 1);

    const calls = received.slice(before).filter((call) => call.body.to === email);
    assert.equal(calls.length, 1, "exactly one message to the customer's address");
    const [call] = calls;
    assert.equal(call.method, "POST");
    assert.equal(call.path, "/send");
    assert.equal(call.headers.authorization, "Bearer stub-key");
    assert.equal(call.headers["idempotency-key"], row.id, "automatic attempts share the delivery id as idempotency key");
    assert.match(call.body.subject, /تم استلام طلبك/);
    assert.ok(call.body.text.includes(id), "the request reference is in the message");
    assert.ok(!call.body.text.includes("SYN0000001"), "no passport number in the message");
    assert.deepEqual(call.body.attachments, []);

    // The reconciler never sends it again.
    await processPendingConfirmations({ limit: 500 });
    assert.equal(received.filter((c) => c.body.to === email).length, 1);
  });

  test("the provider is briefly down: retried by the reconciler with the same key, delivered once", async () => {
    const email = `retry-${uniqueSuffix()}@example.test`;
    reply = () => 503;
    const res = await submit(email);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const id = res.body.data.id;
    const pending = await emailRow(id, (row) => row.status === "PENDING" && row.attempts === 1);
    assert.equal(pending.lastError, "PROVIDER_EMAIL_HTTP_503");

    reply = () => 202;
    await prisma.customerMessageDelivery.update({ where: { id: pending.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    await processPendingConfirmations({ limit: 500 });
    const row = await emailRow(id);
    assert.equal(row.status, "ACCEPTED");
    assert.equal(row.attempts, 2);
    const calls = received.filter((c) => c.body.to === email);
    assert.equal(calls.length, 2, "one refused attempt, one accepted");
    assert.deepEqual(calls.map((c) => c.headers["idempotency-key"]), [row.id, row.id], "both attempts carry the delivery's own key");
    await processPendingConfirmations({ limit: 500 });
    assert.equal(received.filter((c) => c.body.to === email).length, 2, "no third send after acceptance");
  });

  test("competing senders while the provider is still answering: one HTTP request, one attempt", async () => {
    const email = `race-${uniqueSuffix()}@example.test`;
    const phone = normalizePhone(`0912${String(uniqueSuffix()).slice(-6)}`);
    // Stored like a request whose sender has not run yet (no background send).
    const stored = await prisma.contactRequest.create({
      data: { name: "عميل تجريبي", phone, phoneNormalized: phone, email, message: "طلب", customerMessages: pendingConfirmationCreate(phone, email) },
    });
    delayMs = 150;
    try {
      await Promise.all([
        sendRequestConfirmation(stored.id, { channel: "EMAIL" }),
        sendRequestConfirmation(stored.id, { channel: "EMAIL" }),
        processPendingConfirmations({ limit: 500 }),
      ]);
    } finally {
      delayMs = 0;
    }
    const row = await emailRow(stored.id);
    assert.equal(row.status, "ACCEPTED");
    assert.equal(row.attempts, 1);
    assert.equal(received.filter((c) => c.body.to === email).length, 1);
  });
});
