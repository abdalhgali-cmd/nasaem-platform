import "./env.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import { terminateOcrWorker } from "../src/modules/passport-ocr/passport-ocr.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MRZ_FIXTURE = path.join(__dirname, "fixtures", "passport-mrz-sample.png");
const NO_MRZ_FIXTURE = path.join(__dirname, "fixtures", "no-mrz-sample.png");

// This file gets its own process (and so its own fresh in-memory rate
// limiters) from node's test runner, independent of contactRequests.test.js
// — see that file's budget comments for why that separation matters. Kept
// to 4 of the 5 allowed POST /api/contact-requests calls and well under the
// 10 allowed file-upload calls.
describe("contact request payment flow (Umrah bank-transfer)", () => {
  let adminAgent;
  const suffix = uniqueSuffix();

  before(async () => {
    adminAgent = await loginAsSuperAdmin();
  });

  // Without this, the Tesseract workers spun up by the passport-scan tests
  // below keep this test file's process alive indefinitely (node --test
  // never sees it exit) — same requirement as passportOcr.test.js.
  after(async () => {
    await terminateOcrWorker();
  });

  test("rejects SDG currency while no exchange rate is configured yet", async () => {
    const res = await request(app).post("/api/contact-requests").send({
      name: "SDG No Rate Test",
      phone: `098${suffix}1`,
      service: "عمرة",
      currency: "SDG",
      details: { "نوع الباقة": "تأشيرة عمرة فقط" },
    });

    assert.equal(res.status, 422);
  });

  test("SUPER_ADMIN configures the exchange rate and bank accounts, exposed publicly", async () => {
    const rateRes = await adminAgent.post("/api/settings").send({ key: "sar_to_sdg_rate", value: "135" });
    assert.equal(rateRes.status, 200);
    await adminAgent.post("/api/settings").send({ key: "bank_account_sar", value: "Test Bank SAR - 111" });
    await adminAgent.post("/api/settings").send({ key: "bank_account_sdg", value: "Test Bank SDG - 222" });

    const publicRes = await request(app).get("/api/settings/payment-info");
    assert.equal(publicRes.status, 200);
    assert.equal(publicRes.body.data.sarToSdgRate, 135);
    assert.equal(publicRes.body.data.bankAccounts.SAR, "Test Bank SAR - 111");
    assert.equal(publicRes.body.data.bankAccounts.SDG, "Test Bank SDG - 222");
  });

  test("creates a priced Umrah request in SAR with a reference number and bank account", async () => {
    const res = await request(app).post("/api/contact-requests").send({
      name: "Umrah SAR Test",
      phone: `098${suffix}2`,
      service: "عمرة",
      currency: "SAR",
      details: { "نوع الباقة": "عمرة مع الخدمات", "اسم الضامن": "Test Guarantor" },
    });

    assert.equal(res.status, 201);
    assert.match(res.body.data.referenceNumber, /^NH-\d{4}-\d{5}$/);
    assert.equal(res.body.data.paymentAmount, "4500");
    assert.equal(res.body.data.paymentStatus, "AWAITING_TRANSFER");
    assert.equal(res.body.data.bankAccount, "Test Bank SAR - 111");
  });

  test("converts to SDG using the configured exchange rate", async () => {
    const res = await request(app).post("/api/contact-requests").send({
      name: "Umrah SDG Test",
      phone: `098${suffix}3`,
      service: "عمرة",
      currency: "SDG",
      details: { "نوع الباقة": "تأشيرة عمرة فقط" },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.paymentAmount, "162000");
    assert.equal(res.body.data.bankAccount, "Test Bank SDG - 222");
  });

  test("passport-scan reads the passport number from a valid MRZ and rejects an unreadable image", async () => {
    const goodRes = await request(app)
      .post("/api/contact-requests/passport-scan")
      .attach("image", MRZ_FIXTURE);
    assert.equal(goodRes.status, 200);
    assert.equal(goodRes.body.data.documentNumber, "SD1234567");

    const badRes = await request(app)
      .post("/api/contact-requests/passport-scan")
      .attach("image", NO_MRZ_FIXTURE);
    assert.equal(badRes.status, 422);
  });

  test("uploading a passport image to an unknown request returns 404", async () => {
    const res = await request(app)
      .post("/api/contact-requests/does-not-exist/passport-image")
      .attach("image", MRZ_FIXTURE);
    assert.equal(res.status, 404);
  });

  test("full bank-transfer lifecycle: attach passport, upload receipt, staff confirms payment", async () => {
    const createRes = await request(app).post("/api/contact-requests").send({
      name: "Umrah Lifecycle Test",
      phone: `098${suffix}4`,
      service: "عمرة",
      currency: "SAR",
      details: { "نوع الباقة": "العمرة الجماعية (الأفواج)" },
    });
    assert.equal(createRes.status, 201);
    const id = createRes.body.data.id;

    const passportRes = await request(app)
      .post(`/api/contact-requests/${id}/passport-image`)
      .attach("image", MRZ_FIXTURE);
    assert.equal(passportRes.status, 200);

    const receiptRes = await request(app)
      .post(`/api/contact-requests/${id}/payment-receipt`)
      .attach("image", MRZ_FIXTURE);
    assert.equal(receiptRes.status, 200);

    const staffListRes = await adminAgent.get("/api/contact-requests?limit=50");
    const found = staffListRes.body.data.find((item) => item.id === id);
    assert.ok(found);
    assert.equal(found.paymentStatus, "UNDER_REVIEW");
    assert.ok(found.passportImagePath);
    assert.ok(found.paymentReceiptPath);

    const passportFileRes = await adminAgent.get(`/api/contact-requests/${id}/passport-image`);
    assert.equal(passportFileRes.status, 200);

    const unauthFileRes = await request(app).get(`/api/contact-requests/${id}/passport-image`);
    assert.equal(unauthFileRes.status, 401);

    const confirmRes = await adminAgent
      .patch(`/api/contact-requests/${id}/payment-status`)
      .send({ status: "CONFIRMED" });
    assert.equal(confirmRes.status, 200);
    assert.equal(confirmRes.body.data.paymentStatus, "CONFIRMED");
  });

  test("rejects a payment receipt for a request with no pending payment", async () => {
    const createRes = await request(app).post("/api/contact-requests").send({
      name: "No Payment Needed Test",
      phone: `098${suffix}5`,
      message: "استفسار عام بدون خدمة مسعّرة",
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.data.paymentStatus, "NOT_REQUIRED");

    const receiptRes = await request(app)
      .post(`/api/contact-requests/${createRes.body.data.id}/payment-receipt`)
      .attach("image", MRZ_FIXTURE);
    assert.equal(receiptRes.status, 400);
  });
});
