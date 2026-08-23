import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, uniqueSuffix } from "./helpers/api.js";

async function submitContactRequest(phone, overrides = {}) {
  const res = await request(app)
    .post("/api/contact-requests")
    .send({
      name: "Tracking Test User",
      phone,
      message: "استفسار عن رحلة عمرة",
      ...overrides,
    });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.id;
}

describe("contact request tracking (customer WhatsApp-OTP login)", () => {
  test("rejects an unauthenticated request to list tracked requests", async () => {
    const res = await request(app).get("/api/tracking/requests");
    assert.equal(res.status, 401);
  });

  test("rejects verify-code without ever requesting one", async () => {
    const phone = `091${uniqueSuffix()}`;

    const res = await request(app)
      .post("/api/tracking/verify-code")
      .send({ phone, code: "123456" });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  test("full login flow: request code -> verify -> list own requests", async () => {
    const suffix = uniqueSuffix();
    const localPhone = `091${suffix}`;
    const contactRequestId = await submitContactRequest(localPhone);

    const requestRes = await request(app)
      .post("/api/tracking/request-code")
      .send({ phone: localPhone });

    assert.equal(requestRes.status, 200);
    assert.equal(requestRes.body.success, true);
    assert.ok(requestRes.body.debugCode, "expected debugCode in NODE_ENV=test");

    const agent = request.agent(app);
    const normalizedPhone = `+249${localPhone.slice(1)}`;

    const wrongCodeRes = await agent
      .post("/api/tracking/verify-code")
      .send({ phone: normalizedPhone, code: "000000" });
    assert.equal(wrongCodeRes.status, 400);

    const verifyRes = await agent
      .post("/api/tracking/verify-code")
      .send({ phone: normalizedPhone, code: requestRes.body.debugCode });

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.success, true);

    const listRes = await agent.get("/api/tracking/requests");
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body.data));
    assert.ok(listRes.body.data.some((r) => r.id === contactRequestId));

    const trackedRequest = listRes.body.data.find((r) => r.id === contactRequestId);
    assert.equal(trackedRequest.statusLabel, "تم استلام طلبك وهو قيد المراجعة");
    assert.ok(Array.isArray(trackedRequest.paymentAccounts));
    assert.equal(trackedRequest.paymentCurrency, null);

    const logoutRes = await agent.post("/api/tracking/logout");
    assert.equal(logoutRes.status, 200);

    const afterLogoutRes = await agent.get("/api/tracking/requests");
    assert.equal(afterLogoutRes.status, 401);
  });

  test("a reused (already-consumed) code is rejected", async () => {
    const suffix = uniqueSuffix();
    const localPhone = `092${suffix}`;
    await submitContactRequest(localPhone);

    const requestRes = await request(app)
      .post("/api/tracking/request-code")
      .send({ phone: localPhone });
    const code = requestRes.body.debugCode;

    const firstVerify = await request(app)
      .post("/api/tracking/verify-code")
      .send({ phone: localPhone, code });
    assert.equal(firstVerify.status, 200);

    const secondVerify = await request(app)
      .post("/api/tracking/verify-code")
      .send({ phone: localPhone, code });
    assert.equal(secondVerify.status, 400);
  });

  test("requesting a new code invalidates the previous one", async () => {
    const suffix = uniqueSuffix();
    const localPhone = `093${suffix}`;

    const firstRequest = await request(app)
      .post("/api/tracking/request-code")
      .send({ phone: localPhone });
    const staleCode = firstRequest.body.debugCode;

    await request(app).post("/api/tracking/request-code").send({ phone: localPhone });

    const verifyWithStaleCode = await request(app)
      .post("/api/tracking/verify-code")
      .send({ phone: localPhone, code: staleCode });

    assert.equal(verifyWithStaleCode.status, 400);
  });

  test("a tracked list only ever contains requests for that phone", async () => {
    const suffixA = uniqueSuffix();
    const suffixB = `${uniqueSuffix()}9`;
    const phoneA = `094${suffixA}`;
    const phoneB = `095${suffixB}`;

    const idA = await submitContactRequest(phoneA);
    await submitContactRequest(phoneB);

    const requestRes = await request(app)
      .post("/api/tracking/request-code")
      .send({ phone: phoneA });

    const agent = request.agent(app);
    await agent
      .post("/api/tracking/verify-code")
      .send({ phone: phoneA, code: requestRes.body.debugCode });

    const listRes = await agent.get("/api/tracking/requests");
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.data.every((r) => r.id !== undefined));
    assert.ok(listRes.body.data.some((r) => r.id === idA));
    assert.equal(listRes.body.data.length, 1, "should only see the request submitted with this exact phone");
  });

  test("validation rejects a malformed code", async () => {
    const res = await request(app)
      .post("/api/tracking/verify-code")
      .send({ phone: "0912345678", code: "abc" });

    assert.equal(res.status, 400);
  });
});
