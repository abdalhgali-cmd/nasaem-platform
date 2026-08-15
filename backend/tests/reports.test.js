import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// Own process (own fresh in-memory rate limiters). Reads the shared test
// DB, so assertions use deltas (before/after known requests) rather than
// absolute totals — same pattern as dashboard.test.js. Spends 4 of
// publicContactLimiter's 5 POST /contact-requests (FLIGHTS-with-confirmed-
// payment + UMRAH in the main test, one more UMRAH for the department
// filter test, one more FLIGHTS for the date-range test) and 1 of
// request-code's 5/15min/IP (the customer login needed to approve the
// first FLIGHTS request's quote) — no other test in this file may call
// either endpoint.
describe("reports summary", () => {
  let adminAgent;
  let employeeAgent;

  before(async () => {
    adminAgent = await loginAsSuperAdmin();

    const employeeEmail = `reports-employee-${uniqueSuffix()}@nasaem-platform.local`;
    const employeePassword = "TestPass@12345";
    const employeeCreateRes = await adminAgent.post("/api/users").send({
      fullName: "Reports Test Employee",
      email: employeeEmail,
      password: employeePassword,
      role: "EMPLOYEE",
    });
    assert.equal(employeeCreateRes.status, 201);
    employeeAgent = request.agent(app);
    const employeeLoginRes = await employeeAgent
      .post("/api/auth/login")
      .send({ email: employeeEmail, password: employeePassword });
    assert.equal(employeeLoginRes.status, 200);
  });

  test("only SUPER_ADMIN and ADMIN can call GET /reports/summary", async () => {
    const adminRes = await adminAgent.get("/api/reports/summary");
    assert.equal(adminRes.status, 200);

    const employeeRes = await employeeAgent.get("/api/reports/summary");
    assert.equal(employeeRes.status, 403);
  });

  test("total/byStatus/byDepartment/revenueByCurrency reflect a confirmed FLIGHTS payment and an unconfirmed UMRAH request", async () => {
    const before = (await adminAgent.get("/api/reports/summary")).body.data;

    // Must be a real-looking Sudanese number ("0" + 9-digit subscriber
    // starting with 9) since this test also logs in via customer-auth,
    // whose normalizePhone() rejects anything else — unlike the other
    // phones in this file, which only need to be unique for
    // POST /contact-requests.
    const suffix = uniqueSuffix();
    const phone = `09${suffix.slice(-6)}05`;
    const flightsCreateRes = await request(app).post("/api/contact-requests").send({
      name: "Reports Flights Owner",
      phone,
      service: "طيران",
      details: { من: "الخرطوم", إلى: "جدة" },
    });
    assert.equal(flightsCreateRes.status, 201);
    const flightsId = flightsCreateRes.body.data.id;

    const quoteRes = await adminAgent
      .patch(`/api/contact-requests/${flightsId}/payment`)
      .send({ currency: "SAR", paymentAmount: 400 });
    assert.equal(quoteRes.status, 200);

    const codeRes = await request(app).post("/api/customer-auth/request-code").send({ phone });
    assert.equal(codeRes.status, 200);
    const customerAgent = request.agent(app);
    const verifyRes = await customerAgent.post("/api/customer-auth/verify-code").send({
      loginCodeId: codeRes.body.data.loginCodeId,
      code: codeRes.body.data.debugCode,
    });
    assert.equal(verifyRes.status, 200);

    const approveRes = await customerAgent.post(`/api/contact-requests/${flightsId}/invoice/approve`);
    assert.equal(approveRes.status, 200);

    const confirmRes = await adminAgent
      .patch(`/api/contact-requests/${flightsId}/payment-status`)
      .send({ status: "CONFIRMED" });
    assert.equal(confirmRes.status, 200);

    const umrahCreateRes = await request(app).post("/api/contact-requests").send({
      name: "Reports Umrah Owner",
      phone: `097${uniqueSuffix()}`,
      service: "عمرة",
      details: { "نوع الباقة": "تأشيرة عمرة فقط" },
    });
    assert.equal(umrahCreateRes.status, 201);

    const after = (await adminAgent.get("/api/reports/summary")).body.data;

    assert.equal(after.total, before.total + 2);
    assert.equal(after.byStatus.NEW, before.byStatus.NEW + 2);
    assert.equal(after.byDepartment.FLIGHTS.count, before.byDepartment.FLIGHTS.count + 1);
    assert.equal(after.byDepartment.UMRAH.count, before.byDepartment.UMRAH.count + 1);
    assert.equal((after.revenueByCurrency.SAR || 0) - (before.revenueByCurrency.SAR || 0), 400);
    assert.equal(
      (after.byDepartment.FLIGHTS.revenue.SAR || 0) - (before.byDepartment.FLIGHTS.revenue.SAR || 0),
      400
    );
    // The unconfirmed UMRAH request contributes no revenue.
    assert.equal(after.byDepartment.UMRAH.revenue.SAR || 0, before.byDepartment.UMRAH.revenue.SAR || 0);

    // Confirmed just now, so a range covering today must include it in
    // revenue too — this is the paymentConfirmedAt axis, not createdAt.
    const today = new Date().toISOString().slice(0, 10);
    const todayOnly = (await adminAgent.get(`/api/reports/summary?from=${today}`)).body.data;
    assert.ok((todayOnly.byDepartment.FLIGHTS.revenue.SAR || 0) >= 400);
  });

  test("?department= filters the summary to just that department", async () => {
    const before = (await adminAgent.get("/api/reports/summary?department=FLIGHTS")).body.data;

    const umrahOnlyRes = await request(app).post("/api/contact-requests").send({
      name: "Reports Department Filter Umrah",
      phone: `097${uniqueSuffix()}`,
      service: "عمرة",
      details: { "نوع الباقة": "تأشيرة عمرة فقط" },
    });
    assert.equal(umrahOnlyRes.status, 201);

    const after = (await adminAgent.get("/api/reports/summary?department=FLIGHTS")).body.data;
    assert.equal(after.total, before.total);
  });

  test("a `to` date range in the past excludes requests created just now", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const before = (await adminAgent.get(`/api/reports/summary?to=${yesterday}`)).body.data;

    const res = await request(app).post("/api/contact-requests").send({
      name: "Reports Date Range Test",
      phone: `097${uniqueSuffix()}`,
      service: "طيران",
      details: { من: "الخرطوم", إلى: "الرياض" },
    });
    assert.equal(res.status, 201);

    const after = (await adminAgent.get(`/api/reports/summary?to=${yesterday}`)).body.data;
    assert.equal(after.total, before.total);
  });

  test("malformed from/to values are silently ignored, not a 400 or 500", async () => {
    const res = await adminAgent.get("/api/reports/summary?from=not-a-date&to=also-not-a-date");
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.data.total === "number");
  });
});
