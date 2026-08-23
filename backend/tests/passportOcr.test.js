import "./env.js";
import path from "path";
import { fileURLToPath } from "url";
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import { comparePassportDataToCustomer, terminateOcrWorker } from "../src/modules/passport-ocr/passport-ocr.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_MRZ_IMAGE = path.join(__dirname, "fixtures", "passport-mrz-sample.png");
const NO_MRZ_IMAGE = path.join(__dirname, "fixtures", "no-mrz-sample.png");

describe("passport OCR", () => {
  after(async () => {
    await terminateOcrWorker();
  });

  test("requires authentication", async () => {
    const res = await request(app)
      .post("/api/passport-ocr/scan")
      .attach("image", SAMPLE_MRZ_IMAGE);

    assert.equal(res.status, 401);
  });

  test("requires an uploaded image", async () => {
    const agent = await loginAsSuperAdmin();
    const res = await agent.post("/api/passport-ocr/scan");

    assert.equal(res.status, 400);
  });

  test("rejects non-image files", async () => {
    const agent = await loginAsSuperAdmin();
    const res = await agent
      .post("/api/passport-ocr/scan")
      .attach("image", Buffer.from("not an image"), { filename: "notes.txt", contentType: "text/plain" });

    assert.equal(res.status, 400);
  });

  test("extracts passport data from a clear MRZ image", async () => {
    const agent = await loginAsSuperAdmin();
    const res = await agent.post("/api/passport-ocr/scan").attach("image", SAMPLE_MRZ_IMAGE);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.documentNumber, "SD1234567");
    assert.equal(res.body.data.surname, "MOHAMED");
    assert.equal(res.body.data.givenNames, "AHMED");
    assert.equal(res.body.data.nationality, "SDN");
    assert.equal(res.body.data.sex, "male");
    assert.equal(res.body.data.dateOfBirth, "1990-05-15");
    assert.equal(res.body.data.expirationDate, "2030-01-01");
  });

  test("responds with 422 when no MRZ can be read from the image", async () => {
    const agent = await loginAsSuperAdmin();
    const res = await agent.post("/api/passport-ocr/scan").attach("image", NO_MRZ_IMAGE);

    assert.equal(res.status, 422);
    assert.equal(res.body.success, false);
  });

  test("comparison is omitted when no customerId is given", async () => {
    const agent = await loginAsSuperAdmin();
    const res = await agent.post("/api/passport-ocr/scan").attach("image", SAMPLE_MRZ_IMAGE);

    assert.equal(res.status, 200);
    assert.equal(res.body.comparison, null);
  });

  test("compares the scan against a matching customer record", async () => {
    const agent = await loginAsSuperAdmin();
    // The passport number must exactly equal the fixture's MRZ document
    // number ("SD1234567") for the match case, but that's a unique field —
    // reuse the record if a previous run of this suite against the same
    // (non-disposable-between-runs) test DB already created it.
    const existing = await agent.get("/api/customers/lookup?passportNo=SD1234567");
    const customerId =
      existing.body.data?.id ||
      (
        await agent.post("/api/customers").send({
          fullName: "AHMED MOHAMED",
          passportNo: "SD1234567",
          nationality: "Sudan",
          birthDate: "1990-05-15",
        })
      ).body.data.id;

    const res = await agent
      .post("/api/passport-ocr/scan")
      .field("customerId", customerId)
      .attach("image", SAMPLE_MRZ_IMAGE);

    assert.equal(res.status, 200);
    assert.equal(res.body.comparison.hasMismatch, false);
    const byField = Object.fromEntries(res.body.comparison.fields.map((f) => [f.field, f.status]));
    assert.equal(byField.passportNo, "match");
    assert.equal(byField.fullName, "match");
    assert.equal(byField.dateOfBirth, "match");
    // Never scored — see comparePassportDataToCustomer's comment on why.
    assert.equal(byField.nationality, "not_comparable");
  });

  test("flags a mismatched passport number and name against a different customer record", async () => {
    const agent = await loginAsSuperAdmin();
    const customerRes = await agent.post("/api/customers").send({
      fullName: "SOMEONE ELSE",
      passportNo: "XX" + uniqueSuffix(),
      nationality: "Sudan",
      birthDate: "1985-01-01",
    });

    const res = await agent
      .post("/api/passport-ocr/scan")
      .field("customerId", customerRes.body.data.id)
      .attach("image", SAMPLE_MRZ_IMAGE);

    assert.equal(res.status, 200);
    assert.equal(res.body.comparison.hasMismatch, true);
    const byField = Object.fromEntries(res.body.comparison.fields.map((f) => [f.field, f.status]));
    assert.equal(byField.passportNo, "mismatch");
    assert.equal(byField.fullName, "mismatch");
    assert.equal(byField.dateOfBirth, "mismatch");
  });

  test("404s when comparing against a customerId that doesn't exist", async () => {
    const agent = await loginAsSuperAdmin();
    const res = await agent
      .post("/api/passport-ocr/scan")
      .field("customerId", "does-not-exist")
      .attach("image", SAMPLE_MRZ_IMAGE);

    assert.equal(res.status, 404);
  });
});

describe("comparePassportDataToCustomer", () => {
  const extracted = { documentNumber: "SD1234567", surname: "MOHAMED", givenNames: "AHMED", nationality: "SDN", dateOfBirth: "1990-05-15" };

  test("matches a name regardless of given/surname order", () => {
    const result = comparePassportDataToCustomer(extracted, { id: "c1", fullName: "MOHAMED AHMED", passportNo: "SD1234567", nationality: "Sudan", birthDate: new Date("1990-05-15") });
    const byField = Object.fromEntries(result.fields.map((f) => [f.field, f.status]));
    assert.equal(byField.fullName, "match");
  });

  test("reports not_comparable instead of a false mismatch when a field is missing", () => {
    const result = comparePassportDataToCustomer({ ...extracted, dateOfBirth: null }, { id: "c1", fullName: "AHMED MOHAMED", passportNo: "SD1234567", nationality: "Sudan", birthDate: null });
    const byField = Object.fromEntries(result.fields.map((f) => [f.field, f.status]));
    assert.equal(byField.dateOfBirth, "not_comparable");
  });
});
