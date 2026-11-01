import "./env.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { normalizePhone } from "../src/utils/phone.js";
import { app, request, loginAsSuperAdmin, registerCustomer, uniqueSuffix } from "./helpers/api.js";
import { intakeScope, kindOpenForIntake, APPROVED_INTAKE_SCOPE } from "../src/modules/service-scope/intake-scope.js";

// Owner decision (PR #151): only Umrah and Egypt security approval accept NEW
// customer applications. The suite runs with PUBLIC_INTAKE_SCOPE=ALL (env.js)
// so the kept services stay covered; this file switches the production default
// back on and checks every public entry point, and that nothing else changed.
// The public submission limiter (5 per client per 15 min, counted before the
// scope check) applies to this file too, so it makes exactly 5 calls to
// POST /contact-requests; the other refused kinds go through drafts and orders.

let saved;
const phone = () => `0912${uniqueSuffix().slice(-6)}`;
const byCode = async (model, code) => prisma[model].findFirst({ where: { code }, select: { id: true } });

describe("public intake scope (approved: Umrah + Egypt security approval)", () => {
  before(() => {
    saved = process.env.PUBLIC_INTAKE_SCOPE;
    delete process.env.PUBLIC_INTAKE_SCOPE; // the production default
  });
  after(() => {
    if (saved === undefined) delete process.env.PUBLIC_INTAKE_SCOPE;
    else process.env.PUBLIC_INTAKE_SCOPE = saved;
  });

  test("configuration: unset → Umrah + Egypt; ALL → everything; an explicit list is honoured", () => {
    assert.deepEqual(intakeScope({}), [...APPROVED_INTAKE_SCOPE]);
    assert.equal(intakeScope({ PUBLIC_INTAKE_SCOPE: "all" }), null);
    assert.deepEqual(intakeScope({ PUBLIC_INTAKE_SCOPE: "umrah, egypt_clearance ,FLIGHT" }), ["UMRAH", "EGYPT_CLEARANCE", "FLIGHT"]);
    assert.equal(kindOpenForIntake("FLIGHT", {}), false);
    assert.equal(kindOpenForIntake("FLIGHT", { PUBLIC_INTAKE_SCOPE: "ALL" }), true);
  });

  test("POST /contact-requests refuses other services (403 SERVICE_NOT_OFFERED) and creates nothing", async () => {
    for (const [model, code, field] of [["service", "SVC-FLIGHT", "serviceId"], ["visaType", "VISA-WORK", "visaTypeId"]]) {
      const target = await byCode(model, code);
      assert.ok(target, `${code} is seeded`);
      const before = await prisma.contactRequest.count();
      const res = await request(app).post("/api/contact-requests").send({ name: "عميل نطاق", phone: phone(), message: "طلب خارج النطاق المعتمد", [field]: target.id });
      assert.equal(res.status, 403, `${code}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.code, "SERVICE_NOT_OFFERED");
      assert.match(res.body.message, /العمرة والموافقة الأمنية لمصر/);
      assert.equal(await prisma.contactRequest.count(), before, `${code}: nothing created`);
    }
  });

  test("Umrah, Egypt and a general inquiry still go through the same route", async () => {
    // Umrah (service) and Egypt (visa type) pass the scope; whatever else the
    // route checks (prices, documents) answers as before, never SERVICE_NOT_OFFERED.
    for (const [model, code, field] of [["service", "SVC-UMRAH", "serviceId"], ["visaType", "VISA-EGYPT-CLEARANCE", "visaTypeId"]]) {
      const target = await byCode(model, code);
      const res = await request(app).post("/api/contact-requests").send({ name: "عميل نطاق", phone: phone(), message: "طلب ضمن النطاق المعتمد", [field]: target.id });
      assert.notEqual(res.body.code, "SERVICE_NOT_OFFERED", `${code}: ${JSON.stringify(res.body)}`);
    }
    const inquiry = await request(app).post("/api/contact-requests").send({ name: "استفسار", phone: phone(), message: "استفسار عام عن الخدمات" });
    assert.equal(inquiry.status, 201, JSON.stringify(inquiry.body));
  });

  test("intake drafts: refused at creation and again at submission for other services", async () => {
    for (const [model, code, field, kind] of [["visaType", "VISA-WORK", "visaTypeId", "visa"], ["visaType", "VISA-FAMILY-VISIT", "visaTypeId", "visa"], ["service", "SVC-FERRY", "serviceId", "package"]]) {
      const target = await byCode(model, code);
      const created = await request(app).post("/api/intake-drafts").send({ serviceKind: kind, [field]: target.id });
      assert.equal(created.status, 403, `${code}: ${JSON.stringify(created.body)}`);
      assert.equal(created.body.code, "SERVICE_NOT_OFFERED");
    }
    const work = await byCode("visaType", "VISA-WORK");

    // A draft started for Egypt and then pointed at another service cannot be submitted.
    const egypt = await byCode("visaType", "VISA-EGYPT-CLEARANCE");
    const draft = await request(app).post("/api/intake-drafts").send({ serviceKind: "visa", visaTypeId: egypt.id });
    assert.equal(draft.status, 201, JSON.stringify(draft.body));
    const token = draft.body.data.token;
    const patched = await request(app).patch(`/api/intake-drafts/${token}`).send({ visaTypeId: work.id, name: "عميل", phone: phone() });
    assert.ok(patched.status < 400, JSON.stringify(patched.body));
    const submitted = await request(app).post(`/api/intake-drafts/${token}/submit`).send({ message: "إرسال مسودة خارج النطاق" });
    assert.equal(submitted.status, 403, JSON.stringify(submitted.body));
    assert.equal(submitted.body.code, "SERVICE_NOT_OFFERED");
  });

  test("signed-in customer orders and standalone flight booking are refused", async () => {
    const { agent } = await registerCustomer();
    const ferry = await byCode("service", "SVC-FERRY");
    const order = await agent.post("/api/customer/orders").send({ serviceId: ferry.id, quantity: 1 });
    assert.equal(order.status, 403, JSON.stringify(order.body));
    assert.equal(order.body.code, "SERVICE_NOT_OFFERED");

    const booking = await request(app).post("/api/flight-bookings").send({ flightId: "any", passengers: [], contact: { phone: phone() } });
    assert.equal(booking.status, 403);
    assert.equal(booking.body.code, "SERVICE_NOT_OFFERED");
  });

  test("nothing else changes: the catalog and existing requests of other services stay readable", async () => {
    const catalog = await request(app).get("/api/services/public");
    assert.equal(catalog.status, 200);
    const codes = catalog.body.data.services.map((s) => s.code);
    for (const code of ["SVC-FLIGHT", "SVC-FERRY", "SVC-UMRAH", "SVC-EGYPT-CLEARANCE"]) assert.ok(codes.includes(code), `${code} still published (data untouched)`);

    // An existing request for a now-closed service (one made before the scope
    // changed) stays as it is, and staff can still read it.
    const flight = await byCode("service", "SVC-FLIGHT");
    const admin = await prisma.user.findFirst({ where: { email: "admin@nasaem-platform.local" }, select: { organizationId: true } });
    const p = phone();
    const old = await prisma.contactRequest.create({ data: { organizationId: admin.organizationId, name: "طلب قديم", phone: p, phoneNormalized: normalizePhone(p), message: "طلب طيران قبل تغيير النطاق", serviceId: flight.id } });
    const agent = await loginAsSuperAdmin();
    const read = await agent.get(`/api/contact-requests/${old.id}`);
    assert.equal(read.status, 200, JSON.stringify(read.body));
    assert.equal(read.body.data.status, "NEW");
    await prisma.contactRequest.delete({ where: { id: old.id } });
  });
});
