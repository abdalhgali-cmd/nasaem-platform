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
});
