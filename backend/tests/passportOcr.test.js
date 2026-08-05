import "./env.js";
import path from "path";
import { fileURLToPath } from "url";
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin } from "./helpers/api.js";
import { terminateOcrWorker } from "../src/modules/passport-ocr/passport-ocr.service.js";

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
});
