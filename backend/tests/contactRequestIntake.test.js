import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// Covers the Public Service Intake fields added to the existing, previously
// free-text-only POST /api/contact-requests (serviceId/visaTypeId/
// travelerCount/intakeData/documents) — see contact-requests.validators.js
// and contact-requests.service.js. Reuses the same public endpoint and rate
// limiter as contactRequests.test.js, so this file keeps its own call count
// well under the 5/15min limit (each test file runs in its own process, so
// limiter state isn't shared across files — see that file's own comment).

describe("service intake — public catalog", () => {
  test("GET /api/services/public exposes active services and visa types without auth", async () => {
    const res = await request(app).get("/api/services/public");

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.services));
    assert.ok(Array.isArray(res.body.data.visaTypes));

    const umrah = res.body.data.services.find((s) => s.code === "SVC-UMRAH");
    assert.ok(umrah, "expected the seeded Umrah service in the public catalog");
    assert.equal(umrah.category, "umrah");
    // Narrow field set only — no createdAt/updatedAt/internal metadata leaked.
    // iconKey/imageKey/features were added in Platform 3.0 Phase 3 (Dynamic
    // Service Catalog) — see services.service.js's PUBLIC_SERVICE_SELECT.
    assert.deepEqual(Object.keys(umrah).sort(), [
      "basePrice",
      "category",
      "code",
      "currency",
      "description",
      "features",
      "iconKey",
      "id",
      "imageKey",
      "name",
    ]);

    const packages = res.body.data.services.filter((s) => s.category === "package");
    assert.equal(packages.length, 6, "expected the 6 seeded package services (3 general + 3 Umrah)");
    assert.deepEqual(
      packages.map((pkg) => pkg.code).sort(),
      [
        "SVC-PKG-FAMILY",
        "SVC-PKG-HONEYMOON",
        "SVC-PKG-BUSINESS",
        "SVC-UMRAH-VISA",
        "SVC-UMRAH-SERVICES",
        "SVC-UMRAH-GROUP",
      ].sort()
    );

    const visaTypes = res.body.data.visaTypes;
    const expectedVisaCodes = [
      "VISA-UMRAH",
      "VISA-FAMILY-VISIT",
      "VISA-WORK",
      "VISA-INTERNATIONAL",
      "VISA-EGYPT-CLEARANCE",
    ];
    // Subset, not exact-match: Platform 3.0 Phase 4 made visa types
    // admin-creatable, so other test files (visaTypes.test.js) legitimately
    // add more active visa types to this same catalog.
    const actualCodes = visaTypes.map((v) => v.code);
    for (const code of expectedVisaCodes) {
      assert.ok(actualCodes.includes(code), `expected seeded visa ${code} in the public catalog`);
    }

    // Only the seeded visa types are guaranteed to be service-linked —
    // Platform 3.0 Phase 4 made serviceId an optional field on admin-
    // created visa types, so this can no longer be asserted catalog-wide.
    const seededVisaTypes = visaTypes.filter((v) => expectedVisaCodes.includes(v.code));
    for (const visa of seededVisaTypes) {
      assert.ok(visa.id, `expected an id for ${visa.code}`);
      assert.ok(visa.serviceId, `expected ${visa.code} to be linked to a parent service`);
      assert.equal(typeof visa.name, "string");
      assert.equal(typeof visa.country, "string");
      assert.equal(typeof visa.currency, "string");
      assert.equal(typeof visa.basePrice, "string");
    }

    const workVisa = visaTypes.find((v) => v.code === "VISA-WORK");
    assert.ok(workVisa, "expected the seeded work-visa VisaType in the public catalog");
    assert.equal(workVisa.country, "السعودية");
  });
});

describe("service intake — extended contact request creation", () => {
  let adminAgent;
  let umrahServiceId;
  let visaTypeId;
  let visaTypeServiceId;

  before(async () => {
    adminAgent = await loginAsSuperAdmin();

    const catalogRes = await request(app).get("/api/services/public");
    umrahServiceId = catalogRes.body.data.services.find((s) => s.code === "SVC-UMRAH").id;
    const workVisa = catalogRes.body.data.visaTypes.find((v) => v.code === "VISA-WORK");
    visaTypeId = workVisa.id;
    visaTypeServiceId = workVisa.serviceId;
  });

  test("creates an intake request with serviceId/visaTypeId/travelerCount/intakeData (JSON body)", async () => {
    const phone = `097${uniqueSuffix()}`;
    const res = await request(app)
      .post("/api/contact-requests")
      .send({
        name: "Intake JSON Test",
        phone,
        service: "تأشيرة العمل",
        message: "طلب تأشيرة عمل عبر المعالج",
        serviceId: visaTypeServiceId,
        visaTypeId,
        travelerCount: 2,
        intakeData: {
          travelers: [{ fullName: "Test Traveler", passportNo: "P0000001" }],
          notes: "يفضل السفر نهاية الشهر",
        },
      });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    const id = res.body.data.id;

    const listRes = await adminAgent.get("/api/contact-requests?limit=50");
    const found = listRes.body.data.find((r) => r.id === id);
    assert.ok(found, "expected the created request in the staff list");
    assert.equal(found.serviceId, visaTypeServiceId);
    assert.equal(found.visaTypeId, visaTypeId);
    assert.equal(found.travelerCount, 2);
    assert.equal(found.intakeData.travelers[0].fullName, "Test Traveler");
    // Staff-facing relations resolved to human-readable names, not just ids.
    assert.equal(found.visaType.name, "تأشيرة العمل");
    assert.ok(found.serviceRef);
  });

  test("plain contact-form submissions (no intake fields) leave the new fields null — unchanged behavior", async () => {
    const phone = `098${uniqueSuffix()}`;
    const res = await request(app).post("/api/contact-requests").send({
      name: "Plain Contact Form",
      phone,
      message: "استفسار عادي من نموذج التواصل القديم",
    });

    assert.equal(res.status, 201);

    const listRes = await adminAgent.get("/api/contact-requests?limit=50");
    const found = listRes.body.data.find((r) => r.id === res.body.data.id);
    assert.equal(found.serviceId, null);
    assert.equal(found.visaTypeId, null);
    assert.equal(found.travelerCount, null);
    assert.equal(found.intakeData, null);
    assert.deepEqual(found.documents, []);
  });

  test("multipart submission creates the request and its documents atomically", async () => {
    const phone = `099${uniqueSuffix()}`;

    const res = await request(app)
      .post("/api/contact-requests")
      .field("name", "Intake Multipart Test")
      .field("phone", phone)
      .field("service", "خدمات العمرة")
      .field("message", "طلب عمرة عبر المعالج مع مستندات")
      .field("serviceId", umrahServiceId)
      .field("travelerCount", "1")
      .field("documentLabels", JSON.stringify(["صورة الجواز", "الصورة الشخصية"]))
      .attach("documents", Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: "passport.png",
        contentType: "image/png",
      })
      .attach("documents", Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: "photo.png",
        contentType: "image/png",
      });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    const id = res.body.data.id;

    const listRes = await adminAgent.get("/api/contact-requests?limit=50");
    const found = listRes.body.data.find((r) => r.id === id);
    assert.ok(found);
    assert.equal(found.serviceId, umrahServiceId);
    assert.equal(found.documents.length, 2);
    const labels = found.documents.map((d) => d.label).sort();
    assert.deepEqual(labels, ["الصورة الشخصية", "صورة الجواز"]);
    found.documents.forEach((doc) => assert.equal(doc.status, "PENDING"));

    // The documents are reachable through the same staff download route
    // ContactRequestDocument already uses everywhere else.
    const fileRes = await adminAgent.get(
      `/api/contact-requests/${id}/documents/${found.documents[0].id}/file`
    );
    assert.equal(fileRes.status, 200);
  });

  test("rejects an unsupported file type on intake submission", async () => {
    const phone = `100${uniqueSuffix()}`;

    const res = await request(app)
      .post("/api/contact-requests")
      .field("name", "Bad File Type")
      .field("phone", phone)
      .field("message", "رفع ملف غير مسموح أثناء الطلب")
      .field("documentLabels", JSON.stringify(["ملف"]))
      .attach("documents", Buffer.from("not a real file"), {
        filename: "malware.exe",
        contentType: "application/x-msdownload",
      });

    assert.equal(res.status, 400);
  });

  test("an invalid serviceId is rejected with a clean 409, not a raw 500", async () => {
    const phone = `101${uniqueSuffix()}`;
    const res = await request(app).post("/api/contact-requests").send({
      name: "Bad Service Id",
      phone,
      message: "معرف خدمة غير موجود للاختبار",
      serviceId: "does-not-exist",
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
  });
});
