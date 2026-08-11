import "./env.js";
import { afterEach, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_FIXTURE = path.join(__dirname, "fixtures", "passport-mrz-sample.png");

// Own process (own fresh in-memory rate limiters), independent of every
// other test file — see contactRequests.test.js's budget comments. This
// file spends exactly 5 of publicContactLimiter's 5 POST /contact-requests
// (one each for the two standalone tests, two for the PATCH describe
// block's shared before(), one for the CONFIRMED-transition test) — no
// other test in this file may call POST /contact-requests. Document uploads
// go through the separate publicFileLimiter (30/15min), which this file
// uses well under budget.
describe("contact request documents (per-document review status)", () => {
  let adminAgent;
  const suffix = uniqueSuffix();

  before(async () => {
    adminAgent = await loginAsSuperAdmin();
  });

  async function createContactRequest(nameSuffix) {
    const res = await request(app).post("/api/contact-requests").send({
      name: `Document Review Test ${nameSuffix}`,
      phone: `097${suffix}${nameSuffix}`,
      message: "طلب لاختبار مراجعة المستندات",
    });
    assert.equal(res.status, 201);
    return res.body.data.id;
  }

  test("uploading in two batches appends rows instead of replacing them", async () => {
    const id = await createContactRequest("1");

    const firstBatch = await request(app)
      .post(`/api/contact-requests/${id}/passport-image`)
      .attach("images", IMAGE_FIXTURE)
      .attach("images", IMAGE_FIXTURE);
    assert.equal(firstBatch.status, 200);

    const secondBatch = await request(app)
      .post(`/api/contact-requests/${id}/passport-image`)
      .attach("images", IMAGE_FIXTURE)
      .attach("images", IMAGE_FIXTURE);
    assert.equal(secondBatch.status, 200);

    const listRes = await adminAgent.get(`/api/contact-requests/${id}/documents`);
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.data.length, 4);
    assert.ok(listRes.body.data.every((d) => d.type === "PASSPORT" && d.status === "PENDING"));
  });

  test("GET /:id/documents is role-gated", async () => {
    const id = await createContactRequest("2");
    await request(app).post(`/api/contact-requests/${id}/passport-image`).attach("images", IMAGE_FIXTURE);

    const unauthRes = await request(app).get(`/api/contact-requests/${id}/documents`);
    assert.equal(unauthRes.status, 401);
  });

  describe("PATCH /:id/documents/:documentId/status", () => {
    let contactRequestId;
    let documentId;
    let otherContactRequestId;

    // Both requests are created once for the whole block (not per test) to
    // stay inside this file's 5-per-window POST /contact-requests budget —
    // each test instead uploads its own fresh document below, which only
    // spends publicFileLimiter's much larger budget.
    before(async () => {
      contactRequestId = await createContactRequest(`p${uniqueSuffix()}`.slice(-6));
      otherContactRequestId = await createContactRequest(`o${uniqueSuffix()}`.slice(-6));
    });

    beforeEach(async () => {
      const uploadRes = await request(app)
        .post(`/api/contact-requests/${contactRequestId}/passport-image`)
        .attach("images", IMAGE_FIXTURE);
      assert.equal(uploadRes.status, 200);

      const listRes = await adminAgent.get(`/api/contact-requests/${contactRequestId}/documents`);
      documentId = listRes.body.data[listRes.body.data.length - 1].id;
    });

    test("ACCEPTED with no reason succeeds", async () => {
      const res = await adminAgent
        .patch(`/api/contact-requests/${contactRequestId}/documents/${documentId}/status`)
        .send({ status: "ACCEPTED" });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, "ACCEPTED");
    });

    test("REJECTED with no reason is rejected by validation", async () => {
      const res = await adminAgent
        .patch(`/api/contact-requests/${contactRequestId}/documents/${documentId}/status`)
        .send({ status: "REJECTED" });
      assert.equal(res.status, 400);
    });

    test("REJECTED with a reason succeeds and sends a WhatsApp notification with the type label + reason", async () => {
      const originalFetch = globalThis.fetch;
      const originalToken = process.env.WHATSAPP_API_TOKEN;
      const originalPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      process.env.WHATSAPP_API_TOKEN = "test-token";
      process.env.WHATSAPP_PHONE_NUMBER_ID = "12345";

      const fetchCalls = [];
      globalThis.fetch = async (url, options) => {
        fetchCalls.push({ url, options });
        return { ok: true, text: async () => "" };
      };

      try {
        const res = await adminAgent
          .patch(`/api/contact-requests/${contactRequestId}/documents/${documentId}/status`)
          .send({ status: "REJECTED", rejectionReason: "الصورة غير واضحة" });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.status, "REJECTED");
        assert.equal(res.body.data.rejectionReason, "الصورة غير واضحة");

        // The WhatsApp send is fire-and-forget (not awaited by the request
        // handler) — give its microtask chain a tick to complete.
        await new Promise((resolve) => setTimeout(resolve, 50));

        assert.equal(fetchCalls.length, 1);
        const body = JSON.parse(fetchCalls[0].options.body);
        assert.match(body.text.body, /صورة جواز السفر/);
        assert.match(body.text.body, /الصورة غير واضحة/);
      } finally {
        globalThis.fetch = originalFetch;
        process.env.WHATSAPP_API_TOKEN = originalToken;
        process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneId;
      }
    });

    test("a documentId belonging to a different contact request 404s", async () => {
      const res = await adminAgent
        .patch(`/api/contact-requests/${otherContactRequestId}/documents/${documentId}/status`)
        .send({ status: "ACCEPTED" });
      assert.equal(res.status, 404);
    });

    test("an unknown documentId 404s", async () => {
      const res = await adminAgent
        .patch(`/api/contact-requests/${contactRequestId}/documents/does-not-exist/status`)
        .send({ status: "ACCEPTED" });
      assert.equal(res.status, 404);
    });

    test("unauthenticated request is rejected", async () => {
      const res = await request(app)
        .patch(`/api/contact-requests/${contactRequestId}/documents/${documentId}/status`)
        .send({ status: "ACCEPTED" });
      assert.equal(res.status, 401);
    });
  });

  describe("updatePaymentStatus CONFIRMED transition notification", () => {
    let originalFetch;
    let originalToken;
    let originalPhoneId;
    let fetchCalls;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      originalToken = process.env.WHATSAPP_API_TOKEN;
      originalPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      process.env.WHATSAPP_API_TOKEN = "test-token";
      process.env.WHATSAPP_PHONE_NUMBER_ID = "12345";

      fetchCalls = [];
      globalThis.fetch = async (url, options) => {
        fetchCalls.push({ url, options });
        return { ok: true, text: async () => "" };
      };
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      process.env.WHATSAPP_API_TOKEN = originalToken;
      process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneId;
    });

    test("fires once on the transition into CONFIRMED, and not again on a redundant re-PATCH", async () => {
      const id = await createContactRequest(`c${uniqueSuffix()}`.slice(-6));

      const firstRes = await adminAgent.patch(`/api/contact-requests/${id}/payment-status`).send({
        status: "CONFIRMED",
      });
      assert.equal(firstRes.status, 200);

      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(fetchCalls.length, 1);

      const secondRes = await adminAgent.patch(`/api/contact-requests/${id}/payment-status`).send({
        status: "CONFIRMED",
      });
      assert.equal(secondRes.status, 200);

      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(fetchCalls.length, 1);
    });
  });
});
