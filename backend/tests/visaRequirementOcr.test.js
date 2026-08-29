import "./env.js";
import path from "path";
import { fileURLToPath } from "url";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import { terminateOcrWorker } from "../src/modules/passport-ocr/passport-ocr.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_MRZ_IMAGE = path.join(__dirname, "fixtures", "passport-mrz-sample.png");
const NO_MRZ_IMAGE = path.join(__dirname, "fixtures", "no-mrz-sample.png");

// Platform 3.0 Phase 7: OCR only runs on an upload tagged with a
// VisaRequirement whose ocrEnabled is set — this file proves that
// configurability directly (an ocrEnabled:false requirement never
// triggers extraction) alongside the actual extraction result.
describe("passport OCR configurable per visa requirement (Platform 3.0 Phase 7)", () => {
  let superAdminAgent;
  let visaType;
  let ocrEnabledRequirement;
  let ocrDisabledRequirement;
  let phone;
  let contactRequestId;
  let customerAgent;

  after(async () => {
    await terminateOcrWorker();
  });

  before(async () => {
    superAdminAgent = await loginAsSuperAdmin();

    const suffix = uniqueSuffix();
    const visaTypeRes = await superAdminAgent.post("/api/visa-types").send({
      code: `VISA-OCR-${suffix}`,
      name: "تأشيرة اختبار OCR",
      country: "QA-OCR-Test",
      basePrice: 10,
    });
    assert.equal(visaTypeRes.status, 201);
    visaType = visaTypeRes.body.data;

    const enabledRes = await superAdminAgent.post(`/api/visa-types/${visaType.id}/requirements`).send({
      name: "صورة جواز (OCR مفعّل)",
      maxFiles: 5,
      ocrEnabled: true,
    });
    assert.equal(enabledRes.status, 201);
    ocrEnabledRequirement = enabledRes.body.data;

    const disabledRes = await superAdminAgent.post(`/api/visa-types/${visaType.id}/requirements`).send({
      name: "صورة جواز (OCR معطّل)",
      maxFiles: 5,
      ocrEnabled: false,
    });
    assert.equal(disabledRes.status, 201);
    ocrDisabledRequirement = disabledRes.body.data;

    phone = `0965${suffix}`;
    const createRes = await request(app).post("/api/contact-requests").send({
      name: "OCR Requirement Test",
      phone,
      message: "اختبار OCR المرتبط بالمتطلبات",
      visaTypeId: visaType.id,
    });
    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
    contactRequestId = createRes.body.data.id;

    const codeRes = await request(app).post("/api/tracking/request-code").send({ phone });
    customerAgent = request.agent(app);
    const verifyRes = await customerAgent.post("/api/tracking/verify-code").send({ phone, code: codeRes.body.debugCode });
    assert.equal(verifyRes.status, 200, JSON.stringify(verifyRes.body));
  });

  test("extracts and attaches real MRZ data when the requirement has ocrEnabled", async () => {
    const res = await customerAgent
      .post(`/api/tracking/requests/${contactRequestId}/documents`)
      .field("label", "جواز السفر")
      .field("requirementId", ocrEnabledRequirement.id)
      .attach("file", SAMPLE_MRZ_IMAGE);

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.data.ocrResult, "expected an OCR result to be attached");
    assert.ok(res.body.data.ocrResult.documentNumber, "expected a passport number to have been extracted");
  });

  test("never blocks the upload when OCR can't read a valid MRZ (ocrResult stays null)", async () => {
    const res = await customerAgent
      .post(`/api/tracking/requests/${contactRequestId}/documents`)
      .field("label", "صورة بدون MRZ")
      .field("requirementId", ocrEnabledRequirement.id)
      .attach("file", NO_MRZ_IMAGE);

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.ocrResult, null);
  });

  test("does not run OCR at all when the requirement's ocrEnabled is false", async () => {
    const res = await customerAgent
      .post(`/api/tracking/requests/${contactRequestId}/documents`)
      .field("label", "جواز السفر بدون OCR")
      .field("requirementId", ocrDisabledRequirement.id)
      .attach("file", SAMPLE_MRZ_IMAGE);

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.ocrResult, null, "OCR must not run for a requirement with ocrEnabled: false");
  });

  test("an upload not tied to any requirement never runs OCR", async () => {
    const res = await customerAgent
      .post(`/api/tracking/requests/${contactRequestId}/documents`)
      .field("label", "مستند عام")
      .attach("file", SAMPLE_MRZ_IMAGE);

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.ocrResult, null);
  });
});
