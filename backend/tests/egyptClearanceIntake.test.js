import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request } from "./helpers/api.js";
import prisma from "../src/config/database.js";

// Regression test for a critical bug: seed.js used to create the
// VISA-EGYPT-CLEARANCE checklist as two plain DOCUMENT rows with no
// attachmentType, but egypt-clearance-draft.js's submit validation requires
// a "passport_copy" DOCUMENT requirement and an "egypt_entry_mode" SELECT
// requirement to exist and be answered/uploaded — so no customer could ever
// complete this request. This exercises the exact draft → upload → submit
// path the public /visas/egypt-security-approval page drives.

function attachPng(req) {
  return req.attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "passport.png", contentType: "image/png" });
}

describe("Egypt Security Approval — intake draft submission", () => {
  let visaType;
  let passportRequirement;
  let entryModeRequirement;

  before(async () => {
    visaType = await prisma.visaType.findUnique({ where: { code: "VISA-EGYPT-CLEARANCE" } });
    assert.ok(visaType, "seed must create VISA-EGYPT-CLEARANCE");

    passportRequirement = await prisma.visaRequirement.findFirst({
      where: { visaTypeId: visaType.id, attachmentType: "passport_copy", active: true },
    });
    entryModeRequirement = await prisma.visaRequirement.findFirst({
      where: { visaTypeId: visaType.id, attachmentType: "egypt_entry_mode", active: true },
    });

    assert.ok(passportRequirement, "seed must create a passport_copy requirement for the Egypt Security Approval flow");
    assert.ok(entryModeRequirement, "seed must create an egypt_entry_mode requirement for the Egypt Security Approval flow");
    assert.equal(entryModeRequirement.type, "SELECT");
  });

  test("a customer can complete the full public journey: draft -> info -> passport upload -> submit", async () => {
    const createRes = await request(app)
      .post("/api/intake-drafts")
      .send({ serviceKind: "visa", serviceId: visaType.serviceId, visaTypeId: visaType.id });
    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
    const token = createRes.body.data.token;

    const patchRes = await request(app)
      .patch(`/api/intake-drafts/${token}`)
      .send({
        serviceKind: "visa",
        serviceId: visaType.serviceId,
        visaTypeId: visaType.id,
        name: "Test Customer",
        phone: "0911111111",
        travelerCount: 1,
        answers: { [entryModeRequirement.id]: "AIR" },
        travelers: [{ fullName: "Test Customer", passportNo: "P7654321", birthDate: "1990-01-01", isPrimary: true }],
      });
    assert.equal(patchRes.status, 200, JSON.stringify(patchRes.body));

    const uploadRes = await attachPng(
      request(app)
        .post(`/api/intake-drafts/${token}/documents`)
        .field("label", "صورة جواز السفر")
        .field("requirementId", passportRequirement.id)
        .field("travelerIndex", "0")
    );
    assert.equal(uploadRes.status, 201, JSON.stringify(uploadRes.body));

    const submitRes = await request(app).post(`/api/intake-drafts/${token}/submit`).send({});
    assert.equal(submitRes.status, 201, JSON.stringify(submitRes.body));
    assert.ok(submitRes.body.data.id, "expected a created ContactRequest id back");
  });

  test("submitting without an entry mode answer or without a passport upload is rejected with the fields that are missing", async () => {
    const createRes = await request(app)
      .post("/api/intake-drafts")
      .send({ serviceKind: "visa", serviceId: visaType.serviceId, visaTypeId: visaType.id });
    const token = createRes.body.data.token;

    await request(app)
      .patch(`/api/intake-drafts/${token}`)
      .send({
        serviceKind: "visa",
        serviceId: visaType.serviceId,
        visaTypeId: visaType.id,
        name: "Test Customer",
        phone: "0922222222",
        travelerCount: 1,
        travelers: [{ fullName: "Test Customer", passportNo: "P0000000", birthDate: "1990-01-01", isPrimary: true }],
      });

    const submitRes = await request(app).post(`/api/intake-drafts/${token}/submit`).send({});
    assert.equal(submitRes.status, 400);
    assert.deepEqual(
      new Set(submitRes.body.details.fields),
      new Set(["entryMode", "passportDocument"])
    );
  });
});
