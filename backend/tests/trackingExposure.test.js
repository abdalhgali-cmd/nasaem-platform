import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request, uniqueSuffix } from "./helpers/api.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

// Knowing a request number, or a phone number, must never be enough to read a
// request: the phone has to be verified with its one-time code first.
describe("tracking exposes nothing without the verification flow", () => {
  test("submitting a request returns only its number and a delivery notice - no stored data", async () => {
    const phone = `091${uniqueSuffix()}`.slice(0, 13);
    const res = await request(app).post("/api/contact-requests").send({ name: "Exposure Check", phone, message: "طلب لاختبار التسريب" });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.deepEqual(Object.keys(res.body.data).sort(), ["customerConfirmation", "id"]);
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes(phone) && !text.includes("Exposure Check"));
  });

  test("a request id or a phone number alone reads nothing", async () => {
    const phone = `092${uniqueSuffix()}`.slice(0, 13);
    const created = await request(app).post("/api/contact-requests").send({ name: "Id Only", phone, message: "طلب لاختبار المعرّف فقط" });
    const id = created.body.data.id;

    for (const path of [
      "/api/tracking/requests",
      `/api/tracking/requests/${id}/documents/x/file`,
      `/api/tracking/requests/${id}/deliverables/x/file`,
      "/api/tracking/payment-accounts?currency=SAR",
      "/api/payment-accounts/public/active?currency=SAR",
      "/api/tracking/reusable-documents",
      `/api/contact-requests/${id}`,
      `/api/customer/requests/${id}`,
    ]) {
      const res = await request(app).get(path);
      assert.equal(res.status, 401, `${path} must require verification`);
    }
    for (const path of [`/api/tracking/requests/${id}/invoice/approve`, `/api/tracking/requests/${id}/payment-receipt`, `/api/tracking/requests/${id}/documents`]) {
      assert.equal((await request(app).post(path).send({})).status, 401, path);
    }
    assert.equal((await request(app).get("/api/tracking/requests").set("Authorization", `Bearer ${phone}`)).status, 401);
    assert.equal((await request(app).get("/api/tracking/requests").set("Authorization", "Bearer forged.jwt.value")).status, 401);
  });

  test("a wrong code gives no session, and a verified phone sees only its own requests and files", async () => {
    const phoneA = `093${uniqueSuffix()}`.slice(0, 13);
    const phoneB = `094${uniqueSuffix()}`.slice(0, 13);
    const a = await request(app).post("/api/contact-requests").send({ name: "Owner A", phone: phoneA, message: "طلب المالك الأول" });
    const b = await request(app).post("/api/contact-requests").send({ name: "Owner B", phone: phoneB, message: "طلب المالك الثاني" });

    const code = await request(app).post("/api/tracking/request-code").send({ phone: phoneA });
    const wrongCode = code.body.debugCode === "000000" ? "111111" : "000000";
    const wrong = await request(app).post("/api/tracking/verify-code").send({ phone: phoneA, code: wrongCode });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.data, undefined, "a wrong code never yields a token");
    assert.ok(!(wrong.headers["set-cookie"] || []).some((cookie) => cookie.startsWith("trackingAccessToken")));

    const verify = await request(app).post("/api/tracking/verify-code").send({ phone: phoneA, code: code.body.debugCode });
    assert.equal(verify.status, 200, JSON.stringify(verify.body));
    const auth = { Authorization: `Bearer ${verify.body.data.token}` };

    const mine = await request(app).get("/api/tracking/requests").set(auth);
    assert.equal(mine.status, 200);
    const ids = mine.body.data.map((row) => row.id);
    assert.ok(ids.includes(a.body.data.id));
    assert.ok(!ids.includes(b.body.data.id), "another phone's request is never listed");
    assert.equal((await request(app).post(`/api/tracking/requests/${b.body.data.id}/invoice/approve`).set(auth)).status, 404);
    assert.equal(
      (await request(app).post(`/api/tracking/requests/${b.body.data.id}/payment-receipt`).set(auth).attach("file", PNG, { filename: "x.png", contentType: "image/png" })).status,
      404
    );
    assert.equal(await prisma.contactRequestDocument.count({ where: { contactRequestId: b.body.data.id } }), 0, "nothing was added to the other phone's request");
  });
});
