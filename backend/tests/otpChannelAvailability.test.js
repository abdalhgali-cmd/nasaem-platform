import "./env.js";
import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { app, request, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";
import { normalizePhone } from "../src/utils/phone.js";
import { hashPassword } from "../src/utils/password.js";
import { requestLoginCode } from "../src/modules/contact-request-tracking/contact-request-tracking.service.js";

// A code is only promised when WhatsApp can carry it. These run with
// NODE_ENV=production (no debugCode shortcut), the way a real deployment
// behaves. The request-code limiter allows 5 calls per file; this file
// makes exactly 5.
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function configureWhatsApp(fetchImpl) {
  process.env.WHATSAPP_API_TOKEN = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "12345";
  delete process.env.WHATSAPP_TEMPLATE_NAME;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return fetchImpl();
  };
  return calls;
}

async function setWhatsAppFlag(enabled) {
  await prisma.featureFlag.upsert({ where: { key: "WHATSAPP" }, update: { enabled }, create: { key: "WHATSAPP", enabled } });
}

async function activeCodes(localPhone) {
  return prisma.contactRequestLoginCode.findMany({
    where: { phone: normalizePhone(localPhone), consumedAt: null, expiresAt: { gt: new Date() } },
  });
}

const CLAIMS_DELIVERY = /تم إرسال|وصل(?!ك خلال)|سيصلك/;

describe("tracking OTP: no success claimed for a code that cannot be delivered", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "production";
    delete process.env.WHATSAPP_API_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  });
  afterEach(async () => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    await setWhatsAppFlag(true);
  });

  test("WhatsApp not configured → 503 OTP_CHANNEL_UNAVAILABLE, no code created", async () => {
    const phone = `0971${uniqueSuffix()}`;
    const res = await request(app).post("/api/tracking/request-code").send({ phone });
    assert.equal(res.status, 503, JSON.stringify(res.body));
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, "OTP_CHANNEL_UNAVAILABLE");
    assert.equal(res.body.debugCode, undefined);
    assert.match(res.body.message, /تواصل معنا/, "points to a human support path");
    assert.equal((await activeCodes(phone)).length, 0);
  });

  test("WhatsApp switched off by the feature flag → 503, nothing sent, no code", async () => {
    const calls = configureWhatsApp(() => ({ ok: true, json: async () => ({ messages: [{ id: "x" }] }) }));
    await setWhatsAppFlag(false);
    const phone = `0972${uniqueSuffix()}`;
    const res = await request(app).post("/api/tracking/request-code").send({ phone });
    assert.equal(res.status, 503, JSON.stringify(res.body));
    assert.equal(res.body.code, "OTP_CHANNEL_UNAVAILABLE");
    assert.equal(calls.length, 0);
    assert.equal((await activeCodes(phone)).length, 0);
  });

  test("provider rejects the message → 503 OTP_DELIVERY_FAILED and the code is withdrawn", async () => {
    configureWhatsApp(() => ({ ok: false, status: 500, text: async () => "boom" }));
    const phone = `0973${uniqueSuffix()}`;
    const res = await request(app).post("/api/tracking/request-code").send({ phone });
    assert.equal(res.status, 503, JSON.stringify(res.body));
    assert.equal(res.body.code, "OTP_DELIVERY_FAILED");
    assert.equal((await activeCodes(phone)).length, 0, "an undelivered code can't be used");
    const rows = await prisma.contactRequestLoginCode.findMany({ where: { phone: normalizePhone(phone) } });
    assert.equal(rows.length, 1);
    const verify = await request(app).post("/api/tracking/verify-code").send({ phone, code: rows[0].code });
    assert.equal(verify.status, 400, "the withdrawn code does not log in");
  });

  test("provider unreachable → 503 OTP_DELIVERY_FAILED", async () => {
    configureWhatsApp(() => {
      throw new Error("ECONNRESET");
    });
    const phone = `0974${uniqueSuffix()}`;
    const res = await request(app).post("/api/tracking/request-code").send({ phone });
    assert.equal(res.status, 503);
    assert.equal(res.body.code, "OTP_DELIVERY_FAILED");
    assert.equal((await activeCodes(phone)).length, 0);
  });

  test("provider accepts → 200 with honest wording, no debug code in production", async () => {
    const calls = configureWhatsApp(() => ({ ok: true, json: async () => ({ messages: [{ id: "wamid.1" }] }) }));
    const phone = `0975${uniqueSuffix()}`;
    const res = await request(app).post("/api/tracking/request-code").send({ phone });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.delivery, "ACCEPTED");
    assert.equal(res.body.debugCode, undefined);
    assert.doesNotMatch(res.body.message, CLAIMS_DELIVERY);
    assert.equal(calls.length, 1);
    assert.equal((await activeCodes(phone)).length, 1);
  });

  test("local development without WhatsApp keeps the debug-code flow", async () => {
    process.env.NODE_ENV = "development";
    const result = await requestLoginCode(`0976${uniqueSuffix()}`);
    assert.equal(result.delivery, "DEBUG_ONLY");
    assert.match(result.debugCode, /^\d{6}$/);
  });
});

describe("password reset OTP: same rule, without revealing which numbers have accounts", () => {
  afterEach(async () => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  async function makeCustomer() {
    const suffix = uniqueSuffix();
    const phone = `2496${suffix}`;
    const customer = await prisma.customer.create({
      data: { customerNo: `OTP-${suffix}`, fullName: `OTP Customer ${suffix}`, phone, passwordHash: await hashPassword("Test@12345") },
    });
    return { phone, customer };
  }

  test("channel unavailable → the same 503 for a registered and an unknown number", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.WHATSAPP_API_TOKEN;
    const { phone, customer } = await makeCustomer();
    const known = await request(app).post("/api/customer-auth/forgot-password").send({ phone });
    const unknown = await request(app).post("/api/customer-auth/forgot-password").send({ phone: `2496${uniqueSuffix()}` });
    for (const res of [known, unknown]) {
      assert.equal(res.status, 503, JSON.stringify(res.body));
      assert.equal(res.body.code, "OTP_CHANNEL_UNAVAILABLE");
    }
    assert.deepEqual(known.body, unknown.body);
    const after = await prisma.customer.findUnique({ where: { id: customer.id } });
    assert.equal(after.passwordResetCode, null, "no reset code was created");
  });

  test("provider rejects → the stored reset code is withdrawn", async () => {
    process.env.NODE_ENV = "production";
    configureWhatsApp(() => ({ ok: false, status: 400, text: async () => "bad" }));
    const { phone, customer } = await makeCustomer();
    const res = await request(app).post("/api/customer-auth/forgot-password").send({ phone });
    assert.equal(res.status, 200, "generic answer — does not reveal the account");
    assert.doesNotMatch(res.body.message, CLAIMS_DELIVERY);
    let after;
    for (let i = 0; i < 50; i += 1) {
      after = await prisma.customer.findUnique({ where: { id: customer.id } });
      if (!after.passwordResetCode) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(after.passwordResetCode, null);
  });
});
