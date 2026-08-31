import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";
import { normalizePhone } from "../src/utils/phone.js";
import {
  buildExpiryWarnings,
  buildOcrMismatchWarnings,
} from "../src/modules/case-intelligence/case-intelligence.service.js";

// Smart Case Operations — Release G (intelligence): deterministic expiry,
// OCR-mismatch and duplicate warnings, plus customer document reuse. Every
// rule here is a plain comparison — nothing rejects, merges or deletes.

describe("expiry warnings — deterministic, explainable", () => {
  const now = new Date("2026-08-31T00:00:00Z");

  test("flags an already-expired document", () => {
    const warnings = buildExpiryWarnings(
      {
        documents: [{ id: "d1", ocrResult: { expirationDate: "2026-01-01" }, travelerId: "t1" }],
        travelers: [{ id: "t1", fullName: "Ahmed" }],
      },
      { now }
    );

    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].code, "DOCUMENT_EXPIRED");
    assert.match(warnings[0].message, /Ahmed/);
  });

  test("flags a document expiring inside the required validity window", () => {
    const warnings = buildExpiryWarnings(
      { documents: [{ id: "d1", ocrResult: { expirationDate: "2026-10-15" } }], travelers: [] },
      { now }
    );

    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].code, "DOCUMENT_EXPIRING_SOON");
  });

  test("says nothing about a document valid well beyond the window", () => {
    const warnings = buildExpiryWarnings(
      { documents: [{ id: "d1", ocrResult: { expirationDate: "2030-01-01" } }], travelers: [] },
      { now }
    );
    assert.deepEqual(warnings, []);
  });

  test("says nothing when there is no expiry data to reason about, and ignores superseded documents", () => {
    assert.deepEqual(buildExpiryWarnings({ documents: [{ id: "d1", ocrResult: null }], travelers: [] }, { now }), []);
    assert.deepEqual(
      buildExpiryWarnings(
        { documents: [{ id: "d1", ocrResult: { expirationDate: "2020-01-01" }, supersededAt: new Date() }], travelers: [] },
        { now }
      ),
      []
    );
  });

  test("honours a service's own configured validity rule instead of the fallback", () => {
    const documents = [{ id: "d1", ocrResult: { expirationDate: "2026-11-30" } }];
    // Default (6 months) flags it; a service that only needs 1 month doesn't.
    assert.equal(buildExpiryWarnings({ documents, travelers: [] }, { now }).length, 1);
    assert.equal(buildExpiryWarnings({ documents, travelers: [] }, { now, validityMonths: 1 }).length, 0);
  });
});

describe("OCR mismatch warnings", () => {
  test("flags a confirmed passport number that differs from what OCR read", () => {
    const warnings = buildOcrMismatchWarnings({
      documents: [{ id: "d1", travelerId: "t1", ocrResult: { documentNumber: "P123458" } }],
      travelers: [{ id: "t1", fullName: "Ahmed", passportNo: "P123456" }],
    });

    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].code, "OCR_PASSPORT_MISMATCH");
    // Both values are reported so a person can judge which is right.
    assert.equal(warnings[0].entered, "P123456");
    assert.equal(warnings[0].extracted, "P123458");
  });

  test("stays quiet when they agree, ignoring case and spacing", () => {
    const warnings = buildOcrMismatchWarnings({
      documents: [{ id: "d1", travelerId: "t1", ocrResult: { documentNumber: "p123 456" } }],
      travelers: [{ id: "t1", fullName: "Ahmed", passportNo: "P123456" }],
    });
    assert.deepEqual(warnings, []);
  });

  test("stays quiet when either side is missing — a gap is not a mismatch", () => {
    assert.deepEqual(
      buildOcrMismatchWarnings({
        documents: [{ id: "d1", travelerId: "t1", ocrResult: { documentNumber: "P1" } }],
        travelers: [{ id: "t1", fullName: "Ahmed", passportNo: null }],
      }),
      []
    );
    assert.deepEqual(
      buildOcrMismatchWarnings({
        documents: [{ id: "d1", travelerId: "t1", ocrResult: {} }],
        travelers: [{ id: "t1", fullName: "Ahmed", passportNo: "P1" }],
      }),
      []
    );
  });
});

describe("duplicate application warnings", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
  });

  test("warns about another active case for the same passport and service, without touching either", async () => {
    const suffix = uniqueSuffix();
    const service = await prisma.service.create({
      data: { code: `SVC-DUP-${suffix}`, name: `Dup Service ${suffix}`, category: "qa-duplicates", basePrice: 10 },
    });
    const passportNo = `P${suffix}`;

    const first = await prisma.contactRequest.create({
      data: {
        name: "Duplicate Test A",
        phone: `0941${suffix}`,
        phoneNormalized: normalizePhone(`0941${suffix}`),
        message: "طلب أول",
        serviceId: service.id,
        travelers: { create: [{ fullName: "Repeat Traveler", passportNo, sortOrder: 0 }] },
      },
    });
    const second = await prisma.contactRequest.create({
      data: {
        name: "Duplicate Test B",
        phone: `0942${suffix}`,
        phoneNormalized: normalizePhone(`0942${suffix}`),
        message: "طلب ثانٍ",
        serviceId: service.id,
        travelers: { create: [{ fullName: "Repeat Traveler", passportNo, sortOrder: 0 }] },
      },
    });

    const res = await agent.get(`/api/contact-requests/${second.id}/warnings`);
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const duplicate = res.body.data.find((w) => w.code === "POSSIBLE_DUPLICATE_APPLICATION");
    assert.ok(duplicate, "expected a duplicate warning");
    assert.equal(duplicate.contactRequestId, first.id);

    // Advisory only — both cases are still there, untouched.
    assert.ok(await prisma.contactRequest.findUnique({ where: { id: first.id } }));
    assert.ok(await prisma.contactRequest.findUnique({ where: { id: second.id } }));
  });

  test("does not warn when the other case is for a different service", async () => {
    const suffix = uniqueSuffix();
    const [serviceA, serviceB] = await Promise.all([
      prisma.service.create({ data: { code: `SVC-DA-${suffix}`, name: `A ${suffix}`, category: "qa-duplicates", basePrice: 10 } }),
      prisma.service.create({ data: { code: `SVC-DB-${suffix}`, name: `B ${suffix}`, category: "qa-duplicates", basePrice: 10 } }),
    ]);
    const passportNo = `PX${suffix}`;

    await prisma.contactRequest.create({
      data: {
        name: "Other Service Case",
        phone: `0943${suffix}`,
        phoneNormalized: normalizePhone(`0943${suffix}`),
        message: "خدمة أخرى",
        serviceId: serviceA.id,
        travelers: { create: [{ fullName: "Traveler", passportNo, sortOrder: 0 }] },
      },
    });
    const target = await prisma.contactRequest.create({
      data: {
        name: "Target Case",
        phone: `0944${suffix}`,
        phoneNormalized: normalizePhone(`0944${suffix}`),
        message: "الهدف",
        serviceId: serviceB.id,
        travelers: { create: [{ fullName: "Traveler", passportNo, sortOrder: 0 }] },
      },
    });

    const res = await agent.get(`/api/contact-requests/${target.id}/warnings`);
    assert.equal(res.status, 200);
    assert.equal(
      res.body.data.filter((w) => w.code === "POSSIBLE_DUPLICATE_APPLICATION").length,
      0,
      "a different service is not a duplicate"
    );
  });
});

describe("customer document reuse", () => {
  async function loginTrackingAgent(phone) {
    const agent = request.agent(app);
    const requestRes = await request(app).post("/api/tracking/request-code").send({ phone });
    const verifyRes = await agent.post("/api/tracking/verify-code").send({ phone, code: requestRes.body.debugCode });
    assert.equal(verifyRes.status, 200, JSON.stringify(verifyRes.body));
    return agent;
  }

  test("offers only the caller's own accepted, unexpired documents — never another customer's", async () => {
    const mineSuffix = uniqueSuffix();
    const minePhone = `0951${mineSuffix}`;
    const mine = await prisma.contactRequest.create({
      data: {
        name: "Reuse Owner",
        phone: minePhone,
        phoneNormalized: normalizePhone(minePhone),
        message: "طلب سابق",
        travelers: { create: [{ fullName: "Reuse Traveler", passportNo: "P77777777", sortOrder: 0 }] },
      },
      include: { travelers: true },
    });

    await prisma.contactRequestDocument.create({
      data: {
        contactRequestId: mine.id,
        travelerId: mine.travelers[0].id,
        label: "جواز السفر",
        fileName: "passport.png",
        storagePath: "contact-request-documents/reuse-mine.png",
        mimeType: "image/png",
        sizeBytes: 4,
        status: "ACCEPTED",
        ocrResult: { expirationDate: "2030-01-01" },
      },
    });
    // A pending one must not be offered — only reviewed-and-accepted files.
    await prisma.contactRequestDocument.create({
      data: {
        contactRequestId: mine.id,
        label: "مستند قيد المراجعة",
        fileName: "pending.png",
        storagePath: "contact-request-documents/reuse-pending.png",
        mimeType: "image/png",
        sizeBytes: 4,
        status: "PENDING",
      },
    });

    // Somebody else's accepted document, which must never appear.
    const otherSuffix = uniqueSuffix();
    const other = await prisma.contactRequest.create({
      data: {
        name: "Other Customer",
        phone: `0952${otherSuffix}`,
        phoneNormalized: normalizePhone(`0952${otherSuffix}`),
        message: "عميل آخر",
      },
    });
    await prisma.contactRequestDocument.create({
      data: {
        contactRequestId: other.id,
        label: "جواز عميل آخر",
        fileName: "other.png",
        storagePath: "contact-request-documents/reuse-other.png",
        mimeType: "image/png",
        sizeBytes: 4,
        status: "ACCEPTED",
      },
    });

    const trackingAgent = await loginTrackingAgent(minePhone);
    const res = await trackingAgent.get("/api/tracking/reusable-documents");

    assert.equal(res.status, 200, JSON.stringify(res.body));
    const labels = res.body.data.map((d) => d.label);
    assert.ok(labels.includes("جواز السفر"), "the caller's own accepted document is offered");
    assert.ok(!labels.includes("مستند قيد المراجعة"), "a pending document is not offered");
    assert.ok(!labels.includes("جواز عميل آخر"), "another customer's document must never be offered");

    // The passport number is masked in the list — enough to recognise, not
    // a reprint of the full number.
    const offered = res.body.data.find((d) => d.label === "جواز السفر");
    assert.equal(offered.passportHint, "*******77", "9-character number → 7 stars + last 2");
    assert.equal(offered.travelerName, "Reuse Traveler");
  });

  test("requires an authenticated tracking session", async () => {
    const res = await request(app).get("/api/tracking/reusable-documents");
    assert.equal(res.status, 401);
  });
});
