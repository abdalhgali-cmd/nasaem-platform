// T10: a regular EMPLOYEE changes an Umrah request only while it is assigned to
// them; an unassigned one is taken with the explicit, concurrency-safe claim;
// managers keep their authority (including reassigning); finance is unchanged;
// other organizations see nothing; non-Umrah requests are untouched.
import "./env.js";
import "./helpers/journeyLimits.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request, uniqueSuffix } from "./helpers/api.js";
import { createOrganization, createStaffUser, staffClient } from "./helpers/staff.js";
import { testPhone, PDF } from "./helpers/workflow.js";
import { staffScopeForRequest, withStaffRequestScope } from "../src/modules/contact-request-workflow/staff-request-scope.js";

let admin;
let adminUser;
let employee;
let employeeUser;
let colleague;
let colleagueUser;
let accountant;
let umrahService;

before(async () => {
  adminUser = await createStaffUser({ role: "ADMIN" });
  admin = staffClient(adminUser);
  employeeUser = await createStaffUser({ role: "EMPLOYEE" });
  employee = staffClient(employeeUser);
  colleagueUser = await createStaffUser({ role: "EMPLOYEE" });
  colleague = staffClient(colleagueUser);
  accountant = staffClient(await createStaffUser({ role: "ACCOUNTANT" }));
  const created = await admin.post("/api/services").send({ code: `TEST-ASG-${uniqueSuffix()}`, name: "TEST-ASG باقة", category: "UMRAH_PACKAGE", basePrice: 100, currency: "SAR", active: true, pricingMode: "FIXED", priceUnit: "PER_TRAVELER", features: ["KIND: VISA_ONLY"] });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  umrahService = created.body.data;
});

async function umrahRequest() {
  const passport = await prisma.visaRequirement.findFirst({ where: { serviceId: umrahService.id, attachmentType: "umrah_passport" } });
  const res = await request(app)
    .post("/api/contact-requests")
    .field("name", "TEST-ASG عميل")
    .field("phone", testPhone())
    .field("service", umrahService.name)
    .field("serviceId", umrahService.id)
    .field("message", "TEST-ASG")
    .field("travelerCount", "1")
    .field("travelers", JSON.stringify([{ fullName: "معتمر", isPrimary: true }]))
    .field("acceptedTotal", "100")
    .field("acceptedCurrency", "SAR")
    .field("guarantorPhone", "+966 50 333 4444")
    .field("documentLabels", JSON.stringify(["جواز المعتمر"]))
    .field("documentRequirementIds", JSON.stringify([passport.id]))
    .field("documentTravelerIndexes", JSON.stringify(["0"]))
    .attach("documents", PDF(), { filename: "passport.pdf", contentType: "application/pdf" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.id;
}

const work = [
  ["PATCH status", (c, id) => c.patch(`/api/contact-requests/${id}/status`).send({ status: "CONTACTED" })],
  ["POST notes", (c, id) => c.post(`/api/contact-requests/${id}/notes`).send({ body: "ملاحظة اختبار" })],
  ["POST tasks", (c, id) => c.post(`/api/contact-requests/${id}/tasks`).send({ title: "مهمة اختبار" })],
  ["POST start-execution", (c, id) => c.post(`/api/contact-requests/${id}/start-execution`).send({})],
];

describe("assignment gate for EMPLOYEE on Umrah requests", () => {
  for (const [label, send] of [
    ["status", (id) => employee.patch(`/api/contact-requests/${id}/status`).send({ status: "CONTACTED" })],
    ["note", (id) => employee.post(`/api/contact-requests/${id}/notes`).send({ body: "TEST forbidden after reassignment" })],
    ["task", (id) => employee.post(`/api/contact-requests/${id}/tasks`).send({ title: "TEST forbidden after reassignment" })],
    ["document review", async (id) => {
      const doc = await prisma.contactRequestDocument.findFirst({ where: { contactRequestId: id } });
      return employee.patch(`/api/contact-requests/${id}/documents/${doc.id}/status`).send({ status: "ACCEPTED" });
    }],
  ]) test(`reassignment while ${label} waits for its row lock revokes the old employee`, async () => {
    const id = await umrahRequest();
    await prisma.contactRequest.update({ where: { id }, data: { assignedUserId: employeeUser.id } });
    let pending;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ContactRequest" WHERE id = ${id} FOR UPDATE`;
      const [{ pid: blocker }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
      pending = Promise.resolve(send(id));
      // Prove the HTTP request passed middleware and is actually waiting on
      // this lock; a timing-only sleep would not reproduce the race reliably.
      let blocked = false;
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const [{ count }] = await prisma.$queryRaw`SELECT count(*)::int AS count FROM pg_stat_activity WHERE ${blocker} = ANY(pg_blocking_pids(pid))`;
        if (count > 0) { blocked = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(blocked, true, "the employee must be waiting on the request lock");
      await tx.contactRequest.update({ where: { id }, data: { assignedUserId: colleagueUser.id } });
    }, { timeout: 10000 });
    const result = await pending;
    assert.equal(result.status, 403, JSON.stringify(result.body));
    assert.equal(result.body.code, "ASSIGNED_TO_OTHER");
    const stored = await prisma.contactRequest.findUnique({ where: { id } });
    assert.equal(stored.status, "NEW", "the old employee's write must not commit");
    assert.equal(stored.assignedUserId, colleagueUser.id);
    assert.equal(await prisma.caseNote.count({ where: { contactRequestId: id } }), 0);
    assert.equal(await prisma.caseTask.count({ where: { contactRequestId: id, source: "MANUAL" } }), 0);
    assert.equal(await prisma.contactRequestDocument.count({ where: { contactRequestId: id, status: "ACCEPTED" } }), 0);
  });

  test("authenticated scope stays isolated across simultaneous requests and is cleared afterwards", async () => {
    const run = (id, user) => withStaffRequestScope(id, user, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      assert.equal(staffScopeForRequest(id).userId, user.id);
      assert.equal(staffScopeForRequest(`${id}-other`), null);
      return staffScopeForRequest(id).organizationId;
    });
    assert.deepEqual(await Promise.all([
      run("one", { id: "employee-one", role: "EMPLOYEE", organizationId: "org-one" }),
      run("two", { id: "employee-two", role: "EMPLOYEE", organizationId: "org-two" }),
    ]), ["org-one", "org-two"]);
    assert.equal(staffScopeForRequest("one"), null);
  });

  test("reading is open; every work mutation on an unassigned request says «claim first»", async () => {
    const id = await umrahRequest();
    assert.equal((await employee.get(`/api/contact-requests/${id}`)).status, 200, "staff can read an unassigned request");
    for (const [name, call] of work) {
      const res = await call(employee, id);
      assert.equal(res.status, 409, `${name}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.code, "CLAIM_REQUIRED", name);
    }
    assert.equal((await prisma.contactRequest.findUnique({ where: { id } })).assignedUserId, null, "nothing assigned by a refused attempt");
  });

  test("claim, then work; a colleague is refused; a repeat claim is harmless; a manager overrides and reassigns", async () => {
    const id = await umrahRequest();
    const claimed = await employee.post(`/api/contact-requests/${id}/claim`).send({});
    assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
    assert.equal(claimed.body.data.claimed, true);
    assert.equal((await employee.patch(`/api/contact-requests/${id}/status`).send({ status: "CONTACTED" })).status, 200);
    const again = await employee.post(`/api/contact-requests/${id}/claim`).send({});
    assert.equal(again.status, 200);
    assert.equal(again.body.data.claimed, false, "already mine: no change");

    const other = await colleague.patch(`/api/contact-requests/${id}/status`).send({ status: "NEW" });
    assert.equal(other.status, 403);
    assert.equal(other.body.code, "ASSIGNED_TO_OTHER");
    const takeOver = await colleague.post(`/api/contact-requests/${id}/claim`).send({});
    assert.equal(takeOver.status, 409);
    assert.equal(takeOver.body.code, "ALREADY_ASSIGNED");

    // a manager works any request and reassigns; the new assignee works, the old one no longer
    assert.equal((await admin.post(`/api/contact-requests/${id}/notes`).send({ body: "من المدير" })).status, 201);
    assert.equal((await admin.patch(`/api/contact-requests/${id}/assign`).send({ assignedUserId: colleagueUser.id })).status, 200);
    assert.equal((await colleague.post(`/api/contact-requests/${id}/notes`).send({ body: "من الموظف الجديد" })).status, 201);
    assert.equal((await employee.post(`/api/contact-requests/${id}/notes`).send({ body: "لم يعد مُسندًا لي" })).status, 403);
    const audits = await prisma.activityLog.findMany({ where: { entityId: id, action: { in: ["CONTACT_REQUEST_CLAIMED", "CONTACT_REQUEST_ASSIGNED"] } } });
    assert.equal(audits.length, 2, "one claim and one reassignment, each audited");
  });

  test("two simultaneous claims: exactly one wins, the other is told it was taken", async () => {
    const id = await umrahRequest();
    const results = await Promise.all([employee.post(`/api/contact-requests/${id}/claim`).send({}), colleague.post(`/api/contact-requests/${id}/claim`).send({})]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409], JSON.stringify(results.map((r) => r.body)));
    const owner = (await prisma.contactRequest.findUnique({ where: { id } })).assignedUserId;
    assert.ok([employeeUser.id, colleagueUser.id].includes(owner));
    const winner = results.findIndex((r) => r.status === 200) === 0 ? employee : colleague;
    assert.equal((await winner.patch(`/api/contact-requests/${id}/status`).send({ status: "CONTACTED" })).status, 200);
    assert.equal(await prisma.activityLog.count({ where: { entityId: id, action: "CONTACT_REQUEST_CLAIMED" } }), 1);
  });

  test("finance and other organizations: roles unchanged, tenant isolation intact", async () => {
    const id = await umrahRequest();
    assert.equal((await accountant.patch(`/api/contact-requests/${id}/status`).send({ status: "CONTACTED" })).status, 403, "finance does not work cases (as before)");
    assert.equal((await accountant.post(`/api/contact-requests/${id}/claim`).send({})).status, 403, "finance cannot claim");
    const otherOrg = staffClient(await createStaffUser({ role: "EMPLOYEE", organizationId: (await createOrganization("asg")).id }));
    assert.equal((await otherOrg.post(`/api/contact-requests/${id}/claim`).send({})).status, 404);
    assert.equal((await otherOrg.patch(`/api/contact-requests/${id}/status`).send({ status: "CONTACTED" })).status, 404);
    assert.equal((await request(app).post(`/api/contact-requests/${id}/claim`).send({})).status, 401);
  });

  test("a request that is not Umrah keeps the old behaviour: an employee works it without claiming", async () => {
    const res = await request(app).post("/api/contact-requests").send({ name: "TEST-ASG inquiry", phone: testPhone(), message: "استفسار عام للاختبار فقط" });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal((await employee.patch(`/api/contact-requests/${res.body.data.id}/status`).send({ status: "CONTACTED" })).status, 200);
  });
});
