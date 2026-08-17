import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// logActivity() is fire-and-forget (not awaited) by the same convention used
// everywhere else in this codebase, so the write can still be in flight when
// our POST response comes back. Poll briefly instead of asserting instantly.
async function waitFor(assertion, { tries = 10, delayMs = 100 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (i === tries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

describe("contact requests", () => {
  let adminAgent;
  const suffix = uniqueSuffix();

  before(async () => {
    adminAgent = await loginAsSuperAdmin();
  });

  test("creates a contact request from an unauthenticated request", async () => {
    const res = await request(app).post("/api/contact-requests").send({
      name: "Ahmed Test",
      phone: `091${suffix}1`,
      email: "ahmed@example.com",
      service: "باقة عمرة",
      message: "أرغب في الاستفسار عن باقات العمرة المتاحة هذا الشهر",
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.id);
  });

  test("rejects invalid payloads with field-level errors", async () => {
    const res = await request(app).post("/api/contact-requests").send({
      name: "A",
      phone: "1",
      message: "hi",
    });

    assert.equal(res.status, 400);
    assert.ok(res.body.errors.fieldErrors.name);
    assert.ok(res.body.errors.fieldErrors.phone);
    assert.ok(res.body.errors.fieldErrors.message);
  });

  test("honeypot field is accepted but silently discards the submission", async () => {
    const beforeList = await adminAgent.get("/api/contact-requests?limit=1");
    const totalBefore = beforeList.body.meta.total;

    const res = await request(app).post("/api/contact-requests").send({
      name: "Bot",
      phone: `092${suffix}2`,
      message: "this is a spam submission from an automated bot",
      website: "http://spam.example",
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.data, undefined);

    const afterList = await adminAgent.get("/api/contact-requests?limit=1");
    assert.equal(afterList.body.meta.total, totalBefore);
  });

  test("requires authentication to list or update contact requests", async () => {
    const listRes = await request(app).get("/api/contact-requests");
    assert.equal(listRes.status, 401);

    const patchRes = await request(app)
      .patch("/api/contact-requests/nonexistent-id/status")
      .send({ status: "CONTACTED" });
    assert.equal(patchRes.status, 401);
  });

  test("SUPER_ADMIN can find, review activity for, and update a submitted request", async () => {
    const phone = `093${suffix}3`;
    const createRes = await request(app).post("/api/contact-requests").send({
      name: "Fatima Test",
      phone,
      message: "استفسار عن حجز فندق في مكة المكرمة لمدة أسبوع",
    });
    assert.equal(createRes.status, 201);
    const id = createRes.body.data.id;

    const listRes = await adminAgent.get("/api/contact-requests?status=NEW&limit=50");
    assert.equal(listRes.status, 200);
    const found = listRes.body.data.find((item) => item.id === id);
    assert.ok(found, "expected the newly created request to appear in the NEW-status list");
    assert.equal(found.phone, phone);

    await waitFor(async () => {
      const activityRes = await adminAgent.get("/api/activity-logs?limit=50");
      assert.equal(activityRes.status, 200);
      const logged = activityRes.body.data.find(
        (entry) => entry.action === "CONTACT_REQUEST_RECEIVED" && entry.entityId === id
      );
      assert.ok(logged, "expected a CONTACT_REQUEST_RECEIVED activity log entry");
    });

    const patchRes = await adminAgent
      .patch(`/api/contact-requests/${id}/status`)
      .send({ status: "CONTACTED" });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.data.status, "CONTACTED");

    const badStatusRes = await adminAgent
      .patch(`/api/contact-requests/${id}/status`)
      .send({ status: "NOT_A_REAL_STATUS" });
    assert.equal(badStatusRes.status, 400);
  });

  test("updating an unknown contact request returns 404", async () => {
    const res = await adminAgent
      .patch("/api/contact-requests/does-not-exist/status")
      .send({ status: "CLOSED", outcome: "COMPLETED" });
    assert.equal(res.status, 404);
  });

  test("creating a contact request notifies active admins", async () => {
    const phone = `094${suffix}4`;
    const createRes = await request(app).post("/api/contact-requests").send({
      name: "Notification Test",
      phone,
      message: "رسالة اختبار للتأكد من إرسال إشعار للمسؤولين",
    });
    assert.equal(createRes.status, 201);

    const notificationsRes = await adminAgent.get("/api/notifications?limit=50");
    assert.equal(notificationsRes.status, 200);
    const notified = notificationsRes.body.data.find(
      (n) => n.type === "CONTACT_REQUEST" && n.message.includes(phone)
    );
    assert.ok(notified, "expected an admin notification for the new contact request");
  });

  // Must run last: it deliberately exhausts this endpoint's rate-limit
  // window, so any later test in this file that hits the same route would
  // otherwise see an unrelated 429.
  test("rate limiter blocks excessive public submissions from the same client", async () => {
    let sawLimit = false;

    for (let i = 0; i < 10; i++) {
      const res = await request(app).post("/api/contact-requests").send({
        name: "Rate Limit Test",
        phone: `095${suffix}${i}`,
        message: "testing that the public contact endpoint enforces a request limit",
      });

      if (res.status === 429) {
        sawLimit = true;
        break;
      }

      assert.equal(res.status, 201);
    }

    assert.ok(sawLimit, "expected a 429 response after exceeding the rate limit");
  });
});
