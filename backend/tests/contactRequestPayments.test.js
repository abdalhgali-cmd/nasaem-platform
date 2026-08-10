import "./env.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import { terminateOcrWorker } from "../src/modules/passport-ocr/passport-ocr.service.js";
import { resolvePayment } from "../src/modules/contact-requests/contact-requests.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MRZ_FIXTURE = path.join(__dirname, "fixtures", "passport-mrz-sample.png");
const NO_MRZ_FIXTURE = path.join(__dirname, "fixtures", "no-mrz-sample.png");

// This file gets its own process (and so its own fresh in-memory rate
// limiters) from node's test runner, independent of contactRequests.test.js
// — see that file's budget comments for why that separation matters. At
// exactly 5 of the 5 allowed POST /api/contact-requests calls — any new
// currency/pricing scenario belongs in the resolvePayment() unit tests
// below instead (pure function, no HTTP, no budget to track).
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

  // Also covers the per-person price scaling with traveler count (package
  // is 1200 SAR/person × 3 travelers = 3600 SAR × rate 135 = 486000 SDG) —
  // combined with the currency conversion in one request rather than a
  // separate POST, to stay within this file's 5-per-window budget (see the
  // comment atop this describe block).
  test("converts to SDG using the configured exchange rate, scaled by traveler count", async () => {
    const res = await request(app).post("/api/contact-requests").send({
      name: "Umrah SDG Test",
      phone: `098${suffix}3`,
      service: "عمرة",
      currency: "SDG",
      details: { "نوع الباقة": "تأشيرة عمرة فقط", "عدد الأشخاص": "3" },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.paymentAmount, "486000");
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

  test("uploading passport images to an unknown request returns 404", async () => {
    const res = await request(app)
      .post("/api/contact-requests/does-not-exist/passport-image")
      .attach("images", MRZ_FIXTURE);
    assert.equal(res.status, 404);
  });

  test("full bank-transfer lifecycle: attach one passport photo per traveler, upload receipt, staff confirms payment", async () => {
    const createRes = await request(app).post("/api/contact-requests").send({
      name: "Umrah Lifecycle Test",
      phone: `098${suffix}4`,
      service: "عمرة",
      currency: "SAR",
      details: { "نوع الباقة": "العمرة الجماعية (الأفواج)", "عدد الأشخاص": "2" },
    });
    assert.equal(createRes.status, 201);
    const id = createRes.body.data.id;

    const passportRes = await request(app)
      .post(`/api/contact-requests/${id}/passport-image`)
      .attach("images", MRZ_FIXTURE)
      .attach("images", NO_MRZ_FIXTURE);
    assert.equal(passportRes.status, 200);

    const guarantorIdRes = await request(app)
      .post(`/api/contact-requests/${id}/guarantor-id-image`)
      .attach("images", MRZ_FIXTURE)
      .attach("images", NO_MRZ_FIXTURE);
    assert.equal(guarantorIdRes.status, 200);

    const receiptRes = await request(app)
      .post(`/api/contact-requests/${id}/payment-receipt`)
      .attach("image", MRZ_FIXTURE);
    assert.equal(receiptRes.status, 200);

    const staffListRes = await adminAgent.get("/api/contact-requests?limit=50");
    const found = staffListRes.body.data.find((item) => item.id === id);
    assert.ok(found);
    assert.equal(found.paymentStatus, "UNDER_REVIEW");
    assert.equal(found.passportImagePaths.length, 2);
    assert.equal(found.guarantorIdImagePaths.length, 2);
    assert.ok(found.paymentReceiptPath);

    const firstPassportFileRes = await adminAgent.get(`/api/contact-requests/${id}/passport-image/0`);
    assert.equal(firstPassportFileRes.status, 200);
    // res.download() is what makes the dashboard's links actually save the
    // file instead of just opening it in the browser tab.
    assert.match(firstPassportFileRes.headers["content-disposition"] || "", /attachment/);
    const secondPassportFileRes = await adminAgent.get(`/api/contact-requests/${id}/passport-image/1`);
    assert.equal(secondPassportFileRes.status, 200);
    const outOfRangeRes = await adminAgent.get(`/api/contact-requests/${id}/passport-image/2`);
    assert.equal(outOfRangeRes.status, 404);

    const firstGuarantorIdFileRes = await adminAgent.get(`/api/contact-requests/${id}/guarantor-id-image/0`);
    assert.equal(firstGuarantorIdFileRes.status, 200);

    const unauthFileRes = await request(app).get(`/api/contact-requests/${id}/passport-image/0`);
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

// resolvePayment() is a pure function (no DB, no HTTP) — exercising the
// currency-conversion matrix directly here avoids consuming any of the
// HTTP describe block's rate-limit budget above.
describe("resolvePayment (SAR/SDG/USD pricing)", () => {
  const details = { "نوع الباقة": "تأشيرة عمرة فقط" }; // 1200 SAR/person, 1 person by default
  const rates = { sarToSdgRate: 135, usdToSdgRate: 600, bankAccounts: { SAR: null, SDG: null, USD: null } };

  test("SAR needs no exchange rate at all", () => {
    const result = resolvePayment("عمرة", details, "SAR", { sarToSdgRate: null, usdToSdgRate: null, bankAccounts: {} });
    assert.deepEqual(result, { currency: "SAR", paymentAmount: 1200, paymentStatus: "AWAITING_TRANSFER" });
  });

  test("SDG converts via the SAR rate", () => {
    const result = resolvePayment("عمرة", details, "SDG", rates);
    assert.equal(result.paymentAmount, 1200 * 135);
  });

  test("USD converts via SDG as the pivot (SAR rate then USD rate), not a direct SAR-USD cross rate", () => {
    const result = resolvePayment("عمرة", details, "USD", rates);
    // 1200 SAR -> 162000 SDG -> 270 USD
    assert.equal(result.paymentAmount, 270);
  });

  test("USD is unavailable when only the SAR rate is configured", () => {
    const partialRates = { ...rates, usdToSdgRate: null };
    assert.throws(
      () => resolvePayment("عمرة", details, "USD", partialRates),
      (err) => err.statusCode === 422
    );
  });

  test("scales with traveler count for every currency", () => {
    const group = { "نوع الباقة": "تأشيرة عمرة فقط", "عدد الأشخاص": "4" };
    const sar = resolvePayment("عمرة", group, "SAR", rates);
    const usd = resolvePayment("عمرة", group, "USD", rates);
    assert.equal(sar.paymentAmount, 1200 * 4);
    assert.equal(usd.paymentAmount, (1200 * 4 * 135) / 600);
  });

  test("non-Umrah services and missing currency stay NOT_REQUIRED", () => {
    assert.deepEqual(resolvePayment("طيران", { "من": "الخرطوم" }, "SAR", rates), {
      currency: null,
      paymentAmount: null,
      paymentStatus: "NOT_REQUIRED",
    });
    assert.deepEqual(resolvePayment("عمرة", details, undefined, rates), {
      currency: null,
      paymentAmount: null,
      paymentStatus: "NOT_REQUIRED",
    });
  });
});
