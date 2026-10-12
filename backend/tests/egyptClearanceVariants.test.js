import "./env.js";
import "./helpers/journeyLimits.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";
import { PDF, deliverable, staffDetail, testPhone, trackingClient, uploadReceipt } from "./helpers/workflow.js";
import { applyEgyptEntryMode, resolveEgyptEntryMode } from "../src/modules/egypt-clearance/egypt-clearance-variants.js";

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

function submit(variant, { phone, acceptedTotal, acceptedCurrency, answers }) {
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
  return req;
}

describe("Egypt clearance variants", () => {
  test("the public catalog lists both variants with their own configured price and currency", async () => {
    const catalog = await request(app).get("/api/services/public");
    const listed = (code) => catalog.body.data.visaTypes.find((v) => v.code === code);
    assert.deepEqual(
      [listed("VISA-EGYPT-CLEARANCE-AIR"), listed("VISA-EGYPT-CLEARANCE-BORDER")].map((v) => [v.name, v.pricingMode, Number(v.basePrice), v.currency, v.priceUnit]),
      [
        ["موافقة حربي — دخول بالطيران", "FIXED", 120, "USD", "PER_TRAVELER"],
        ["موافقة حربي — دخول عبر المعبر", "FIXED", 45000, "SDG", "PER_REQUEST"],
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
