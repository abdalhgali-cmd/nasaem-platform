import "./env.js";
import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin } from "./helpers/api.js";

// This file gets its own process (and so its own fresh in-memory rate
// limiters) from node's test runner, independent of every other test file —
// see contactRequests.test.js's budget comments for why that separation
// matters. request-code's IP limiter allows 5 per window; this file spends
// exactly 5 of them (2 in the setup-heavy tests below, 3 more in the
// "must run last" boundary test), so no other test in this file may call
// POST /api/customer-auth/request-code.
let phoneCounter = 0;
function testPhone() {
  phoneCounter += 1;
  return `09${String(Date.now()).slice(-6)}${String(phoneCounter).padStart(2, "0")}`;
}

async function requestCode(phone) {
  const res = await request(app).post("/api/customer-auth/request-code").send({ phone });
  return res;
}

describe("customer auth (WhatsApp OTP login + request tracking)", () => {
  let adminAgent;

  before(async () => {
    adminAgent = await loginAsSuperAdmin();
  });

  test("full login flow: request code, verify, list only this phone's requests with friendly statuses", async () => {
    const phone = testPhone();

    const closedRes = await request(app).post("/api/contact-requests").send({
      name: "Closed Request Owner",
      phone,
      message: "طلب سابق تم إغلاقه بالفعل",
    });
    assert.equal(closedRes.status, 201);
    await adminAgent.patch(`/api/contact-requests/${closedRes.body.data.id}/status`).send({ status: "CLOSED" });

    const openRes = await request(app).post("/api/contact-requests").send({
      name: "Open Request Owner",
      phone,
      message: "طلب قيد المعالجة بدون مستندات بعد",
    });
    assert.equal(openRes.status, 201);

    const codeRes = await requestCode(phone);
    assert.equal(codeRes.status, 200);
    assert.ok(codeRes.body.data.loginCodeId);
    assert.match(codeRes.body.data.debugCode, /^\d{6}$/);

    const customerAgent = request.agent(app);
    const verifyRes = await customerAgent.post("/api/customer-auth/verify-code").send({
      loginCodeId: codeRes.body.data.loginCodeId,
      code: codeRes.body.data.debugCode,
    });
    assert.equal(verifyRes.status, 200);

    const meRes = await customerAgent.get("/api/customer-auth/me");
    assert.equal(meRes.status, 200);
    assert.ok(meRes.body.data.phone.endsWith(phone.slice(-9)));

    const mineRes = await customerAgent.get("/api/contact-requests/mine");
    assert.equal(mineRes.status, 200);
    assert.equal(mineRes.body.data.length, 2);

    const closed = mineRes.body.data.find((r) => r.id === closedRes.body.data.id);
    const open = mineRes.body.data.find((r) => r.id === openRes.body.data.id);
    assert.equal(closed.friendlyStatus.label, "مكتمل");
    assert.equal(open.friendlyStatus.label, "بانتظار المستندات");
    assert.equal(open.friendlyStatus.needsDocuments, true);

    // A staff-shaped route must reject this customer session — no `sub`/`id`
    // in the payload means requireAuth's own check already rejects it, but
    // exercise the explicit type==="customer" guard directly too by sending
    // the raw customer token as a Bearer header (the browser flow never
    // does this, but the guard should hold regardless of transport).
    const setCookie = verifyRes.headers["set-cookie"] || [];
    const customerCookie = setCookie.find((c) => c.startsWith("customerAccessToken="));
    const rawToken = customerCookie.split(";")[0].split("=")[1];
    const staffRouteWithCustomerToken = await request(app)
      .get("/api/contact-requests")
      .set("Authorization", `Bearer ${rawToken}`);
    assert.equal(staffRouteWithCustomerToken.status, 401);

    // And the reverse: a staff session (its own accessToken cookie, via its
    // own cookie jar) must not grant the customer-only /mine route either.
    const staffAgentOnCustomerRoute = await adminAgent.get("/api/contact-requests/mine");
    assert.equal(staffAgentOnCustomerRoute.status, 401);
  });

  test("wrong code increments attempts and locks out after 5 failures, even with the right code after", async () => {
    const phone = testPhone();
    const codeRes = await requestCode(phone);
    assert.equal(codeRes.status, 200);
    const { loginCodeId, debugCode } = codeRes.body.data;

    for (let i = 0; i < 5; i++) {
      const wrongRes = await request(app)
        .post("/api/customer-auth/verify-code")
        .send({ loginCodeId, code: "000000" === debugCode ? "111111" : "000000" });
      assert.equal(wrongRes.status, 400);
    }

    const tooLateRes = await request(app)
      .post("/api/customer-auth/verify-code")
      .send({ loginCodeId, code: debugCode });
    assert.equal(tooLateRes.status, 400);
  });

  test("unauthenticated access to /contact-requests/mine is rejected", async () => {
    const res = await request(app).get("/api/contact-requests/mine");
    assert.equal(res.status, 401);
  });

  test("rejects an unrecognized phone format", async () => {
    const res = await requestCode("not-a-phone");
    assert.equal(res.status, 400);
  });

  // Must run last: it deliberately exhausts request-code's rate-limit
  // window (5/15min/IP), so any later test in this file hitting that route
  // would otherwise see an unrelated 429. Two calls were already spent by
  // the tests above (full flow + lockout test), leaving exactly 3 before
  // the limiter trips.
  test("rate limiter blocks excessive code requests from the same client", async () => {
    let sawLimit = false;

    for (let i = 0; i < 5; i++) {
      const res = await requestCode(testPhone());

      if (res.status === 429) {
        sawLimit = true;
        break;
      }

      assert.equal(res.status, 200);
    }

    assert.ok(sawLimit, "expected a 429 response after exceeding the rate limit");
  });
});
