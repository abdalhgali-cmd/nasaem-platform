import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// Platform 3.0 Phase 8 (Security Approvals): the requirements checklist
// engine built in Phase 5 for VisaType is generalized here to also attach
// directly to a Service — Security Approvals is modeled as a Service, not
// a VisaType, but needs the exact same checklist/attachment/OCR behavior.
const TEST_CATEGORY = "qa-security-approval";

async function createService(agent, overrides = {}) {
  const suffix = uniqueSuffix();
  const res = await agent.post("/api/services").send({
    code: `SVC-SEC-${suffix}`,
    name: `Security Approval Test ${suffix}`,
    category: TEST_CATEGORY,
    basePrice: 200,
    currency: "SAR",
    processingTime: "3-5 أيام عمل",
    ...overrides,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

describe("service-scoped requirements checklist (Platform 3.0 Phase 8)", () => {
  let agent;
  let service;

  before(async () => {
    agent = await loginAsSuperAdmin();
    service = await createService(agent);
  });

  test("Service supports processingTime and it's returned on the public catalog", async () => {
    assert.equal(service.processingTime, "3-5 أيام عمل");

    const publicRes = await request(app).get("/api/services/public");
    const found = publicRes.body.data.services.find((s) => s.id === service.id);
    assert.ok(found);
    assert.equal(found.processingTime, "3-5 أيام عمل");
  });

  test("creates, lists and updates a requirement attached directly to a service", async () => {
    const createRes = await agent.post(`/api/services/${service.id}/requirements`).send({
      name: "خطاب طلب الموافقة الأمنية",
      attachmentType: "security_letter",
      required: true,
      allowedMimeTypes: ["application/pdf"],
    });
    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
    const reqId = createRes.body.data.id;
    assert.equal(createRes.body.data.serviceId, service.id);
    assert.equal(createRes.body.data.visaTypeId, null);

    const listRes = await agent.get(`/api/services/${service.id}/requirements`);
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.data.some((r) => r.id === reqId));

    const patchRes = await agent.patch(`/api/services/requirements/${reqId}`).send({ required: false });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.data.required, false);
  });

  test("404s creating a requirement for a service that doesn't exist", async () => {
    const res = await agent.post("/api/services/does-not-exist/requirements").send({ name: "x" });
    assert.equal(res.status, 404);
  });

  test("public checklist only returns active requirements for this service", async () => {
    const activeRes = await agent.post(`/api/services/${service.id}/requirements`).send({ name: "متطلب فعال", active: true });
    const inactiveRes = await agent.post(`/api/services/${service.id}/requirements`).send({ name: "متطلب معطل", active: false });

    const publicRes = await request(app).get(`/api/services/${service.id}/requirements/public`);
    assert.equal(publicRes.status, 200);
    const ids = publicRes.body.data.map((r) => r.id);
    assert.ok(ids.includes(activeRes.body.data.id));
    assert.ok(!ids.includes(inactiveRes.body.data.id));
  });

  test("a contact request submitted for this service (not a visa type) snapshots its checklist", async () => {
    const freshService = await createService(agent);
    const reqRes = await agent.post(`/api/services/${freshService.id}/requirements`).send({ name: "مستند الخدمة الأمنية" });
    assert.equal(reqRes.status, 201);

    const phone = `0966${uniqueSuffix()}`;
    const createRes = await request(app).post("/api/contact-requests").send({
      name: "Security Approval Snapshot Test",
      phone,
      message: "طلب موافقة أمنية",
      serviceId: freshService.id,
    });
    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));

    const listRes = await agent.get("/api/contact-requests?limit=50");
    const found = listRes.body.data.find((r) => r.id === createRes.body.data.id);
    assert.ok(found);
    assert.ok(Array.isArray(found.requirementsSnapshot));
    assert.equal(found.requirementsSnapshot.length, 1);
    assert.equal(found.requirementsSnapshot[0].name, "مستند الخدمة الأمنية");
  });

  test("a requirement attached to a visa type is rejected on an upload for a different service's contact request", async () => {
    // Cross-scope safety: a service-scoped contact request must not accept
    // an upload tagged with a visa-type-scoped requirement id, even if
    // that id is otherwise valid.
    const visaTypeRes = await agent.post("/api/visa-types").send({
      code: `VISA-XSCOPE-${uniqueSuffix()}`,
      name: "تأشيرة اختبار عبر النطاقات",
      country: "QA-Cross-Scope",
      basePrice: 10,
    });
    const foreignRequirementRes = await agent
      .post(`/api/visa-types/${visaTypeRes.body.data.id}/requirements`)
      .send({ name: "متطلب من تأشيرة" });

    const svc = await createService(agent);
    const phone = `0967${uniqueSuffix()}`;
    const createRes = await request(app)
      .post("/api/contact-requests")
      .field("name", "Cross Scope Test")
      .field("phone", phone)
      .field("message", "اختبار تداخل النطاقات")
      .field("serviceId", svc.id)
      .field("documentLabels", JSON.stringify(["مستند"]))
      .field("documentRequirementIds", JSON.stringify([foreignRequirementRes.body.data.id]))
      .attach("documents", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "doc.png", contentType: "image/png" });

    assert.equal(createRes.status, 400, JSON.stringify(createRes.body));
  });

  test("EMPLOYEE cannot create requirements on a service, but can read them", async () => {
    const suffix = uniqueSuffix();
    const email = `svcreq-employee-${suffix}@nasaem-platform.local`;
    await agent.post("/api/users").send({ fullName: "ServiceReq RBAC Employee", email, password: "TestPass@12345", role: "EMPLOYEE" });
    const employeeAgent = request.agent(app);
    await employeeAgent.post("/api/auth/login").send({ email, password: "TestPass@12345" });

    const createRes = await employeeAgent.post(`/api/services/${service.id}/requirements`).send({ name: "x" });
    assert.equal(createRes.status, 403);
    const listRes = await employeeAgent.get(`/api/services/${service.id}/requirements`);
    assert.equal(listRes.status, 200);
  });
});
