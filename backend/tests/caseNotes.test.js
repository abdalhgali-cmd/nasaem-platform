import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";

// Internal staff notes on a case (see CaseNote schema comment): append-only,
// never customer-facing, gated to the roles that already work cases.

async function createCase(overrides = {}) {
  return prisma.contactRequest.create({
    data: {
      name: "Note Test Customer",
      phone: `0932${uniqueSuffix()}`,
      phoneNormalized: `+249932${uniqueSuffix()}`,
      message: "حالة اختبار الملاحظات",
      ...overrides,
    },
  });
}

async function createEmployee(agent, roleOverride = "EMPLOYEE") {
  const suffix = uniqueSuffix();
  const email = `note-${roleOverride.toLowerCase()}-${suffix}@nasaem-platform.local`;
  const password = "TestPass@12345";
  const createRes = await agent.post("/api/users").send({
    fullName: `Note Test ${roleOverride}`,
    email,
    password,
    role: roleOverride,
  });
  assert.equal(createRes.status, 201, JSON.stringify(createRes.body));

  const employeeAgent = request.agent(app);
  const loginRes = await employeeAgent.post("/api/auth/login").send({ email, password });
  assert.equal(loginRes.status, 200);

  return { agent: employeeAgent, user: createRes.body.data };
}

describe("case notes API", () => {
  let superAdminAgent;

  before(async () => {
    superAdminAgent = await loginAsSuperAdmin();
  });

  test("EMPLOYEE can add and read a note; it is never exposed to the customer", async () => {
    const contactRequest = await createCase();
    const employee = await createEmployee(superAdminAgent);

    const createRes = await employee.agent
      .post(`/api/contact-requests/${contactRequest.id}/notes`)
      .send({ body: "تم الاتصال بالعميل ولم يرد" });
    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
    assert.equal(createRes.body.data.body, "تم الاتصال بالعميل ولم يرد");
    assert.equal(createRes.body.data.author.id, employee.user.id);
    // safeUserSelect projection — never a password hash.
    assert.equal(createRes.body.data.author.passwordHash, undefined);

    const listRes = await superAdminAgent.get(`/api/contact-requests/${contactRequest.id}/notes`);
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.data.length, 1);
    assert.equal(listRes.body.data[0].id, createRes.body.data.id);
  });

  test("rejects an empty note", async () => {
    const contactRequest = await createCase();
    const res = await superAdminAgent.post(`/api/contact-requests/${contactRequest.id}/notes`).send({ body: "x" });
    assert.equal(res.status, 400);
  });

  test("404s on a contact request that doesn't exist", async () => {
    const res = await superAdminAgent.post("/api/contact-requests/does-not-exist/notes").send({ body: "ملاحظة" });
    assert.equal(res.status, 404);
  });

  test("a note added through one case is not visible through another case's URL (IDOR)", async () => {
    const caseA = await createCase();
    const caseB = await createCase();

    const created = await superAdminAgent.post(`/api/contact-requests/${caseA.id}/notes`).send({ body: "ملاحظة أ" });
    assert.equal(created.status, 201);

    const crossRes = await superAdminAgent.get(`/api/contact-requests/${caseB.id}/notes`);
    assert.equal(crossRes.status, 200);
    assert.equal(crossRes.body.data.length, 0);
  });

  test("unauthenticated requests are rejected", async () => {
    const contactRequest = await createCase();
    const res = await request(app).get(`/api/contact-requests/${contactRequest.id}/notes`);
    assert.equal(res.status, 401);
  });

  test("ACCOUNTANT cannot read or add case notes — internal operations only, not a finance action", async () => {
    const contactRequest = await createCase();
    const accountant = await createEmployee(superAdminAgent, "ACCOUNTANT");

    const readRes = await accountant.agent.get(`/api/contact-requests/${contactRequest.id}/notes`);
    assert.equal(readRes.status, 403);

    const writeRes = await accountant.agent
      .post(`/api/contact-requests/${contactRequest.id}/notes`)
      .send({ body: "محاولة غير مصرح بها" });
    assert.equal(writeRes.status, 403);
  });
});
