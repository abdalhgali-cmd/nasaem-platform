// T16: the Umrah report is database-derived, Umrah-only, reconcilable with the
// case list, per currency, and limited to roles that may see finance.
import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";
import { testPhone } from "./helpers/workflow.js";
import { withUmrahPassports } from "./helpers/umrah-intake.js";
import { buildUmrahReport } from "../src/modules/umrah/umrah-report.js";

const snap = (kind) => ({ intakeData: { umrahPackage: { kind, includesServices: kind !== "VISA_ONLY", source: "SNAPSHOT" } } });
const row = (over) => ({
  id: "r", createdAt: new Date("2026-11-01T00:00:00Z"), closedAt: null, paymentConfirmedAt: null, paymentStatus: "AWAITING_TRANSFER", outcome: null, travelerCount: 1,
  intakeData: {}, invoice: null, travelers: [{ id: "t1" }], deliverables: [], serviceRef: { category: "UMRAH_PACKAGE", features: [] }, visaType: null, ...over,
});

describe("buildUmrahReport (pure)", () => {
  test("groups by the request's own package snapshot, sums per currency in cents, and reconciles", () => {
    const rows = [
      row({ id: "a", ...snap("AIR"), travelers: [{ id: "x" }, { id: "y" }], paymentStatus: "CONFIRMED", invoice: { amount: "0.10", currency: "SAR" }, paymentConfirmedAt: new Date("2026-11-03T00:00:00Z") }),
      row({ id: "b", ...snap("AIR"), paymentStatus: "CONFIRMED", invoice: { amount: "0.20", currency: "SAR" } }),
      row({ id: "c", ...snap("VISA_ONLY"), invoice: { amount: "795.00", currency: "USD" } }),
      row({ id: "d", serviceRef: { category: "UMRAH_PACKAGE", features: ["KIND: SEA"] }, paymentStatus: "UNDER_REVIEW" }),
    ];
    const report = buildUmrahReport(rows);
    assert.equal(report.reconciliation.matches, true);
    assert.equal(report.totals.requests, 4);
    assert.equal(report.totals.pilgrims, 5);
    const air = report.byPackage.find((g) => g.key === "AIR");
    assert.equal(air.requests, 2);
    assert.equal(air.paid.SAR, 0.3, "0.10 + 0.20 has no floating point drift");
    assert.equal(air.avgDaysToPayment, 2);
    assert.deepEqual(report.totals.invoiced, { SAR: 0.3, USD: 795 }, "currencies are never mixed or converted");
    const sea = report.byPackage.find((g) => g.key === "SEA");
    assert.equal(sea.legacyObligations, 1, "a request without a snapshot is counted as legacy, not as history");
    assert.equal(sea.payment.underReview, 1);
    assert.equal(report.byPackage.find((g) => g.key === "VISA_ONLY").legacyObligations, 0);
  });

  test("an empty range reports zeros", () => {
    const report = buildUmrahReport([]);
    assert.deepEqual(report.totals, { requests: 0, pilgrims: 0, visasIssued: 0, completed: 0, invoiced: {}, paid: {} });
    assert.equal(report.reconciliation.matches, true);
  });
});

describe("GET /dashboard/umrah-report", () => {
  let admin;
  let accountant;
  let employee;
  let service;

  before(async () => {
    admin = await loginAsSuperAdmin();
    accountant = staffClient(await createStaffUser({ role: "ACCOUNTANT" }));
    employee = staffClient(await createStaffUser({ role: "EMPLOYEE" }));
    const created = await admin.post("/api/services").send({ code: `TEST-REP-${uniqueSuffix()}`, name: "TEST-REP", category: "UMRAH_PACKAGE", basePrice: 1000, currency: "SAR", active: true, pricingMode: "FIXED", priceUnit: "PER_TRAVELER", features: ["KIND: VISA_ONLY"] });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    service = created.body.data;
    for (let i = 0; i < 2; i++) {
      const res = await withUmrahPassports(request(app)
        .post("/api/contact-requests")
        .field("name", `TEST-REP عميل ${i}`)
        .field("phone", testPhone())
        .field("service", service.name)
        .field("serviceId", service.id)
        .field("message", "TEST-REP")
        .field("travelerCount", "2")
        .field("travelers", JSON.stringify([{ fullName: "أ", isPrimary: true }, { fullName: "ب" }]))
        .field("acceptedTotal", "2000")
        .field("acceptedCurrency", "SAR")
        .field("guarantorPhone", "+966 50 123 4567"), service.id, 2);
      assert.equal(res.status, 201, JSON.stringify(res.body));
    }
  });

  test("finance roles read it; operations and anonymous callers do not", async () => {
    assert.equal((await admin.get("/api/dashboard/umrah-report")).status, 200);
    assert.equal((await accountant.get("/api/dashboard/umrah-report")).status, 200);
    assert.equal((await employee.get("/api/dashboard/umrah-report")).status, 403);
    assert.equal((await request(app).get("/api/dashboard/umrah-report")).status, 401);
  });

  test("its request total equals the Umrah case list's total for the same filter, and counts the new requests", async () => {
    const report = (await admin.get("/api/dashboard/umrah-report")).body.data;
    const list = await admin.get("/api/contact-requests?serviceKind=UMRAH&limit=1");
    assert.equal(report.totals.requests, list.body.meta.total);
    assert.equal(report.reconciliation.matches, true);
    const visaOnly = report.byPackage.find((g) => g.key === "VISA_ONLY");
    assert.ok(visaOnly.requests >= 2);
    assert.ok(visaOnly.invoiced.SAR >= 4000);
  });

  test("a date range excludes requests created outside it", async () => {
    const none = (await admin.get("/api/dashboard/umrah-report?from=2000-01-01&to=2000-01-02")).body.data;
    assert.equal(none.totals.requests, 0);
    const today = new Date().toISOString().slice(0, 10);
    const now = (await admin.get(`/api/dashboard/umrah-report?from=${today}&to=${today}`)).body.data;
    assert.ok(now.totals.requests >= 2);
  });
});
