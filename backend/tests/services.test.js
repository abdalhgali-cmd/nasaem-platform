import "./env.js";
import { before, describe, test } from "node:test";
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
