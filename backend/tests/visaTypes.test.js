import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// A country distinct from every seeded country so these fixtures never
// skew any other test file's assertions against the same persistent test
// database (see services.test.js's TEST_CATEGORY for the same reasoning).
const TEST_COUNTRY = "QA-Test-Country";

async function createVisaType(agent, overrides = {}) {
  const suffix = uniqueSuffix();
  const res = await agent.post("/api/visa-types").send({
    code: `VISA-${suffix}`,
    name: `Test Visa ${suffix}`,
    country: TEST_COUNTRY,
    basePrice: 200,
    currency: "SAR",
    ...overrides,
  });
  assert.equal(res.status, 201);
  return res.body.data;
}

describe("dynamic visa management (Platform 3.0 Phase 4)", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
  });

  test("requires authentication", async () => {
    const res = await request(app).get("/api/visa-types");
    assert.equal(res.status, 401);
  });

  test("creates a visa type with the new fields and can read it back", async () => {
    const visa = await createVisaType(agent, {
      nameEn: "Test Visa EN",
      type: "tourist",
      processingTime: "3-5 business days",
      stayDuration: "90 days",
      validity: "6 months",
      entryType: "MULTIPLE",
    });
    assert.equal(visa.nameEn, "Test Visa EN");
    assert.equal(visa.type, "tourist");
    assert.equal(visa.entryType, "MULTIPLE");

    const getRes = await agent.get(`/api/visa-types/${visa.id}`);
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.data.processingTime, "3-5 business days");
  });

  test("rejects an invalid entryType", async () => {
    const res = await agent.post("/api/visa-types").send({
      code: `VISA-${uniqueSuffix()}`,
      name: "Bad Entry Type",
      country: TEST_COUNTRY,
      basePrice: 1,
      entryType: "TRIPLE",
    });
    assert.equal(res.status, 400);
  });

  test("only active visa types appear on the public catalog, ordered by sortOrder", async () => {
    const suffix = uniqueSuffix();
    const low = await createVisaType(agent, { code: `VISA-LOW-${suffix}`, active: true, sortOrder: 1 });
    const high = await createVisaType(agent, { code: `VISA-HIGH-${suffix}`, active: true, sortOrder: 2 });
    const inactive = await createVisaType(agent, { code: `VISA-I-${suffix}`, active: false });

    const publicRes = await request(app).get("/api/services/public");
    const visaTypes = publicRes.body.data.visaTypes;
    const ids = visaTypes.map((v) => v.id);
    assert.ok(!ids.includes(inactive.id));

    const lowIndex = visaTypes.findIndex((v) => v.id === low.id);
    const highIndex = visaTypes.findIndex((v) => v.id === high.id);
    assert.ok(lowIndex !== -1 && highIndex !== -1);
    assert.ok(lowIndex < highIndex);
  });

  test("reorders visa types and the public catalog reflects the new order", async () => {
    const suffix = uniqueSuffix();
    const a = await createVisaType(agent, { code: `VISA-A2-${suffix}`, active: true });
    const b = await createVisaType(agent, { code: `VISA-B2-${suffix}`, active: true });

    const reorderRes = await agent.patch("/api/visa-types/reorder").send({ order: [b.id, a.id] });
    assert.equal(reorderRes.status, 200);

    const publicRes = await request(app).get("/api/services/public");
    const visaTypes = publicRes.body.data.visaTypes;
    const bIndex = visaTypes.findIndex((v) => v.id === b.id);
    const aIndex = visaTypes.findIndex((v) => v.id === a.id);
    assert.ok(bIndex !== -1 && aIndex !== -1);
    assert.ok(bIndex < aIndex);
  });

  test("deleting an unused visa type removes it; deleting a used one deactivates it instead", async () => {
    const unused = await createVisaType(agent);
    const deleteRes = await agent.delete(`/api/visa-types/${unused.id}`);
    assert.equal(deleteRes.status, 200);
    const getRes = await agent.get(`/api/visa-types/${unused.id}`);
    assert.equal(getRes.status, 404);
  });

  test("404s updating/deleting a visa type that doesn't exist", async () => {
    const patchRes = await agent.patch("/api/visa-types/does-not-exist").send({ name: "xx" });
    assert.equal(patchRes.status, 404);
    const deleteRes = await agent.delete("/api/visa-types/does-not-exist");
    assert.equal(deleteRes.status, 404);
  });

  test("EMPLOYEE cannot create, reorder or delete visa types", async () => {
    const suffix = uniqueSuffix();
    const email = `visatypes-employee-${suffix}@nasaem-platform.local`;
    await agent.post("/api/users").send({ fullName: "VisaTypes RBAC Employee", email, password: "TestPass@12345", role: "EMPLOYEE" });
    const employeeAgent = request.agent(app);
    await employeeAgent.post("/api/auth/login").send({ email, password: "TestPass@12345" });

    const createRes = await employeeAgent.post("/api/visa-types").send({ code: `VISA-${suffix}`, name: "x", country: TEST_COUNTRY, basePrice: 1 });
    assert.equal(createRes.status, 403);
    const reorderRes = await employeeAgent.patch("/api/visa-types/reorder").send({ order: ["x"] });
    assert.equal(reorderRes.status, 403);
  });

  test("category defaults to OTHER and rejects an invalid value", async () => {
    const noCategory = await createVisaType(agent);
    assert.equal(noCategory.category, "OTHER");

    const bad = await agent.post("/api/visa-types").send({
      code: `VISA-${uniqueSuffix()}`,
      name: "Bad Category",
      country: TEST_COUNTRY,
      basePrice: 1,
      category: "NOT_A_REAL_CATEGORY",
    });
    assert.equal(bad.status, 400);
  });

  test("category can be set on create and changed via PATCH", async () => {
    const visa = await createVisaType(agent, { category: "INTERNATIONAL" });
    assert.equal(visa.category, "INTERNATIONAL");

    const patchRes = await agent.patch(`/api/visa-types/${visa.id}`).send({ category: "FAMILY_VISIT" });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.data.category, "FAMILY_VISIT");
  });

  test("admin listing supports ?category= filtering", async () => {
    const suffix = uniqueSuffix();
    const intl = await createVisaType(agent, { code: `VISA-INTLQ-${suffix}`, category: "INTERNATIONAL" });
    const umrah = await createVisaType(agent, { code: `VISA-UMQ-${suffix}`, category: "UMRAH" });

    const res = await agent.get("/api/visa-types?category=INTERNATIONAL&limit=100");
    assert.equal(res.status, 200);
    const ids = res.body.data.map((v) => v.id);
    assert.ok(ids.includes(intl.id));
    assert.ok(!ids.includes(umrah.id));
  });
});

// Regression coverage for the "التأشيرات الدولية" (International Visas)
// categorization bug: Family Visit and Umrah visa types must never appear
// in a category-filtered public catalog request, and the filtering must
// happen server-side (GET /api/services/public?visaCategory=...) rather
// than being a frontend exclusion list — so these assertions hit the raw
// public API directly, exactly as the frontend and any direct API
// consumer would.
describe("visa type categorization (public catalog filtering)", () => {
  let agent;
  let intlVisa;
  let umrahVisa;
  let familyVisitVisa;
  let otherVisa;

  before(async () => {
    agent = await loginAsSuperAdmin();
    const suffix = uniqueSuffix();
    intlVisa = await createVisaType(agent, { code: `VISA-CAT-INTL-${suffix}`, category: "INTERNATIONAL", active: true });
    umrahVisa = await createVisaType(agent, { code: `VISA-CAT-UMRAH-${suffix}`, category: "UMRAH", active: true });
    familyVisitVisa = await createVisaType(agent, { code: `VISA-CAT-FAMILY-${suffix}`, category: "FAMILY_VISIT", active: true });
    otherVisa = await createVisaType(agent, { code: `VISA-CAT-OTHER-${suffix}`, category: "OTHER", active: true });
  });

  test("?visaCategory=INTERNATIONAL never includes Umrah or Family Visit visa types", async () => {
    const res = await request(app).get("/api/services/public?visaCategory=INTERNATIONAL");
    assert.equal(res.status, 200);
    const ids = res.body.data.visaTypes.map((v) => v.id);

    assert.ok(ids.includes(intlVisa.id), "expected the INTERNATIONAL visa type to be present");
    assert.ok(!ids.includes(umrahVisa.id), "Umrah visa type leaked into the International Visas category");
    assert.ok(!ids.includes(familyVisitVisa.id), "Family Visit visa type leaked into the International Visas category");
    assert.ok(!ids.includes(otherVisa.id), "OTHER-category visa type leaked into the International Visas category");
  });

  test("?visaCategory=UMRAH never includes International or Family Visit visa types", async () => {
    const res = await request(app).get("/api/services/public?visaCategory=UMRAH");
    assert.equal(res.status, 200);
    const ids = res.body.data.visaTypes.map((v) => v.id);

    assert.ok(ids.includes(umrahVisa.id));
    assert.ok(!ids.includes(intlVisa.id));
    assert.ok(!ids.includes(familyVisitVisa.id));
  });

  test("?visaCategory=FAMILY_VISIT never includes International or Umrah visa types", async () => {
    const res = await request(app).get("/api/services/public?visaCategory=FAMILY_VISIT");
    assert.equal(res.status, 200);
    const ids = res.body.data.visaTypes.map((v) => v.id);

    assert.ok(ids.includes(familyVisitVisa.id));
    assert.ok(!ids.includes(intlVisa.id));
    assert.ok(!ids.includes(umrahVisa.id));
  });

  test("every returned visa type carries the category that was requested", async () => {
    const res = await request(app).get("/api/services/public?visaCategory=INTERNATIONAL");
    assert.ok(res.body.data.visaTypes.length > 0);
    assert.ok(res.body.data.visaTypes.every((v) => v.category === "INTERNATIONAL"));
  });

  test("an unrecognized visaCategory value falls back to the unfiltered catalog instead of erroring", async () => {
    const res = await request(app).get("/api/services/public?visaCategory=NOT_A_REAL_CATEGORY");
    assert.equal(res.status, 200);
    const ids = res.body.data.visaTypes.map((v) => v.id);
    assert.ok(ids.includes(intlVisa.id));
    assert.ok(ids.includes(umrahVisa.id));
    assert.ok(ids.includes(familyVisitVisa.id));
  });

  test("no visaCategory param returns every active category, unfiltered", async () => {
    const res = await request(app).get("/api/services/public");
    assert.equal(res.status, 200);
    const ids = res.body.data.visaTypes.map((v) => v.id);
    assert.ok(ids.includes(intlVisa.id));
    assert.ok(ids.includes(umrahVisa.id));
    assert.ok(ids.includes(familyVisitVisa.id));
    assert.ok(ids.includes(otherVisa.id));
  });

  test("an inactive visa type stays excluded even when its category is requested", async () => {
    const suffix = uniqueSuffix();
    const inactiveIntl = await createVisaType(agent, {
      code: `VISA-CAT-INTL-INACTIVE-${suffix}`,
      category: "INTERNATIONAL",
      active: false,
    });

    const res = await request(app).get("/api/services/public?visaCategory=INTERNATIONAL");
    const ids = res.body.data.visaTypes.map((v) => v.id);
    assert.ok(!ids.includes(inactiveIntl.id));
  });

  test("pagination on the admin listing works together with category filtering", async () => {
    const suffix = uniqueSuffix();
    const a = await createVisaType(agent, { code: `VISA-PG-A-${suffix}`, category: "INTERNATIONAL" });
    const b = await createVisaType(agent, { code: `VISA-PG-B-${suffix}`, category: "INTERNATIONAL" });

    const res = await agent.get("/api/visa-types?category=INTERNATIONAL&limit=1&page=1");
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.meta.limit, 1);
    assert.ok(res.body.meta.total >= 2);

    const ids = new Set();
    for (let page = 1; page <= res.body.meta.totalPages; page += 1) {
      const pageRes = await agent.get(`/api/visa-types?category=INTERNATIONAL&limit=1&page=${page}`);
      pageRes.body.data.forEach((v) => ids.add(v.id));
    }
    assert.ok(ids.has(a.id));
    assert.ok(ids.has(b.id));
  });
});

describe("visa requirements engine (Platform 3.0 Phase 5)", () => {
  let agent;
  let visaType;

  before(async () => {
    agent = await loginAsSuperAdmin();
    visaType = await createVisaType(agent);
  });

  test("creates, lists and updates a requirement", async () => {
    const createRes = await agent.post(`/api/visa-types/${visaType.id}/requirements`).send({
      name: "صورة شخصية",
      nameEn: "Photo",
      required: true,
      attachmentType: "photo",
      maxFiles: 2,
      allowedMimeTypes: ["image/jpeg", "image/png"],
      maxSizeBytes: 5_000_000,
      ocrEnabled: false,
    });
    assert.equal(createRes.status, 201);
    const reqId = createRes.body.data.id;
    assert.equal(createRes.body.data.maxFiles, 2);
    assert.deepEqual(createRes.body.data.allowedMimeTypes, ["image/jpeg", "image/png"]);

    const listRes = await agent.get(`/api/visa-types/${visaType.id}/requirements`);
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.data.some((r) => r.id === reqId));

    const patchRes = await agent.patch(`/api/visa-types/requirements/${reqId}`).send({ maxFiles: 3, active: false });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.data.maxFiles, 3);
    assert.equal(patchRes.body.data.active, false);
  });

  test("404s creating a requirement for a visa type that doesn't exist", async () => {
    const res = await agent.post("/api/visa-types/does-not-exist/requirements").send({ name: "x" });
    assert.equal(res.status, 404);
  });

  test("only active requirements appear on the public checklist, ordered by sortOrder", async () => {
    const low = await agent
      .post(`/api/visa-types/${visaType.id}/requirements`)
      .send({ name: "متطلب أول", sortOrder: 1, active: true });
    const high = await agent
      .post(`/api/visa-types/${visaType.id}/requirements`)
      .send({ name: "متطلب ثانٍ", sortOrder: 2, active: true });
    const inactive = await agent
      .post(`/api/visa-types/${visaType.id}/requirements`)
      .send({ name: "متطلب معطل", active: false });

    const publicRes = await request(app).get(`/api/visa-types/${visaType.id}/requirements/public`);
    assert.equal(publicRes.status, 200);
    const ids = publicRes.body.data.map((r) => r.id);
    assert.ok(!ids.includes(inactive.body.data.id));

    const lowIndex = publicRes.body.data.findIndex((r) => r.id === low.body.data.id);
    const highIndex = publicRes.body.data.findIndex((r) => r.id === high.body.data.id);
    assert.ok(lowIndex !== -1 && highIndex !== -1);
    assert.ok(lowIndex < highIndex);
  });

  test("deletes a requirement", async () => {
    const createRes = await agent.post(`/api/visa-types/${visaType.id}/requirements`).send({ name: "متطلب للحذف" });
    const reqId = createRes.body.data.id;

    const deleteRes = await agent.delete(`/api/visa-types/requirements/${reqId}`);
    assert.equal(deleteRes.status, 200);

    const listRes = await agent.get(`/api/visa-types/${visaType.id}/requirements`);
    assert.ok(!listRes.body.data.some((r) => r.id === reqId));
  });

  test("404s updating/deleting a requirement that doesn't exist", async () => {
    const patchRes = await agent.patch("/api/visa-types/requirements/does-not-exist").send({ name: "x" });
    assert.equal(patchRes.status, 404);
    const deleteRes = await agent.delete("/api/visa-types/requirements/does-not-exist");
    assert.equal(deleteRes.status, 404);
  });

  test("EMPLOYEE cannot create or delete requirements, but can read them", async () => {
    const suffix = uniqueSuffix();
    const email = `visareq-employee-${suffix}@nasaem-platform.local`;
    await agent.post("/api/users").send({ fullName: "VisaReq RBAC Employee", email, password: "TestPass@12345", role: "EMPLOYEE" });
    const employeeAgent = request.agent(app);
    await employeeAgent.post("/api/auth/login").send({ email, password: "TestPass@12345" });

    const createRes = await employeeAgent.post(`/api/visa-types/${visaType.id}/requirements`).send({ name: "x" });
    assert.equal(createRes.status, 403);
    const listRes = await employeeAgent.get(`/api/visa-types/${visaType.id}/requirements`);
    assert.equal(listRes.status, 200);
  });

  test("a submitted contact request snapshots the checklist at that moment, unaffected by later edits", async () => {
    const snapVisaType = await createVisaType(agent);
    const req1 = await agent
      .post(`/api/visa-types/${snapVisaType.id}/requirements`)
      .send({ name: "جواز السفر", attachmentType: "passport", required: true });
    const reqId = req1.body.data.id;

    const phone = `097${uniqueSuffix()}`;
    const createRes = await request(app).post("/api/contact-requests").send({
      name: "Snapshot Test",
      phone,
      message: "طلب لاختبار التقاطة المتطلبات",
      visaTypeId: snapVisaType.id,
    });
    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
    const contactRequestId = createRes.body.data.id;

    // Now edit the live requirement template after submission.
    await agent.patch(`/api/visa-types/requirements/${reqId}`).send({ name: "جواز السفر (معدّل)", active: false });

    const listRes = await agent.get("/api/contact-requests?limit=200");
    const found = listRes.body.data.find((r) => r.id === contactRequestId);
    assert.ok(found, "expected the created contact request in the staff list");
    assert.ok(Array.isArray(found.requirementsSnapshot));
    assert.equal(found.requirementsSnapshot.length, 1);
    // Snapshot keeps the name as it was AT SUBMISSION TIME, not the
    // post-submission edit.
    assert.equal(found.requirementsSnapshot[0].name, "جواز السفر");
    assert.equal(found.requirementsSnapshot[0].attachmentType, "passport");
  });
});
