import "./env.js";
import "./helpers/journeyLimits.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";
import { PDF, deliverable, staffDetail, testPhone, trackingClient, uploadReceipt } from "./helpers/workflow.js";
import { applyEgyptEntryMode, resolveEgyptEntryMode, resolveEgyptRoute } from "../src/modules/egypt-clearance/egypt-clearance-variants.js";

// Egypt security approval sold per entry method (موافقة حربي — دخول بالطيران /
// دخول عبر المعبر). Each variant is its own visa type priced by the agency;
// the seed creates them inactive and unpriced (prisma/setup-egypt-clearance-
// variants.js). Here an admin prices and activates them, then each runs:
// variant + price → traveler → documents → confirmed total → payment →
// receipt review → processing → delivery, with no quote stage.
// The prices below are test fixtures, not agency prices.

let admin;
let employee;
let accountant;
const variants = {};

before(async () => {
  admin = staffClient(await createStaffUser({ role: "ADMIN" }));
  employee = staffClient(await createStaffUser({ role: "EMPLOYEE" }));
  accountant = staffClient(await createStaffUser({ role: "ACCOUNTANT" }));
  const config = {
    "VISA-EGYPT-CLEARANCE-AIR": { pricingMode: "FIXED", basePrice: 120, currency: "USD", priceUnit: "PER_TRAVELER", active: true },
    "VISA-EGYPT-CLEARANCE-BORDER": { pricingMode: "FIXED", basePrice: 45000, currency: "SDG", priceUnit: "PER_REQUEST", active: true },
  };
  for (const [code, data] of Object.entries(config)) {
    const visaType = await prisma.visaType.findUnique({ where: { code } });
    assert.ok(visaType, `${code} must be created by the seed`);
    assert.equal(visaType.active, false, "created inactive");
    assert.equal(visaType.pricingMode, "QUOTE", "created without a price");
    const res = await admin.patch(`/api/visa-types/${visaType.id}`).send(data);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const requirements = await request(app).get(`/api/visa-types/${visaType.id}/requirements/public`);
    variants[code] = { visaType: res.body.data, requirements: requirements.body.data };
  }
});

function submit(variant, { phone, acceptedTotal, acceptedCurrency, answers, route }) {
  const passport = variant.requirements.find((r) => r.attachmentType === "passport_copy");
  let req = request(app)
    .post("/api/contact-requests")
    .field("name", "TEST-EG عميل")
    .field("phone", phone)
    .field("message", "TEST-EG موافقة")
    .field("visaTypeId", variant.visaType.id)
    .field("travelers", JSON.stringify([{ fullName: "TEST-EG مسافر", passportNo: "P1234567", birthDate: "1990-01-01", isPrimary: true }]))
    .field("documentLabels", JSON.stringify(["جواز"]))
    .field("documentRequirementIds", JSON.stringify([passport.id]))
    .field("documentTravelerIndexes", JSON.stringify(["0"]))
    .attach("documents", PDF(), { filename: "passport.pdf", contentType: "application/pdf" });
  if (acceptedTotal !== undefined) req = req.field("acceptedTotal", String(acceptedTotal));
  if (acceptedCurrency !== undefined) req = req.field("acceptedCurrency", acceptedCurrency);
  if (answers) req = req.field("answers", JSON.stringify(answers));
  for (const [key, value] of Object.entries(route || {})) req = req.field(key, value);
  return req;
}

describe("Egypt clearance variants: unconfigured or quoted variants are not bookable", () => {
  test("inactive, QUOTE-priced or unconfirmed-total variant submissions are refused, nothing created, no quote fallback", async () => {
    const air = variants["VISA-EGYPT-CLEARANCE-AIR"];
    const phone = testPhone();
    // Not confirmed: no total sent → refused (never recorded as a quote request).
    const noTotal = await submit(air, { phone });
    assert.equal(noTotal.status, 400);
    assert.equal(noTotal.body.code, "FIXED_TOTAL_REQUIRED");
    // Switched to quotation by the agency → unavailable.
    await admin.patch(`/api/visa-types/${air.visaType.id}`).send({ pricingMode: "QUOTE" });
    const quoted = await submit(air, { phone, acceptedTotal: "120", acceptedCurrency: "USD" });
    assert.equal(quoted.status, 409);
    assert.equal(quoted.body.code, "EGYPT_VARIANT_UNAVAILABLE");
    // Deactivated → unavailable, and hidden from the public catalog.
    await admin.patch(`/api/visa-types/${air.visaType.id}`).send({ pricingMode: "FIXED", active: false });
    const inactive = await submit(air, { phone, acceptedTotal: "120", acceptedCurrency: "USD" });
    assert.equal(inactive.status, 409);
    assert.equal(inactive.body.code, "EGYPT_VARIANT_UNAVAILABLE");
    const catalog = await request(app).get("/api/services/public");
    assert.ok(!catalog.body.data.visaTypes.some((v) => v.code === "VISA-EGYPT-CLEARANCE-AIR"));
    assert.equal(await prisma.contactRequest.count({ where: { phone } }), 0);
    // Restore the configured variant for the tests below.
    const restored = await admin.patch(`/api/visa-types/${air.visaType.id}`).send({ pricingMode: "FIXED", basePrice: 120, currency: "USD", priceUnit: "PER_TRAVELER", active: true });
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
  });

  test("the draft route (website) refuses an unconfirmed total the same way", async () => {
    const border = variants["VISA-EGYPT-CLEARANCE-BORDER"];
    const created = await request(app).post("/api/intake-drafts").send({ serviceKind: "visa", visaTypeId: border.visaType.id });
    const token = created.body.data.token;
    await request(app).patch(`/api/intake-drafts/${token}`).send({ name: "TEST-EG", phone: testPhone(), travelerCount: 1, travelers: [{ fullName: "TEST-EG", passportNo: "P7654321", birthDate: "1991-02-02" }] });
    const passport = border.requirements.find((r) => r.attachmentType === "passport_copy");
    const uploaded = await request(app).post(`/api/intake-drafts/${token}/documents`).field("label", "جواز").field("requirementId", passport.id).field("travelerIndex", "0").attach("file", PDF(), { filename: "p.pdf", contentType: "application/pdf" });
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
    const noTotal = await request(app).post(`/api/intake-drafts/${token}/submit`).send({});
    assert.equal(noTotal.status, 400, JSON.stringify(noTotal.body));
    assert.equal(noTotal.body.code, "FIXED_TOTAL_REQUIRED");
    const ok = await request(app).post(`/api/intake-drafts/${token}/submit`).send({ acceptedTotal: "45000", acceptedCurrency: "SDG" });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const stored = await prisma.contactRequest.findUnique({ where: { id: ok.body.data.id }, include: { invoice: true } });
    assert.equal(stored.pricingMode, "FIXED");
    assert.equal(stored.intakeData.egyptEntryMode, "BORDER");
    assert.equal(Number(stored.invoice.amount), 45000);
  });
});

describe("Egypt clearance variants", () => {
  test("the public catalog lists both variants with their own configured price and currency", async () => {
    const catalog = await request(app).get("/api/services/public");
    const listed = (code) => catalog.body.data.visaTypes.find((v) => v.code === code);
    assert.deepEqual(
      [listed("VISA-EGYPT-CLEARANCE-AIR"), listed("VISA-EGYPT-CLEARANCE-BORDER")].map((v) => [v.name, v.pricingMode, Number(v.basePrice), v.currency, v.priceUnit]),
      [
        ["موافقة حربي — جوي — مطار القاهرة", "FIXED", 120, "USD", "PER_TRAVELER"],
        ["موافقة حربي — بري — المعبر", "FIXED", 45000, "SDG", "PER_REQUEST"],
      ]
    );
    assert.ok(!variants["VISA-EGYPT-CLEARANCE-AIR"].requirements.some((r) => r.attachmentType === "egypt_entry_mode"), "the variant is the entry method");
  });

  for (const [code, total, currency, mode] of [
    ["VISA-EGYPT-CLEARANCE-AIR", "120.00", "USD", "AIR"],
    ["VISA-EGYPT-CLEARANCE-BORDER", "45000", "SDG", "BORDER"],
  ]) {
    test(`${mode}: confirmed total → payment → receipt review → processing → delivery, no quote stage`, async () => {
      const phone = testPhone();
      const created = await submit(variants[code], { phone, acceptedTotal: total, acceptedCurrency: currency });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const id = created.body.data.id;
      const stored = await prisma.contactRequest.findUnique({ where: { id }, include: { invoice: true } });
      assert.equal(stored.pricingMode, "FIXED");
      assert.equal(stored.pricingSnapshot.total, Number(total));
      assert.equal(stored.pricingSnapshot.currency, currency);
      assert.equal(stored.invoice.status, "APPROVED");
      assert.equal(stored.intakeData.egyptEntryMode, mode, "the entry method is recorded from the variant");

      const tracking = trackingClient(phone);
      let mine = await tracking.request(id);
      assert.ok(!mine.allowedActions.includes("APPROVE_QUOTE"));
      assert.ok(!mine.progress.steps.some((s) => s.key === "QUOTE"), "no quote stage");
      assert.ok(mine.progress.steps.some((s) => s.key === "TRAVEL_PLAN"), "still the Egypt journey");

      await uploadReceipt(tracking, id);
      mine = await tracking.request(id);
      assert.equal(mine.paymentStatus, "UNDER_REVIEW", "a receipt is under review, not paid");
      assert.equal((await accountant.post(`/api/contact-requests/${id}/confirm-payment`).send({})).status, 200);

      const detail = await staffDetail(employee, id);
      for (const document of detail.documents.filter((d) => d.status === "PENDING" && d.classification !== "FINANCIAL_DOCUMENT")) {
        assert.equal((await employee.patch(`/api/contact-requests/${id}/documents/${document.id}/status`).send({ status: "ACCEPTED" })).status, 200);
      }
      const started = await employee.post(`/api/contact-requests/${id}/start-execution`).send({});
      assert.equal(started.status, 200, JSON.stringify(started.body));
      const published = await deliverable(employee, id, { travelerIds: detail.travelers.map((t) => t.id), publish: true });
      assert.equal(published.status, 201, JSON.stringify(published.body));

      mine = await tracking.request(id);
      assert.equal(mine.progress.steps.find((s) => s.key === "DELIVERY").state, "done");
      assert.ok(mine.allowedActions.includes("SAVE_TRAVEL_PLAN"), "the travel plan follows the approval file");
      const after = await prisma.contactRequest.findUnique({ where: { id }, include: { invoice: true } });
      assert.equal(Number(after.invoice.amount), Number(total), "the accepted price never changed");
    });
  }

  test("tampering is refused and creates nothing: another variant's price, a wrong currency", async () => {
    const phone = testPhone();
    const air = variants["VISA-EGYPT-CLEARANCE-AIR"];
    const wrongPrice = await submit(air, { phone, acceptedTotal: "45000", acceptedCurrency: "SDG" });
    assert.equal(wrongPrice.status, 409);
    assert.equal(wrongPrice.body.code, "PRICE_CHANGED");
    assert.equal(wrongPrice.body.details.total, 120);
    assert.equal(wrongPrice.body.details.currency, "USD");
    const wrongCurrency = await submit(air, { phone, acceptedTotal: "120", acceptedCurrency: "SDG" });
    assert.equal(wrongCurrency.status, 409);
    assert.equal(await prisma.contactRequest.count({ where: { phone } }), 0);
  });

  test("an entry-method answer that contradicts the variant, or an unknown value, is refused", async () => {
    const question = { id: "q-entry", attachmentType: "egypt_entry_mode" };
    assert.deepEqual(applyEgyptEntryMode("VISA-EGYPT-CLEARANCE-AIR", [question], { "q-entry": "BORDER" }).error, "ENTRY_MODE_MISMATCH");
    assert.deepEqual(applyEgyptEntryMode("VISA-EGYPT-CLEARANCE-AIR", [question], {}).answers, { "q-entry": "AIR" });
    assert.equal(resolveEgyptEntryMode("VISA-EGYPT-CLEARANCE", "[object Object]").error, "ENTRY_MODE_INVALID");
    assert.equal(resolveEgyptEntryMode("VISA-EGYPT-CLEARANCE", "BORDER").entryMode, "BORDER");
    assert.deepEqual(applyEgyptEntryMode("VISA-UMRAH", [question], { "q-entry": "x" }), { answers: { "q-entry": "x" } }, "other items untouched");

    // Through the API: the original item with the broken value an old app sent.
    const base = await prisma.visaType.findUnique({ where: { code: "VISA-EGYPT-CLEARANCE" }, include: { requirements: { where: { active: true } } } });
    const entry = base.requirements.find((r) => r.attachmentType === "egypt_entry_mode");
    const phone = testPhone();
    const res = await request(app)
      .post("/api/contact-requests")
      .field("name", "TEST-EG عميل")
      .field("phone", phone)
      .field("message", "TEST-EG")
      .field("visaTypeId", base.id)
      .field("answers", JSON.stringify({ [entry.id]: "[object Object]" }));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "ENTRY_MODE_INVALID");
    assert.equal(await prisma.contactRequest.count({ where: { phone } }), 0);
  });
});

// Issue #100: the route of a variant request (by air: departure city and
// arrival airport, Port Sudan → Cairo by default and editable; over land: the
// entry point), and the entry method asked only once.
describe("Egypt clearance variants: route and a single entry-method choice", () => {
  test("route rules: air defaults and edits, land entry point, other method's fields ignored, overlong refused", () => {
    assert.deepEqual(resolveEgyptRoute("VISA-EGYPT-CLEARANCE-AIR", {}), { route: { entryMode: "AIR", departureCity: "بورتسودان", arrivalAirport: "القاهرة" } });
    assert.deepEqual(resolveEgyptRoute("VISA-EGYPT-CLEARANCE-AIR", { departureCity: " الخرطوم ", arrivalAirport: "الأقصر", entryPort: "x" }).route, { entryMode: "AIR", departureCity: "الخرطوم", arrivalAirport: "الأقصر" });
    assert.deepEqual(resolveEgyptRoute("VISA-EGYPT-CLEARANCE-BORDER", { entryPort: "أرقين", departureCity: "x" }).route, { entryMode: "BORDER", entryPort: "أرقين" });
    assert.deepEqual(resolveEgyptRoute("VISA-EGYPT-CLEARANCE", { entryPort: "x" }), { route: null }, "the original item has no variant route");
    assert.equal(resolveEgyptRoute("VISA-EGYPT-CLEARANCE-BORDER", { entryPort: "أ".repeat(81) }).error, "ROUTE_INVALID");
  });

  test("the route is stored with the request; an older client without it gets the air defaults", async () => {
    const air = variants["VISA-EGYPT-CLEARANCE-AIR"];
    const border = variants["VISA-EGYPT-CLEARANCE-BORDER"];
    const edited = await submit(air, { phone: testPhone(), acceptedTotal: "120.00", acceptedCurrency: "USD", route: { departureCity: "الخرطوم", arrivalAirport: "القاهرة" } });
    assert.equal(edited.status, 201, JSON.stringify(edited.body));
    const old = await submit(air, { phone: testPhone(), acceptedTotal: "120.00", acceptedCurrency: "USD" });
    assert.equal(old.status, 201, JSON.stringify(old.body));
    const land = await submit(border, { phone: testPhone(), acceptedTotal: "45000", acceptedCurrency: "SDG", route: { entryPort: "أرقين" } });
    assert.equal(land.status, 201, JSON.stringify(land.body));
    const route = async (res) => (await prisma.contactRequest.findUnique({ where: { id: res.body.data.id }, select: { intakeData: true } })).intakeData.egyptRoute;
    assert.deepEqual(await route(edited), { entryMode: "AIR", departureCity: "الخرطوم", arrivalAirport: "القاهرة" });
    assert.deepEqual(await route(old), { entryMode: "AIR", departureCity: "بورتسودان", arrivalAirport: "القاهرة" });
    assert.deepEqual(await route(land), { entryMode: "BORDER", entryPort: "أرقين" });

    const phone = testPhone();
    const tooLong = await submit(border, { phone, acceptedTotal: "45000", acceptedCurrency: "SDG", route: { entryPort: "أ".repeat(81) } });
    assert.equal(tooLong.status, 400, JSON.stringify(tooLong.body));
    assert.equal(tooLong.body.code, "ROUTE_INVALID");
    assert.equal(await prisma.contactRequest.count({ where: { phone } }), 0, "nothing created");
  });

  test("the draft route (website) stores the edited air route", async () => {
    const air = variants["VISA-EGYPT-CLEARANCE-AIR"];
    const created = await request(app).post("/api/intake-drafts").send({ serviceKind: "visa", visaTypeId: air.visaType.id });
    const token = created.body.data.token;
    await request(app).patch(`/api/intake-drafts/${token}`).send({ name: "TEST-EG", phone: testPhone(), travelerCount: 1, travelers: [{ fullName: "TEST-EG", passportNo: "P7654322", birthDate: "1991-02-02" }] });
    const passport = air.requirements.find((r) => r.attachmentType === "passport_copy");
    await request(app).post(`/api/intake-drafts/${token}/documents`).field("label", "جواز").field("requirementId", passport.id).field("travelerIndex", "0").attach("file", PDF(), { filename: "p.pdf", contentType: "application/pdf" });
    const ok = await request(app).post(`/api/intake-drafts/${token}/submit`).send({ acceptedTotal: "120.00", acceptedCurrency: "USD", departureCity: "كسلا", arrivalAirport: "القاهرة" });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const stored = await prisma.contactRequest.findUnique({ where: { id: ok.body.data.id }, select: { intakeData: true } });
    assert.deepEqual(stored.intakeData.egyptRoute, { entryMode: "AIR", departureCity: "كسلا", arrivalAirport: "القاهرة" });
  });

  test("the travel plan of a variant request takes the variant's entry method; a different one is refused", async () => {
    const border = variants["VISA-EGYPT-CLEARANCE-BORDER"];
    const phone = testPhone();
    const created = await submit(border, { phone, acceptedTotal: "45000", acceptedCurrency: "SDG", route: { entryPort: "أرقين" } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    const tracking = trackingClient(phone);
    const entryDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const other = await tracking.post(`/api/tracking/requests/${id}/egypt-travel-plan`).field("entryMode", "AIR").field("bookingStatus", "NEEDS_NASAEM").field("entryDate", entryDate);
    assert.equal(other.status, 400, JSON.stringify(other.body));
    assert.equal(other.body.code, "ENTRY_MODE_MISMATCH");
    const saved = await tracking.post(`/api/tracking/requests/${id}/egypt-travel-plan`).field("bookingStatus", "NEEDS_NASAEM").field("entryDate", entryDate);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const stored = await prisma.contactRequest.findUnique({ where: { id }, select: { intakeData: true } });
    assert.equal(stored.intakeData.egyptTravel.entryMode, "BORDER", "taken from the variant, not asked again");
    assert.equal(stored.intakeData.egyptRoute.entryPort, "أرقين", "the booking route is kept");
  });

  test("the original item still needs the entry method in its travel plan", async () => {
    const base = await prisma.visaType.findUnique({ where: { code: "VISA-EGYPT-CLEARANCE" } });
    const phone = testPhone();
    const created = await request(app).post("/api/contact-requests").field("name", "TEST-EG عميل").field("phone", phone).field("message", "TEST-EG").field("visaTypeId", base.id);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const entryDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const missing = await trackingClient(phone).post(`/api/tracking/requests/${created.body.data.id}/egypt-travel-plan`).field("bookingStatus", "NEEDS_NASAEM").field("entryDate", entryDate);
    assert.equal(missing.status, 400, JSON.stringify(missing.body));
    assert.equal(missing.body.code, "ENTRY_MODE_REQUIRED");
  });
});
