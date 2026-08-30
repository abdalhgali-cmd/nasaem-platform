import "./env.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// A category distinct from every seeded category ("package", "umrah",
// "visa", ...) so these fixtures never skew count-based assertions in
// other test files (e.g. contactRequestIntake.test.js's exact package
// count) that run against the same persistent test database.
const TEST_CATEGORY = "qa-test-category";

async function createService(agent, overrides = {}) {
  const suffix = uniqueSuffix();
  const res = await agent.post("/api/services").send({
    code: `SVC-${suffix}`,
    name: `Test Service ${suffix}`,
    category: TEST_CATEGORY,
    basePrice: 100,
    currency: "SAR",
    ...overrides,
  });
  assert.equal(res.status, 201);
  return res.body.data;
}

describe("dynamic service catalog (Platform 3.0 Phase 3)", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
  });

  test("only active services appear on the public catalog", async () => {
    const active = await createService(agent, { active: true });
    const inactive = await createService(agent, { active: false });

    const publicRes = await request(app).get("/api/services/public");
    assert.equal(publicRes.status, 200);
    const ids = publicRes.body.data.services.map((s) => s.id);
    assert.ok(ids.includes(active.id));
    assert.ok(!ids.includes(inactive.id));
  });

  test("deactivating a service via PATCH removes it from the public catalog", async () => {
    const svc = await createService(agent, { active: true });
    let publicRes = await request(app).get("/api/services/public");
    assert.ok(publicRes.body.data.services.some((s) => s.id === svc.id));

    const patchRes = await agent.patch(`/api/services/${svc.id}`).send({ active: false });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.data.active, false);

    publicRes = await request(app).get("/api/services/public");
    assert.ok(!publicRes.body.data.services.some((s) => s.id === svc.id));
  });

  test("creates a service with icon and features, rejects an invalid icon key", async () => {
    const svc = await createService(agent, { iconKey: "plane", features: ["أ", "ب", "ج"] });
    assert.equal(svc.iconKey, "plane");
    assert.deepEqual(svc.features, ["أ", "ب", "ج"]);

    const bad = await agent.post("/api/services").send({
      code: `SVC-${uniqueSuffix()}`,
      name: "Bad Icon Service",
      category: "package",
      basePrice: 10,
      iconKey: "not-a-real-icon",
    });
    assert.equal(bad.status, 400);
  });

  test("reorders services and the public catalog reflects the new order", async () => {
    const suffix = uniqueSuffix();
    const a = await createService(agent, { code: `SVC-A-${suffix}`, active: true });
    const b = await createService(agent, { code: `SVC-B-${suffix}`, active: true });

    const reorderRes = await agent.patch("/api/services/reorder").send({ order: [b.id, a.id] });
    assert.equal(reorderRes.status, 200);

    const publicRes = await request(app).get("/api/services/public");
    const services = publicRes.body.data.services;
    const bIndex = services.findIndex((s) => s.id === b.id);
    const aIndex = services.findIndex((s) => s.id === a.id);
    assert.ok(bIndex !== -1 && aIndex !== -1);
    assert.ok(bIndex < aIndex);
  });

  test("rejects a reorder list that doesn't match existing service ids", async () => {
    const res = await agent.patch("/api/services/reorder").send({ order: ["does-not-exist"] });
    assert.equal(res.status, 400);
  });

  test("uploads a service image and it becomes retrievable via the public site-assets file route", async () => {
    const svc = await createService(agent);
    const uploadRes = await agent
      .post(`/api/services/${svc.id}/image`)
      .attach("image", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "service.png", contentType: "image/png" });
    assert.equal(uploadRes.status, 200);
    assert.ok(uploadRes.body.data.imageKey);

    const fileRes = await request(app).get(`/api/site-assets/${uploadRes.body.data.imageKey}/file`);
    assert.equal(fileRes.status, 200);
  });

  test("404s uploading an image for a service that doesn't exist", async () => {
    const res = await agent
      .post("/api/services/does-not-exist/image")
      .attach("image", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "service.png", contentType: "image/png" });
    assert.equal(res.status, 404);
  });

  test("EMPLOYEE cannot create, reorder or upload images for services", async () => {
    const suffix = uniqueSuffix();
    const email = `services-employee-${suffix}@nasaem-platform.local`;
    await agent.post("/api/users").send({ fullName: "Services RBAC Employee", email, password: "TestPass@12345", role: "EMPLOYEE" });
    const employeeAgent = request.agent(app);
    await employeeAgent.post("/api/auth/login").send({ email, password: "TestPass@12345" });

    const createRes = await employeeAgent.post("/api/services").send({ code: `SVC-${suffix}`, name: "x", category: "package", basePrice: 1 });
    assert.equal(createRes.status, 403);
    const reorderRes = await employeeAgent.patch("/api/services/reorder").send({ order: ["x"] });
    assert.equal(reorderRes.status, 403);
  });
});

// Admin-managed hero visual identity (Platform 3.0 — comprehensive service
// experience gap #2): a service's dedicated/landing page hero image, mobile
// hero override, and optional motion clip must all be settable without a
// code change, through the same SiteAsset upload infrastructure and RBAC
// gate as the existing card image upload above — and must stay fully
// separate from the private customer-document upload paths (contact-request
// documents), which this suite never touches.
describe("admin-managed service hero media (Platform 3.0 comprehensive service experience)", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
  });

  test("uploads a desktop hero image and it becomes retrievable via the public site-assets file route", async () => {
    const svc = await createService(agent);
    const uploadRes = await agent
      .post(`/api/services/${svc.id}/hero-image`)
      .attach("image", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "hero.png", contentType: "image/png" });
    assert.equal(uploadRes.status, 200);
    assert.ok(uploadRes.body.data.heroImageKey);

    const fileRes = await request(app).get(`/api/site-assets/${uploadRes.body.data.heroImageKey}/file`);
    assert.equal(fileRes.status, 200);

    const publicRes = await request(app).get("/api/services/public");
    const found = publicRes.body.data.services.find((item) => item.id === svc.id);
    assert.equal(found.heroImageKey, uploadRes.body.data.heroImageKey);
  });

  test("uploads a mobile hero image override independently of the desktop hero image", async () => {
    const svc = await createService(agent);
    await agent
      .post(`/api/services/${svc.id}/hero-image`)
      .attach("image", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "hero.png", contentType: "image/png" });
    const mobileRes = await agent
      .post(`/api/services/${svc.id}/hero-image-mobile`)
      .attach("image", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "hero-mobile.png", contentType: "image/png" });

    assert.equal(mobileRes.status, 200);
    assert.ok(mobileRes.body.data.heroImageKey, "desktop hero image must survive the mobile-hero upload");
    assert.ok(mobileRes.body.data.heroImageMobileKey);
    assert.notEqual(mobileRes.body.data.heroImageKey, mobileRes.body.data.heroImageMobileKey);
  });

  test("uploads an MP4 motion clip and rejects a non-video file", async () => {
    const svc = await createService(agent);
    const okRes = await agent
      .post(`/api/services/${svc.id}/motion-video`)
      .attach("video", Buffer.from([0x00, 0x00, 0x00, 0x18]), { filename: "hero.mp4", contentType: "video/mp4" });
    assert.equal(okRes.status, 200);
    assert.ok(okRes.body.data.motionVideoKey);

    const fileRes = await request(app).get(`/api/site-assets/${okRes.body.data.motionVideoKey}/file`);
    assert.equal(fileRes.status, 200);

    const badRes = await agent
      .post(`/api/services/${svc.id}/motion-video`)
      .attach("video", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "not-a-video.png", contentType: "image/png" });
    assert.equal(badRes.status, 400);
  });

  test("motionEnabled can be toggled via PATCH and defaults to false", async () => {
    const created = await createService(agent);
    assert.equal(created.motionEnabled, false);

    const patchRes = await agent.patch(`/api/services/${created.id}`).send({ motionEnabled: true });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.data.motionEnabled, true);

    const publicRes = await request(app).get("/api/services/public");
    const found = publicRes.body.data.services.find((item) => item.id === created.id);
    assert.equal(found.motionEnabled, true);
  });

  test("404s uploading hero/motion media for a service that doesn't exist", async () => {
    const heroRes = await agent
      .post("/api/services/does-not-exist/hero-image")
      .attach("image", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "hero.png", contentType: "image/png" });
    assert.equal(heroRes.status, 404);

    const motionRes = await agent
      .post("/api/services/does-not-exist/motion-video")
      .attach("video", Buffer.from([0x00, 0x00, 0x00, 0x18]), { filename: "hero.mp4", contentType: "video/mp4" });
    assert.equal(motionRes.status, 404);
  });

  test("EMPLOYEE cannot upload hero images or motion video for services", async () => {
    const suffix = uniqueSuffix();
    const email = `services-media-employee-${suffix}@nasaem-platform.local`;
    await agent.post("/api/users").send({ fullName: "Services Media RBAC Employee", email, password: "TestPass@12345", role: "EMPLOYEE" });
    const employeeAgent = request.agent(app);
    await employeeAgent.post("/api/auth/login").send({ email, password: "TestPass@12345" });

    const svc = await createService(agent);
    const heroRes = await employeeAgent
      .post(`/api/services/${svc.id}/hero-image`)
      .attach("image", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "hero.png", contentType: "image/png" });
    assert.equal(heroRes.status, 403);

    const motionRes = await employeeAgent
      .post(`/api/services/${svc.id}/motion-video`)
      .attach("video", Buffer.from([0x00, 0x00, 0x00, 0x18]), { filename: "hero.mp4", contentType: "video/mp4" });
    assert.equal(motionRes.status, 403);
  });
});


describe("public Umrah packages catalog", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
  });

  test("returns active legacy and UMRAH_PACKAGE services with customer-safe fields", async () => {
    const suffix = uniqueSuffix();
    const activePackage = await createService(agent, {
      code: `UMRAH-ACTIVE-${suffix}`,
      name: "باقة عمرة نشطة",
      category: "UMRAH_PACKAGE",
      basePrice: 2500,
      features: ["DURATION: 10 أيام", "INCLUDED: النقل"],
      active: true,
    });
    const inactivePackage = await createService(agent, {
      code: `UMRAH-INACTIVE-${suffix}`,
      name: "باقة عمرة غير نشطة",
      category: "UMRAH_PACKAGE",
      active: false,
    });
    const legacyPackage = await createService(agent, {
      code: `LEGACY-PACKAGE-${suffix}`,
      name: "باقة سفر قديمة",
      category: "package",
      active: true,
    });
    const normalService = await createService(agent, {
      code: `NORMAL-${suffix}`,
      name: "خدمة عادية",
      category: TEST_CATEGORY,
      active: true,
    });

    const packagesRes = await request(app).get("/api/services/public/packages");
    assert.equal(packagesRes.status, 200);
    const packages = packagesRes.body.data;
    assert.ok(packages.some((item) => item.id === activePackage.id));
    assert.ok(!packages.some((item) => item.id === inactivePackage.id));
    assert.ok(packages.some((item) => item.id === legacyPackage.id));
    assert.ok(!packages.some((item) => item.id === normalService.id));

    const returned = packages.find((item) => item.id === activePackage.id);
    assert.equal(returned.category, "UMRAH_PACKAGE");
    assert.equal(returned.name, "باقة عمرة نشطة");
    assert.equal(returned.basePrice, "2500");
    assert.equal(returned.passwordHash, undefined);
    assert.equal(returned.internalNotes, undefined);
  });

  test("orders public Umrah packages by sortOrder and removes a deactivated package", async () => {
    const suffix = uniqueSuffix();
    const later = await createService(agent, {
      code: `UMRAH-LATER-${suffix}`,
      name: "باقة لاحقة",
      category: "UMRAH_PACKAGE",
      sortOrder: 90,
      active: true,
    });
    const first = await createService(agent, {
      code: `UMRAH-FIRST-${suffix}`,
      name: "باقة أولى",
      category: "UMRAH_PACKAGE",
      sortOrder: 10,
      active: true,
    });

    let packagesRes = await request(app).get("/api/services/public/packages");
    let packages = packagesRes.body.data;
    assert.ok(packages.findIndex((item) => item.id === first.id) < packages.findIndex((item) => item.id === later.id));

    const updateRes = await agent.patch(`/api/services/${later.id}`).send({ name: "باقة محدثة", active: false });
    assert.equal(updateRes.status, 200);
    packagesRes = await request(app).get("/api/services/public/packages");
    packages = packagesRes.body.data;
    assert.ok(!packages.some((item) => item.id === later.id));
    assert.equal(packages.find((item) => item.id === first.id).name, "باقة أولى");
  });

  test("keeps UMRAH_PACKAGE out of the general public service catalog", async () => {
    const pkg = await createService(agent, {
      code: `UMRAH-CATALOG-${uniqueSuffix()}`,
      name: "باقة لا تظهر كخدمة عامة",
      category: "UMRAH_PACKAGE",
      active: true,
    });
    const catalogRes = await request(app).get("/api/services/public");
    assert.equal(catalogRes.status, 200);
    assert.ok(!catalogRes.body.data.services.some((item) => item.id === pkg.id));
  });
});

// Covers the multi-currency / parallel-market conversion added on top of the
// public catalog (services.service.js's withSdgEquivalent). Prior coverage
// (contactRequestIntake.test.js) only asserted the fxRateToSdg/priceSdg keys
// exist on a response object, never their actual values or edge cases —
// this fills that gap.
describe("multi-currency SDG conversion (public catalog)", () => {
  let agent;
  let previousRates;

  before(async () => {
    agent = await loginAsSuperAdmin();
    const ratesRes = await agent.get("/api/flights/admin/rates");
    assert.equal(ratesRes.status, 200);
    previousRates = ratesRes.body.data;
  });

  after(async () => {
    // Restore whatever FX rates were live before this suite touched them —
    // same pattern as flightFxRefresh.test.js, since these Settings rows
    // are global, not per-test.
    await agent.patch("/api/flights/admin/rates").send(previousRates);
  });

  test("converts a SAR-priced service to SDG using the configured rate", async () => {
    const testRate = 42.5;
    const fxRes = await agent.patch("/api/flights/admin/rates").send({ ...previousRates, SAR: testRate });
    assert.equal(fxRes.status, 200, JSON.stringify(fxRes.body));

    const svc = await createService(agent, { currency: "SAR", basePrice: 100, active: true });
    const catalogRes = await request(app).get("/api/services/public");
    const found = catalogRes.body.data.services.find((item) => item.id === svc.id);
    assert.ok(found, "expected the SAR-priced test service in the public catalog");
    assert.equal(found.fxRateToSdg, testRate);
    assert.equal(found.priceSdg, 100 * testRate);
  });

  test("an SDG-priced service always converts at rate 1 regardless of configured rates", async () => {
    const svc = await createService(agent, { currency: "SDG", basePrice: 250, active: true });
    const catalogRes = await request(app).get("/api/services/public");
    const found = catalogRes.body.data.services.find((item) => item.id === svc.id);
    assert.ok(found);
    assert.equal(found.fxRateToSdg, 1);
    assert.equal(found.priceSdg, 250);
  });

  test("a zero exchange rate reports the price as not convertible instead of a zero/free price", async () => {
    const fxRes = await agent.patch("/api/flights/admin/rates").send({ ...previousRates, AED: 0 });
    assert.equal(fxRes.status, 200, JSON.stringify(fxRes.body));

    const svc = await createService(agent, { currency: "AED", basePrice: 100, active: true });
    const catalogRes = await request(app).get("/api/services/public");
    const found = catalogRes.body.data.services.find((item) => item.id === svc.id);
    assert.ok(found);
    assert.equal(found.fxRateToSdg, null, "a 0 rate must not be reported as a valid conversion rate");
    assert.equal(found.priceSdg, null, "priceSdg must not silently become 0 when the rate is unset");
  });

  test("a currency with no configured FX rate at all (e.g. USD unset) reports null instead of NaN", async () => {
    const fxRes = await agent.patch("/api/flights/admin/rates").send({ SAR: previousRates.SAR, AED: previousRates.AED, EGP: previousRates.EGP, USD: 0 });
    assert.equal(fxRes.status, 200, JSON.stringify(fxRes.body));

    const svc = await createService(agent, { currency: "USD", basePrice: 100, active: true });
    const catalogRes = await request(app).get("/api/services/public");
    const found = catalogRes.body.data.services.find((item) => item.id === svc.id);
    assert.ok(found);
    assert.equal(found.fxRateToSdg, null);
    assert.equal(found.priceSdg, null);
  });

  test("negative FX rates are rejected at the write endpoint", async () => {
    const res = await agent.patch("/api/flights/admin/rates").send({ SAR: -1 });
    assert.equal(res.status, 400);
  });
});
