import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_FIXTURE = path.join(__dirname, "fixtures", "passport-mrz-sample.png");

// Own process (own fresh in-memory rate limiters), independent of every
// other test file — see contactRequests.test.js's budget comments. This
// file spends 3 of publicContactLimiter's 5 POST /contact-requests (one
// FLIGHTS, one UMRAH, one unmapped request) — no other test in this file
// may call POST /contact-requests. Document uploads go through the
// separate publicFileLimiter (30/15min), well under budget.
describe("ContactRequest department scoping (EMPLOYEE access control)", () => {
  let adminAgent;
  let employeeFlightsAgent;
  let employeeUmrahAgent;
  let employeeNoneAgent;
  let accountantAgent;
  let adminRoleAgent;
  let flightsId;
  let umrahId;
  let unmappedId;
  let carrierId;

  async function createStaffAgent(role, department) {
    const email = `dept-scoping-${role.toLowerCase()}-${uniqueSuffix()}@nasaem-platform.local`;
    const password = "TestPass@12345";
    const res = await adminAgent.post("/api/users").send({
      fullName: `Dept Scoping ${role}`,
      email,
      password,
      role,
      department: department || undefined,
    });
    assert.equal(res.status, 201);

    const agent = request.agent(app);
    const loginRes = await agent.post("/api/auth/login").send({ email, password });
    assert.equal(loginRes.status, 200);
    return agent;
  }

  before(async () => {
    adminAgent = await loginAsSuperAdmin();

    employeeFlightsAgent = await createStaffAgent("EMPLOYEE", "FLIGHTS");
    employeeUmrahAgent = await createStaffAgent("EMPLOYEE", "UMRAH");
    employeeNoneAgent = await createStaffAgent("EMPLOYEE", null);
    accountantAgent = await createStaffAgent("ACCOUNTANT", null);
    adminRoleAgent = await createStaffAgent("ADMIN", null);

    const flightsRes = await request(app).post("/api/contact-requests").send({
      name: "Dept Scoping Flights",
      phone: `097${uniqueSuffix()}`,
      service: "طيران",
      details: { من: "الخرطوم", إلى: "جدة" },
    });
    assert.equal(flightsRes.status, 201);
    flightsId = flightsRes.body.data.id;

    const umrahRes = await request(app).post("/api/contact-requests").send({
      name: "Dept Scoping Umrah",
      phone: `097${uniqueSuffix()}`,
      service: "عمرة",
      details: { "نوع الباقة": "تأشيرة عمرة فقط" },
    });
    assert.equal(umrahRes.status, 201);
    umrahId = umrahRes.body.data.id;

    const unmappedRes = await request(app).post("/api/contact-requests").send({
      name: "Dept Scoping Unmapped",
      phone: `097${uniqueSuffix()}`,
      message: "استفسار عام لا يخص أي خدمة محددة",
    });
    assert.equal(unmappedRes.status, 201);
    unmappedId = unmappedRes.body.data.id;

    const carrierRes = await adminAgent.post("/api/carriers").send({ name: `Dept Scoping Carrier ${uniqueSuffix()}`, mode: "AIR" });
    assert.equal(carrierRes.status, 201);
    carrierId = carrierRes.body.data.id;
  });

  test("list: a department-scoped EMPLOYEE sees their department + unmapped requests, not other departments", async () => {
    const res = await employeeFlightsAgent.get("/api/contact-requests?limit=100");
    assert.equal(res.status, 200);
    const ids = res.body.data.map((r) => r.id);
    assert.ok(ids.includes(flightsId));
    assert.ok(ids.includes(unmappedId));
    assert.ok(!ids.includes(umrahId));
  });

  test("list: the inverse department-scoped EMPLOYEE sees the opposite split", async () => {
    const res = await employeeUmrahAgent.get("/api/contact-requests?limit=100");
    assert.equal(res.status, 200);
    const ids = res.body.data.map((r) => r.id);
    assert.ok(ids.includes(umrahId));
    assert.ok(ids.includes(unmappedId));
    assert.ok(!ids.includes(flightsId));
  });

  // ACCOUNTANT is excluded here — GET /contact-requests' own requireRole
  // never included ACCOUNTANT even before this phase, a pre-existing
  // restriction unrelated to department scoping (see the 403/200 role
  // check in the next test instead).
  test("list: EMPLOYEE with no department, ADMIN, and SUPER_ADMIN all see every department", async () => {
    for (const agent of [employeeNoneAgent, adminRoleAgent, adminAgent]) {
      const res = await agent.get("/api/contact-requests?limit=100");
      assert.equal(res.status, 200);
      const ids = res.body.data.map((r) => r.id);
      assert.ok(ids.includes(flightsId));
      assert.ok(ids.includes(umrahId));
      assert.ok(ids.includes(unmappedId));
    }
  });

  test("ACCOUNTANT cannot list contact-requests at all (pre-existing role gate, unrelated to department scoping)", async () => {
    const res = await accountantAgent.get("/api/contact-requests?limit=100");
    assert.equal(res.status, 403);
  });

  test("list: an explicit ?department= filter works for an unscoped viewer", async () => {
    const res = await adminAgent.get(`/api/contact-requests?limit=100&department=UMRAH`);
    assert.equal(res.status, 200);
    const ids = res.body.data.map((r) => r.id);
    assert.ok(ids.includes(umrahId));
    assert.ok(!ids.includes(flightsId));
  });

  test("PATCH /:id/status: 403 across departments, 200 on own/unmapped", async () => {
    const forbiddenRes = await employeeFlightsAgent.patch(`/api/contact-requests/${umrahId}/status`).send({ status: "CONTACTED" });
    assert.equal(forbiddenRes.status, 403);

    const ownRes = await employeeFlightsAgent.patch(`/api/contact-requests/${flightsId}/status`).send({ status: "CONTACTED" });
    assert.equal(ownRes.status, 200);

    const unmappedRes = await employeeFlightsAgent.patch(`/api/contact-requests/${unmappedId}/status`).send({ status: "CONTACTED" });
    assert.equal(unmappedRes.status, 200);
  });

  test("GET /:id/offers and GET /:id/documents: 403 across departments, 200 on own", async () => {
    const forbiddenOffersRes = await employeeFlightsAgent.get(`/api/contact-requests/${umrahId}/offers`);
    assert.equal(forbiddenOffersRes.status, 403);
    const ownOffersRes = await employeeFlightsAgent.get(`/api/contact-requests/${flightsId}/offers`);
    assert.equal(ownOffersRes.status, 200);

    const forbiddenDocsRes = await employeeFlightsAgent.get(`/api/contact-requests/${umrahId}/documents`);
    assert.equal(forbiddenDocsRes.status, 403);
    const ownDocsRes = await employeeFlightsAgent.get(`/api/contact-requests/${flightsId}/documents`);
    assert.equal(ownDocsRes.status, 200);
  });

  test("PATCH /:id/offers/:offerId and POST .../withdraw: 403 for a cross-department offer", async () => {
    const createOfferRes = await adminAgent.post(`/api/contact-requests/${umrahId}/offers`).send({
      currency: "SAR",
      amount: 500,
      legs: [{ carrierId, direction: "OUTBOUND", fromLocation: "الخرطوم", toLocation: "جدة" }],
    });
    assert.equal(createOfferRes.status, 201);
    const offerId = createOfferRes.body.data.id;

    const patchRes = await employeeFlightsAgent.patch(`/api/contact-requests/${umrahId}/offers/${offerId}`).send({
      currency: "SAR",
      amount: 550,
      legs: [{ carrierId, direction: "OUTBOUND", fromLocation: "الخرطوم", toLocation: "جدة" }],
    });
    assert.equal(patchRes.status, 403);

    const withdrawRes = await employeeFlightsAgent.post(`/api/contact-requests/${umrahId}/offers/${offerId}/withdraw`);
    assert.equal(withdrawRes.status, 403);
  });

  test("GET /:id/documents/:documentId/file and GET /:id/payment-receipt: 403 for a cross-department request", async () => {
    const uploadRes = await request(app)
      .post(`/api/contact-requests/${umrahId}/passport-image`)
      .attach("images", IMAGE_FIXTURE);
    assert.equal(uploadRes.status, 200);

    const docsRes = await adminAgent.get(`/api/contact-requests/${umrahId}/documents`);
    const documentId = docsRes.body.data[0].id;

    const forbiddenFileRes = await employeeFlightsAgent.get(`/api/contact-requests/${umrahId}/documents/${documentId}/file`);
    assert.equal(forbiddenFileRes.status, 403);

    const forbiddenReceiptRes = await employeeFlightsAgent.get(`/api/contact-requests/${umrahId}/payment-receipt`);
    assert.equal(forbiddenReceiptRes.status, 403);
  });
});
