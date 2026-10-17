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

describe("passport OCR resource limits", async () => {
  const { readImageDimensions, assertOcrImageWithinLimits, OcrRejectedError, OCR_MAX_PIXELS } = await import(
    "../src/modules/passport-ocr/passport-ocr.service.js"
  );

  function png(width, height) {
    const buffer = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
    buffer.writeUInt32BE(13, 8);
    buffer.write("IHDR", 12, "ascii");
    buffer.writeUInt32BE(width, 16);
    buffer.writeUInt32BE(height, 20);
    return buffer;
  }

  function jpeg(width, height) {
    const buffer = Buffer.alloc(40);
    buffer[0] = 0xff; buffer[1] = 0xd8;
    buffer[2] = 0xff; buffer[3] = 0xc0; buffer.writeUInt16BE(17, 4); buffer[6] = 8;
    buffer.writeUInt16BE(height, 7); buffer.writeUInt16BE(width, 9);
    return buffer;
  }

  test("reads dimensions from PNG and JPEG headers", () => {
    assert.deepEqual(readImageDimensions(png(1200, 800)), { width: 1200, height: 800 });
    assert.deepEqual(readImageDimensions(jpeg(4000, 3000)), { width: 4000, height: 3000 });
    assert.equal(readImageDimensions(Buffer.from("not an image at all, just text")), null);
  });

  test("refuses an image whose decoded size would exhaust memory, before decoding it", () => {
    assert.doesNotThrow(() => assertOcrImageWithinLimits(jpeg(4000, 3000)));
    assert.ok(Math.floor(Math.sqrt(OCR_MAX_PIXELS)) < 6000);
    assert.throws(() => assertOcrImageWithinLimits(png(20000, 20000)), (error) => error instanceof OcrRejectedError && error.status === 413);
    assert.throws(() => assertOcrImageWithinLimits(Buffer.alloc(50)), (error) => error instanceof OcrRejectedError && error.status === 422);
  });
});

// Issue #103: varied passport photos fail safely, passport text never
// reaches the logs, and one draft's scan never shows up in another.
describe("passport OCR — safe failure, no logging, no leaks (issue #103)", () => {
  const BLURRY_IMAGE = path.join(__dirname, "fixtures", "passport-mrz-blurry.png");
  // Same MRZ as the clear sample with one birth-date digit changed, so the
  // check digit no longer matches what is printed.
  const BAD_CHECKSUM_IMAGE = path.join(__dirname, "fixtures", "passport-mrz-bad-checksum.png");

  after(async () => {
    await terminateOcrWorker();
  });

  test("a blurry photo and a wrong-checksum MRZ give 'could not read', never a guess", async () => {
    const agent = await loginAsSuperAdmin();
    for (const image of [BLURRY_IMAGE, BAD_CHECKSUM_IMAGE]) {
      const res = await agent.post("/api/passport-ocr/scan").attach("image", image);
      assert.equal(res.status, 422, `${path.basename(image)}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.data, undefined);
    }
  });

  test("a customer's draft scan stays in that draft and writes no passport text to the logs", async () => {
    const agent = await loginAsSuperAdmin();
    const suffix = uniqueSuffix();
    const serviceRes = await agent.post("/api/services").send({
      code: `SVC-MRZ-${suffix}`,
      name: `MRZ Test Service ${suffix}`,
      category: "qa-mrz",
      basePrice: 100,
      currency: "SAR",
    });
    assert.equal(serviceRes.status, 201, JSON.stringify(serviceRes.body));
    const service = serviceRes.body.data;
    const reqRes = await agent.post(`/api/services/${service.id}/requirements`).send({
      name: "جواز السفر",
      type: "DOCUMENT",
      scope: "TRAVELER",
      ocrEnabled: true,
    });
    assert.equal(reqRes.status, 201, JSON.stringify(reqRes.body));

    const draftA = (await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: service.id })).body.data.token;
    const draftB = (await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: service.id })).body.data.token;

    const logged = [];
    const originals = {};
    for (const method of ["log", "info", "warn", "error", "debug"]) {
      originals[method] = console[method];
      console[method] = (...args) => logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    }
    let uploadRes;
    try {
      uploadRes = await request(app)
        .post(`/api/intake-drafts/${draftA}/documents`)
        .field("label", "جواز السفر")
        .field("requirementId", reqRes.body.data.id)
        .field("travelerIndex", "0")
        .attach("file", SAMPLE_MRZ_IMAGE);
    } finally {
      Object.assign(console, originals);
    }
    assert.equal(uploadRes.status, 201, JSON.stringify(uploadRes.body));
    assert.equal(uploadRes.body.data.ocrResult?.documentNumber, "SD1234567");
    for (const secret of ["SD1234567", "MOHAMED", "P<SDN"]) {
      assert.ok(!logged.some((line) => line.includes(secret)), `"${secret}" must not be logged`);
    }

    const ownDraft = await request(app).get(`/api/intake-drafts/${draftA}`);
    assert.equal(ownDraft.body.data.documents.length, 1);
    const otherDraft = await request(app).get(`/api/intake-drafts/${draftB}`);
    assert.equal(otherDraft.status, 200);
    assert.equal(otherDraft.body.data.documents.length, 0, "draft B must not see draft A's passport");
    assert.ok(!JSON.stringify(otherDraft.body).includes("SD1234567"));
  });
});
