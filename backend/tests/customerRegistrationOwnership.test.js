import "./env.js";
import "./helpers/relaxAuthLimits.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// Security regression suite: a customer account may only be created for (or
// linked to) a phone number whose owner has proven possession of it with a
// one-time code. Previously POST /api/customer-auth/register attached a
// password to ANY existing Customer row found by phone — so anyone who knew a
// customer's phone number could take over that customer's portal (requests,
// passports, documents, payments).
//
// Each test file runs in its own process, so the in-memory rate limiters
// start fresh; keep the number of code requests per file modest.

const PASSWORD = "Attacker@12345";

async function requestCode(phone) {
  return request(app).post("/api/customer-auth/request-registration-code").send({ phone });
}

async function registerWith(phone, code, extra = {}) {
  return request(app)
    .post("/api/customer-auth/register")
    .send({ fullName: "Test Person", phone, password: PASSWORD, ...(code === undefined ? {} : { code }), ...extra });
}

describe("customer registration requires phone ownership proof", () => {
  let admin;

  before(async () => {
    admin = await loginAsSuperAdmin();
  });

  async function staffCustomer(phone) {
    const res = await admin.post("/api/customers").send({
      fullName: "Staff Created Customer",
      passportNo: `OWN${uniqueSuffix()}`,
      nationality: "Sudan",
      phone,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.data;
  }

  test("EXPLOIT: knowing an existing customer's phone is not enough to claim the record", async () => {
    const phone = `2499${uniqueSuffix().slice(-8)}`;
    const victim = await staffCustomer(phone);

    const res = await registerWith(phone, undefined);
    assert.notEqual(res.status, 201, "registration without proof of phone ownership must not succeed");
    assert.ok(!(res.headers["set-cookie"] || []).some((c) => c.startsWith("customerAccessToken")), "no session may be issued");

    const row = await prisma.customer.findUnique({ where: { id: victim.id }, select: { passwordHash: true } });
    assert.equal(row.passwordHash, null, "the victim record must remain unclaimed");
  });

  test("a brand-new phone cannot be registered without a code either", async () => {
    const res = await registerWith(`2499${uniqueSuffix().slice(-8)}`, undefined);
    assert.equal(res.status, 400);
  });

  test("a wrong code is rejected and a code is bound to its own phone", async () => {
    const phoneA = `2499${uniqueSuffix().slice(-8)}`;
    const phoneB = `2498${uniqueSuffix().slice(-8)}`;
    const a = await requestCode(phoneA);
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.ok(a.body.debugCode, "test env exposes the code");

    assert.equal((await registerWith(phoneA, "000000")).status, 400);
    // phoneA's valid code must not authorize phoneB
    assert.equal((await registerWith(phoneB, a.body.debugCode)).status, 400);
  });

  test("a valid code links the owner to the existing record and preserves it", async () => {
    const phone = `2499${uniqueSuffix().slice(-8)}`;
    const existing = await staffCustomer(phone);

    const code = (await requestCode(phone)).body.debugCode;
    const res = await registerWith(phone, code);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.customer.id, existing.id, "legitimate owner keeps the existing record");

    const login = await request(app).post("/api/customer-auth/login").send({ identifier: phone, password: PASSWORD });
    assert.equal(login.status, 200);
  });

  test("a code is single-use", async () => {
    const phone = `2499${uniqueSuffix().slice(-8)}`;
    const code = (await requestCode(phone)).body.debugCode;
    assert.equal((await registerWith(phone, code)).status, 201);
    const replay = await registerWith(phone, code, { password: "Replayed@12345" });
    assert.equal(replay.status, 400, "a spent code is simply invalid (and reveals nothing about the account)");
    const login = await request(app).post("/api/customer-auth/login").send({ identifier: phone, password: "Replayed@12345" });
    assert.equal(login.status, 401, "the replay must not have changed the password");
  });

  test("five wrong guesses burn the code", async () => {
    const phone = `2499${uniqueSuffix().slice(-8)}`;
    const code = (await requestCode(phone)).body.debugCode;
    const wrong = code === "111111" ? "222222" : "111111";
    for (let i = 0; i < 5; i += 1) assert.equal((await registerWith(phone, wrong)).status, 400);
    assert.equal((await registerWith(phone, code)).status, 400, "the real code no longer works after too many failures");
  });

  test("a tracking (login) OTP cannot be used to register an account", async () => {
    const phone = `2499${uniqueSuffix().slice(-8)}`;
    const tracking = await request(app).post("/api/tracking/request-code").send({ phone });
    assert.equal(tracking.status, 200, JSON.stringify(tracking.body));
    assert.ok(tracking.body.data?.debugCode || tracking.body.debugCode);
    const trackingCode = tracking.body.data?.debugCode || tracking.body.debugCode;
    assert.equal((await registerWith(phone, trackingCode)).status, 400);
  });

  test("ambiguous duplicate unclaimed records are refused instead of guessed", async () => {
    const phone = `2499${uniqueSuffix().slice(-8)}`;
    await staffCustomer(phone);
    await staffCustomer(phone);
    const code = (await requestCode(phone)).body.debugCode;
    const res = await registerWith(phone, code);
    assert.equal(res.status, 409);
  });

  test("an already-claimed phone is still refused even with a valid code", async () => {
    const phone = `2499${uniqueSuffix().slice(-8)}`;
    assert.equal((await registerWith(phone, (await requestCode(phone)).body.debugCode)).status, 201);
    const second = await requestCode(phone);
    // Requesting a code for a taken phone must not reveal that it is taken.
    assert.equal(second.status, 200);
    assert.equal((await registerWith(phone, second.body.debugCode, { fullName: "Someone Else" })).status, 409);
  });

  test("code requests are throttled per phone", async () => {
    const phone = `2499${uniqueSuffix().slice(-8)}`;
    const statuses = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await requestCode(phone)).status);
    assert.ok(statuses.includes(429), `expected a 429 within 5 rapid requests, got ${statuses.join(",")}`);
  });
});
