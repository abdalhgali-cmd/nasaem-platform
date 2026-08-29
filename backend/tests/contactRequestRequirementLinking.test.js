import "./env.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// Regression coverage for the Public Visa Intake Wizard wiring
// (web/src/components/sections/service-intake-wizard.tsx): before that
// change, the wizard never sent documentRequirementIds, so
// createContactRequest's per-file MIME/size/max-files validation and
// requirement-linking (already implemented — see contact-requests.service.js)
// was reachable only from a direct API call, never from the actual
// customer-facing form. These prove it engages correctly now that a real
// caller (the wizard) sends it.
//
// Kept in its own file/process rather than appended to
// contactRequestIntake.test.js — that file's own comment already flags it
// sits close to the public POST /api/contact-requests rate limiter's
// 5-per-15-min cap (contactRequestIntake.test.js already makes 5 calls);
// each test file gets a fresh in-memory limiter, so a separate file is the
// established way to add more public-endpoint calls without tripping it.

describe("service intake — documentRequirementIds wiring (Requirements Engine)", () => {
  let adminAgent;
  let visaTypeId;
  let requirement;

  before(async () => {
    adminAgent = await loginAsSuperAdmin();

    const catalogRes = await request(app).get("/api/services/public");
    const workVisa = catalogRes.body.data.visaTypes.find((v) => v.code === "VISA-WORK");
    visaTypeId = workVisa.id;

    const reqRes = await adminAgent.post(`/api/visa-types/${visaTypeId}/requirements`).send({
      name: "متطلب اختبار الربط",
      required: true,
      maxFiles: 1,
      allowedMimeTypes: ["image/png"],
      maxSizeBytes: 1024 * 1024,
    });
    assert.equal(reqRes.status, 201, JSON.stringify(reqRes.body));
    requirement = reqRes.body.data;
  });

  after(async () => {
    if (requirement) {
      await adminAgent.delete(`/api/visa-types/${visaTypeId}/requirements/${requirement.id}`).catch(() => {});
    }
  });

  test("a file tagged with documentRequirementIds is persisted linked to that requirement", async () => {
    const phone = `105${uniqueSuffix()}`;
    const res = await request(app)
      .post("/api/contact-requests")
      .field("name", "Requirement Link Test")
      .field("phone", phone)
      .field("message", "اختبار ربط المستند بالمتطلب")
      .field("visaTypeId", visaTypeId)
      .field("documentLabels", JSON.stringify([requirement.name]))
      .field("documentRequirementIds", JSON.stringify([requirement.id]))
      .attach("documents", Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: "linked.png",
        contentType: "image/png",
      });

    assert.equal(res.status, 201, JSON.stringify(res.body));

    const listRes = await adminAgent.get("/api/contact-requests?limit=50");
    const found = listRes.body.data.find((r) => r.id === res.body.data.id);
    assert.ok(found);
    assert.equal(found.documents.length, 1);
    assert.equal(found.documents[0].requirementId, requirement.id);

    await adminAgent.delete(`/api/contact-requests/${found.id}`).catch(() => {});
  });

  test("a file whose MIME type isn't in the requirement's allowedMimeTypes is rejected, and nothing is created", async () => {
    const phone = `106${uniqueSuffix()}`;
    const res = await request(app)
      .post("/api/contact-requests")
      .field("name", "Requirement Mime Reject Test")
      .field("phone", phone)
      .field("message", "اختبار رفض نوع الملف")
      .field("visaTypeId", visaTypeId)
      .field("documentLabels", JSON.stringify([requirement.name]))
      .field("documentRequirementIds", JSON.stringify([requirement.id]))
      .attach("documents", Buffer.from([0xff, 0xd8, 0xff, 0xe0]), {
        filename: "wrong-type.jpg",
        contentType: "image/jpeg",
      });

    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.message, /type that isn't allowed/);

    const listRes = await adminAgent.get("/api/contact-requests?limit=50");
    assert.ok(!listRes.body.data.some((r) => r.phone === phone), "a rejected submission must not have been created");
  });

  test("exceeding the requirement's maxFiles is rejected", async () => {
    const phone = `107${uniqueSuffix()}`;
    const res = await request(app)
      .post("/api/contact-requests")
      .field("name", "Requirement Max Files Test")
      .field("phone", phone)
      .field("message", "اختبار تجاوز الحد الأقصى للملفات")
      .field("visaTypeId", visaTypeId)
      .field("documentLabels", JSON.stringify([requirement.name, requirement.name]))
      .field("documentRequirementIds", JSON.stringify([requirement.id, requirement.id]))
      .attach("documents", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "one.png", contentType: "image/png" })
      .attach("documents", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "two.png", contentType: "image/png" });

    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.message, /Too many files/);
  });
});
