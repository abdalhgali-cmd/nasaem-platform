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

    const additionalDocumentsRes = await request(app)
      .post(`/api/contact-requests/${id}/additional-documents`)
      .attach("images", MRZ_FIXTURE)
      .attach("images", NO_MRZ_FIXTURE);
    assert.equal(additionalDocumentsRes.status, 200);

    const receiptRes = await request(app)
      .post(`/api/contact-requests/${id}/payment-receipt`)
      .attach("image", MRZ_FIXTURE);
    assert.equal(receiptRes.status, 200);

    const staffListRes = await adminAgent.get("/api/contact-requests?limit=50");
    const found = staffListRes.body.data.find((item) => item.id === id);
    assert.ok(found);
    assert.equal(found.paymentStatus, "UNDER_REVIEW");
    assert.equal(found.documents.filter((d) => d.type === "PASSPORT").length, 2);
    assert.equal(found.documents.filter((d) => d.type === "GUARANTOR_ID").length, 2);
    assert.equal(found.documents.filter((d) => d.type === "ADDITIONAL").length, 2);
    assert.ok(found.paymentReceiptPath);

    const documentsListRes = await adminAgent.get(`/api/contact-requests/${id}/documents`);
    assert.equal(documentsListRes.status, 200);
    assert.equal(documentsListRes.body.data.length, 6);

    const passportDocumentId = documentsListRes.body.data.find((d) => d.type === "PASSPORT").id;
    const passportFileRes = await adminAgent.get(`/api/contact-requests/${id}/documents/${passportDocumentId}/file`);
    assert.equal(passportFileRes.status, 200);
    // res.download() is what makes the dashboard's links actually save the
    // file instead of just opening it in the browser tab.
    assert.match(passportFileRes.headers["content-disposition"] || "", /attachment/);

    const unknownDocumentRes = await adminAgent.get(`/api/contact-requests/${id}/documents/does-not-exist/file`);
    assert.equal(unknownDocumentRes.status, 404);

    const unauthFileRes = await request(app).get(`/api/contact-requests/${id}/documents/${passportDocumentId}/file`);
    assert.equal(unauthFileRes.status, 401);

    const confirmRes = await adminAgent
      .patch(`/api/contact-requests/${id}/payment-status`)
      .send({ status: "CONFIRMED" });
    assert.equal(confirmRes.status, 200);
    assert.equal(confirmRes.body.data.paymentStatus, "CONFIRMED");
  });

  // Also covers staff quoting an unpriced request (e.g. a work visa) and
  // the customer approving it to start the payment flow — the two-step
  // version of what used to be one PATCH — reusing this test's single POST
  // rather than spending another unit of the public endpoint's 5-per-window
  // budget. PATCH /:id/payment and the customer-auth endpoints below carry
  // no rate limit shared with it.
  test("rejects a payment receipt until staff quotes a price and the customer approves it", async () => {
    // Must be a real-looking Sudanese number (unlike this file's other
    // `098${suffix}...` phones, which only need to be unique for
    // POST /contact-requests) — this test also logs in via customer-auth,
    // whose normalizePhone() rejects anything else.
    const phone = `09${suffix.slice(-6)}05`;
    const createRes = await request(app).post("/api/contact-requests").send({
      name: "No Payment Needed Test",
      phone,
      message: "استفسار عام بدون خدمة مسعّرة",
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.data.paymentStatus, "NOT_REQUIRED");
    const id = createRes.body.data.id;

    const receiptRes = await request(app)
      .post(`/api/contact-requests/${id}/payment-receipt`)
      .attach("image", MRZ_FIXTURE);
    assert.equal(receiptRes.status, 400);

    const quoteRes = await adminAgent
      .patch(`/api/contact-requests/${id}/payment`)
      .send({ currency: "SAR", paymentAmount: 350 });
    assert.equal(quoteRes.status, 200);
    // Quoting alone must not start the payment flow — the customer hasn't
    // agreed to anything yet.
    assert.equal(quoteRes.body.data.paymentStatus, "NOT_REQUIRED");
    assert.equal(quoteRes.body.invoice.status, "PENDING_APPROVAL");

    // Revising the quote before approval is allowed (upsert on the same
    // invoice, not a rejection) — the common "staff typed the wrong amount"
    // case.
    const revisedQuoteRes = await adminAgent
      .patch(`/api/contact-requests/${id}/payment`)
      .send({ currency: "USD", paymentAmount: 100 });
    assert.equal(revisedQuoteRes.status, 200);

    // Still no pending payment to attach a receipt to until the customer
    // approves.
    const receiptBeforeApprovalRes = await request(app)
      .post(`/api/contact-requests/${id}/payment-receipt`)
      .attach("image", MRZ_FIXTURE);
    assert.equal(receiptBeforeApprovalRes.status, 400);

    const codeRes = await request(app).post("/api/customer-auth/request-code").send({ phone });
    assert.equal(codeRes.status, 200);
    const customerAgent = request.agent(app);
    const verifyRes = await customerAgent.post("/api/customer-auth/verify-code").send({
      loginCodeId: codeRes.body.data.loginCodeId,
      code: codeRes.body.data.debugCode,
    });
    assert.equal(verifyRes.status, 200);

    const approveRes = await customerAgent.post(`/api/contact-requests/${id}/invoice/approve`);
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.data.paymentStatus, "AWAITING_TRANSFER");
    assert.equal(approveRes.body.data.currency, "USD");
    assert.equal(approveRes.body.data.paymentAmount, "100");

    // Already approved — must not silently re-price an active transfer.
    const requoteAfterApprovalRes = await adminAgent
      .patch(`/api/contact-requests/${id}/payment`)
      .send({ currency: "SAR", paymentAmount: 500 });
    assert.equal(requoteAfterApprovalRes.status, 400);

    // A receipt is now accepted, since there's a pending payment to attach it to.
    const receiptAfterApprovalRes = await request(app)
      .post(`/api/contact-requests/${id}/payment-receipt`)
      .attach("image", MRZ_FIXTURE);
    assert.equal(receiptAfterApprovalRes.status, 200);
  });

  test("rejects an invalid payment approval payload", async () => {
    const res = await adminAgent
      .patch("/api/contact-requests/does-not-exist/payment")
      .send({ currency: "EUR", paymentAmount: -5 });
    assert.equal(res.status, 400);
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
