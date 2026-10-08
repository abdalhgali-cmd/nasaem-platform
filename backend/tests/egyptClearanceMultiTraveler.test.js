import "./env.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";
import { terminateOcrWorker } from "../src/modules/passport-ocr/passport-ocr.service.js";

// Phase 4 (Egypt Security Approval — multi-traveler): the mobile app's
// request/[kind].tsx used to submit exactly one hardcoded traveler for
// kind="egypt", with no way to add a second one, even though the backend
// (Traveler model + ContactRequestDocument.travelerId, and the
// documentTravelerIndexes contract already exercised generically in
// smartCaseDocuments.test.js) has always supported it. This is the
// Egypt-specific version of that same regression: multiple travelers on
// one Egypt Security Approval request, each with their own passport copy,
// submitted the same way the mobile app now does (POST /api/contact-requests
// with visaTypeId + travelers[] + documentTravelerIndexes).
describe("Egypt Security Approval — multi-traveler request", () => {
  let visaType;
  let passportRequirement;
  let entryModeRequirement;
  let admin;

  after(async () => {
    await terminateOcrWorker();
  });

  before(async () => {
    admin = await loginAsSuperAdmin();
    visaType = await prisma.visaType.findUnique({ where: { code: "VISA-EGYPT-CLEARANCE" } });
    assert.ok(visaType, "seed must create VISA-EGYPT-CLEARANCE");

    passportRequirement = await prisma.visaRequirement.findFirst({
      where: { visaTypeId: visaType.id, attachmentType: "passport_copy", active: true },
    });
    entryModeRequirement = await prisma.visaRequirement.findFirst({
      where: { visaTypeId: visaType.id, attachmentType: "egypt_entry_mode", active: true },
    });
    assert.ok(passportRequirement);
    assert.ok(entryModeRequirement);
    assert.equal(passportRequirement.scope, "TRAVELER");
  });

  test("two travelers on one Egypt request each keep their own independent passport document", async () => {
    const phone = `092${uniqueSuffix()}`;
    const createRes = await request(app)
      .post("/api/contact-requests")
      .field("name", "Traveler One")
      .field("phone", phone)
      .field("message", "طلب موافقة أمنية مصر لمسافرين")
      .field("visaTypeId", visaType.id)
      .field(
        "travelers",
        JSON.stringify([
          { fullName: "Traveler One", passportNo: "P1000001", nationality: "Sudan", birthDate: "1990-01-01", isPrimary: true },
          { fullName: "Traveler Two", passportNo: "P1000002", nationality: "Sudan", birthDate: "1992-02-02", isPrimary: false },
        ])
      )
      .field("answers", JSON.stringify({ [entryModeRequirement.id]: "AIR" }))
      .field("documentLabels", JSON.stringify(["صورة الجواز", "صورة الجواز"]))
      .field("documentRequirementIds", JSON.stringify([passportRequirement.id, passportRequirement.id]))
      .field("documentTravelerIndexes", JSON.stringify(["0", "1"]))
      .attach("documents", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01]), { filename: "traveler-one-passport.png", contentType: "image/png" })
      .attach("documents", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x02]), { filename: "traveler-two-passport.png", contentType: "image/png" });

    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));

    const listRes = await admin.get("/api/contact-requests?limit=50");
    assert.equal(listRes.status, 200);
    const found = listRes.body.data.find((r) => r.id === createRes.body.data.id);
    assert.ok(found, "expected the created Egypt request in the staff list");

    assert.equal(found.visaTypeId, visaType.id, "the request must carry the resolved Egypt VisaType id");
    assert.equal(found.travelers.length, 2);
    assert.equal(found.documents.length, 2, "both travelers' passports were accepted");

    const travelerOneId = found.travelers.find((t) => t.fullName === "Traveler One").id;
    const travelerTwoId = found.travelers.find((t) => t.fullName === "Traveler Two").id;
    const docForOne = found.documents.find((d) => d.fileName === "traveler-one-passport.png");
    const docForTwo = found.documents.find((d) => d.fileName === "traveler-two-passport.png");

    assert.equal(docForOne.travelerId, travelerOneId);
    assert.equal(docForTwo.travelerId, travelerTwoId);
    assert.notEqual(docForOne.travelerId, docForTwo.travelerId, "the two travelers' passports never collide");
  });

  test("the passport_copy checklist is only ever reachable through the VisaType, confirming the mobile visaTypeId-resolution fix is load-bearing", async () => {
    // Same assertion the mobile fix (request/[kind].tsx resolving
    // visaTypeId via getPublicVisaTypes() when navigation only supplied a
    // serviceId) depends on: the service-scoped public requirements
    // endpoint returns nothing for Egypt, because these requirements are
    // attached to the VisaType, not the Service.
    const byServiceRes = await request(app).get(`/api/services/${visaType.serviceId}/requirements/public`);
    assert.equal(byServiceRes.status, 200);
    assert.deepEqual(byServiceRes.body.data, []);

    const byVisaTypeRes = await request(app).get(`/api/visa-types/${visaType.id}/requirements/public`);
    assert.equal(byVisaTypeRes.status, 200);
    assert.ok(byVisaTypeRes.body.data.some((r) => r.id === passportRequirement.id));
  });
});
