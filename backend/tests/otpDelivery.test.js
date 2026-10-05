import "./env.js";
import "./helpers/relaxAuthLimits.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { assertCanDeliverCode } from "../src/utils/phoneVerification.js";
import { app, request, uniqueSuffix } from "./helpers/api.js";

// One-time codes must (a) not be floodable per PHONE (the route limiters are per
// IP) and (b) never claim "sent" when no delivery channel exists.

const phone = () => `2499${uniqueSuffix().slice(-8)}`;

async function asProduction(fn) {
  const saved = { env: process.env.NODE_ENV, token: process.env.WHATSAPP_API_TOKEN, id: process.env.WHATSAPP_PHONE_NUMBER_ID };
  process.env.NODE_ENV = "production";
  delete process.env.WHATSAPP_API_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  try {
    return await fn();
  } finally {
    process.env.NODE_ENV = saved.env;
    if (saved.token !== undefined) process.env.WHATSAPP_API_TOKEN = saved.token;
    if (saved.id !== undefined) process.env.WHATSAPP_PHONE_NUMBER_ID = saved.id;
  }
}

describe("tracking login code", () => {
  test("EXPLOIT: one phone cannot be flooded with codes (per-phone throttle, not just per IP)", async () => {
    const target = phone();
    const statuses = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await request(app).post("/api/tracking/request-code").send({ phone: target })).status);
    assert.deepEqual(statuses.slice(0, 3), [200, 200, 200]);
    assert.ok(statuses.slice(3).every((status) => status === 429), `got ${statuses.join(",")}`);
    assert.equal(await prisma.contactRequestLoginCode.count({ where: { phone: target } }), 3, "no further codes were created");
  });
});

describe("no delivery channel", () => {
  test("EXPLOIT: with WhatsApp unconfigured (production), no code is created and the customer is told", async () => {
    const target = phone();
    await asProduction(async () => {
      const tracking = await request(app).post("/api/tracking/request-code").send({ phone: target });
      assert.equal(tracking.status, 503, JSON.stringify(tracking.body));
      assert.match(tracking.body.message, /التحقق/);
      const registration = await request(app).post("/api/customer-auth/request-registration-code").send({ phone: target });
      assert.equal(registration.status, 503);
      const reset = await request(app).post("/api/customer-auth/forgot-password").send({ phone: target });
      assert.equal(reset.status, 503);
    });
    assert.equal(await prisma.contactRequestLoginCode.count({ where: { phone: target } }), 0);
    assert.equal(await prisma.phoneVerification.count({ where: { phone: target } }), 0);
  });

  test("with WhatsApp configured the delivery check passes; in test/dev the code is exposed instead of sent", async () => {
    const saved = { env: process.env.NODE_ENV, token: process.env.WHATSAPP_API_TOKEN, id: process.env.WHATSAPP_PHONE_NUMBER_ID };
    try {
      process.env.NODE_ENV = "production";
      process.env.WHATSAPP_API_TOKEN = "dummy-token";
      process.env.WHATSAPP_PHONE_NUMBER_ID = "123456";
      assert.doesNotThrow(() => assertCanDeliverCode());
    } finally {
      process.env.NODE_ENV = saved.env;
      if (saved.token === undefined) delete process.env.WHATSAPP_API_TOKEN; else process.env.WHATSAPP_API_TOKEN = saved.token;
      if (saved.id === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID; else process.env.WHATSAPP_PHONE_NUMBER_ID = saved.id;
    }
    const res = await request(app).post("/api/tracking/request-code").send({ phone: phone() });
    assert.equal(res.status, 200);
    assert.ok(res.body.debugCode, "test env exposes the code");
  });
});
