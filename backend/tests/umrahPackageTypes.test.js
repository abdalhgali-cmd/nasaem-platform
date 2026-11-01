import "./env.js";
import "./helpers/journeyLimits.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../src/config/database.js";
import { app, request, uniqueSuffix } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";
import { PDF, testPhone } from "./helpers/workflow.js";
import { resolveUmrahContacts, resolveUmrahTravel, umrahPackageKind } from "../src/modules/umrah/umrah-packages.js";

// Issue #99: three Umrah package types (visa only / flight services / sea
// services), each at its own fixed price; applicant + every pilgrim's
// passport + the guarantor's residence and phone (required) + an optional
// extra contact; final review, then the account in the right currency and
// the receipt (UNDER_REVIEW until finance confirms); execution says
// «جارٍ إصدار التأشيرة» or «جارٍ إصدار التذاكر», then delivery.

const GUARANTOR = "+966 50 123 4567";
const PRICE = 1500;

let admin;
let employee;
let accountant;

before(async () => {
  admin = staffClient(await createStaffUser({ role: "ADMIN" }));
  employee = staffClient(await createStaffUser({ role: "EMPLOYEE" }));
  accountant = staffClient(await createStaffUser({ role: "ACCOUNTANT" }));
  const account = await admin.post("/api/payment-accounts").send({
    name: `TEST-WF حساب ريال ${uniqueSuffix()}`,
    bankName: "TEST-WF Bank",
    accountName: "TEST-WF Holder",
    accountNumber: `7${uniqueSuffix().slice(-9)}`,
    currency: "SAR",
  });
  assert.equal(account.status, 201, JSON.stringify(account.body));
});

async function umrahPackage(kind, { passport = true } = {}) {
  const created = await admin.post("/api/services").send({
    code: `TEST-WF-UMRAH-${kind}-${uniqueSuffix()}`,
    name: `TEST-WF عمرة ${kind}`,
    category: "UMRAH_PACKAGE",
    basePrice: PRICE,
    currency: "SAR",
    active: true,
    pricingMode: "FIXED",
    priceUnit: "PER_TRAVELER",
    features: [`KIND: ${kind}`, "INCLUDED: إصدار تأشيرة العمرة", "EXCLUDED: السكن"],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  if (passport) {
    const added = await admin.post(`/api/services/${created.body.data.id}/requirements`).send({ name: "صورة الجواز", type: "DOCUMENT", scope: "TRAVELER", required: true });
    assert.equal(added.status, 201, JSON.stringify(added.body));
  }
  return created.body.data;
}

async function checklist(service) {
  const res = await request(app).get(`/api/services/${service.id}/requirements/public`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data.filter((row) => row.type === "DOCUMENT" && row.required);
}

// Two pilgrims, each with a passport, plus the guarantor's residence permit.
async function submit(service, { phone, guarantorPhone = GUARANTOR, extra, acceptedTotal = PRICE * 2, submissionKey, preferredTravelDate } = {}) {
  const travelers = [{ fullName: "المعتمر الأول", passportNo: "P1000001", isPrimary: true }, { fullName: "المعتمر الثاني", passportNo: "P1000002" }];
  const labels = [];
  const ids = [];
  const owners = [];
  for (const requirement of await checklist(service)) {
    for (const owner of requirement.scope === "TRAVELER" ? ["0", "1"] : [""]) {
      labels.push(requirement.name);
      ids.push(requirement.id);
      owners.push(owner);
    }
  }
  let req = request(app)
    .post("/api/contact-requests")
    .field("name", "TEST-WF مقدم طلب العمرة")
    .field("phone", phone)
    .field("service", service.name)
    .field("serviceId", service.id)
    .field("message", "TEST-WF طلب عمرة")
    .field("travelerCount", "2")
    .field("travelers", JSON.stringify(travelers))
    .field("acceptedTotal", String(acceptedTotal))
    .field("acceptedCurrency", "SAR")
    .field("documentLabels", JSON.stringify(labels))
    .field("documentRequirementIds", JSON.stringify(ids))
    .field("documentTravelerIndexes", JSON.stringify(owners));
  if (guarantorPhone !== null) req = req.field("guarantorPhone", guarantorPhone);
  if (extra) req = req.field("extraContactName", extra.name).field("extraContactPhone", extra.phone);
  if (submissionKey) req = req.field("submissionKey", submissionKey);
  if (preferredTravelDate !== undefined) req = req.field("preferredTravelDate", preferredTravelDate);
  labels.forEach((label, index) => {
    req = req.attach("documents", PDF(), { filename: `doc-${index}.pdf`, contentType: "application/pdf" });
  });
  return { res: await req, documentCount: labels.length };
}

const requestsFor = (phone) => prisma.contactRequest.count({ where: { phone } });

describe("Umrah package types and contacts", () => {
  test("the seed sets the three types; the new flight and sea packages stay unpublished with no price", async () => {
    const rows = await prisma.service.findMany({ where: { code: { in: ["SVC-UMRAH-VISA", "SVC-UMRAH-AIR", "SVC-UMRAH-SEA"] } } });
    const byCode = Object.fromEntries(rows.map((row) => [row.code, row]));
    assert.equal(umrahPackageKind(byCode["SVC-UMRAH-VISA"].features), "VISA_ONLY");
    for (const [code, kind] of [["SVC-UMRAH-AIR", "AIR"], ["SVC-UMRAH-SEA", "SEA"]]) {
      const row = byCode[code];
      assert.ok(row, `${code} exists`);
      assert.equal(umrahPackageKind(row.features), kind);
      assert.equal(row.active, false, "published by the agency, not by the seed");
      assert.equal(row.pricingMode, "QUOTE");
      assert.equal(Number(row.basePrice), 0, "no invented price");
      const names = (await prisma.visaRequirement.findMany({ where: { serviceId: row.id, active: true } })).map((r) => r.name);
      assert.ok(names.includes("إقامة الضامن"), JSON.stringify(names));
      assert.ok(names.some((name) => name.includes("جواز")), JSON.stringify(names));
    }
    const publicList = await request(app).get("/api/services/public/packages");
    assert.equal(publicList.status, 200);
    assert.ok(!publicList.body.data.some((row) => row.code === "SVC-UMRAH-AIR" || row.code === "SVC-UMRAH-SEA"), "unpublished packages are not offered");
  });

  test("contact rules: guarantor phone for Umrah only (missing = flagged for an older app, invalid = refused); extra contact optional but must be a phone", () => {
    assert.deepEqual(resolveUmrahContacts("UMRAH_PACKAGE", {}), { contacts: { guarantorPhoneMissing: true } });
    assert.deepEqual(resolveUmrahContacts("UMRAH_PACKAGE", { guarantorPhone: "abc" }), { error: "GUARANTOR_PHONE_INVALID" });
    assert.deepEqual(resolveUmrahContacts("UMRAH_PACKAGE", { guarantorPhone: GUARANTOR }), { contacts: { guarantorPhone: GUARANTOR } });
    assert.deepEqual(resolveUmrahContacts("UMRAH_PACKAGE", { guarantorPhone: GUARANTOR, extraContactName: "أحمد" }), { error: "EXTRA_CONTACT_PHONE_INVALID" });
    assert.deepEqual(resolveUmrahContacts("UMRAH_PACKAGE", { guarantorPhone: GUARANTOR, extraContactName: "أحمد", extraContactPhone: "0912345678" }), {
      contacts: { guarantorPhone: GUARANTOR, extraContact: { name: "أحمد", phone: "0912345678" } },
    });
    assert.deepEqual(resolveUmrahContacts("flight", {}), { contacts: null });
  });

  test("an older app without the guarantor field still submits; the request is flagged for staff", async () => {
    const service = await umrahPackage("VISA_ONLY");
    const phone = testPhone();
    const old = await submit(service, { phone, guarantorPhone: null });
    assert.equal(old.res.status, 201, JSON.stringify(old.res.body));
    assert.ok(old.res.body.data.paymentAccess?.token, "payment still opens straight away");
    const stored = await prisma.contactRequest.findUnique({ where: { id: old.res.body.data.id }, select: { intakeData: true, pricingMode: true, paymentStatus: true } });
    assert.equal(stored.pricingMode, "FIXED");
    assert.equal(stored.paymentStatus, "AWAITING_TRANSFER");
    assert.deepEqual(stored.intakeData.umrahContacts, { guarantorPhoneMissing: true });
  });

  test("an invalid guarantor phone, a bad extra contact or a changed price create nothing", async () => {
    const service = await umrahPackage("VISA_ONLY");
    const phone = testPhone();
    const invalid = await submit(service, { phone, guarantorPhone: "abc" });
    assert.equal(invalid.res.status, 400, JSON.stringify(invalid.res.body));
    assert.equal(invalid.res.body.code, "GUARANTOR_PHONE_INVALID");
    assert.equal(invalid.res.body.message, "رقم هاتف الضامن غير صحيح.");
    const badExtra = await submit(service, { phone, extra: { name: "أحمد", phone: "x" } });
    assert.equal(badExtra.res.status, 400, JSON.stringify(badExtra.res.body));
    assert.equal(badExtra.res.body.code, "EXTRA_CONTACT_PHONE_INVALID");
    const changed = await submit(service, { phone, acceptedTotal: PRICE });
    assert.equal(changed.res.status, 409, "one pilgrim's price for two pilgrims");
    assert.equal(changed.res.body.code, "PRICE_CHANGED");
    assert.equal(Number(changed.res.body.details.total), PRICE * 2);
    assert.equal(await requestsFor(phone), 0);
  });

  test("preferred travel date rules: required for flight/sea, optional for visa only, provisional; an older client without the field is flagged", () => {
    const now = new Date("2026-10-26T12:00:00Z");
    const air = ["KIND: AIR"];
    assert.deepEqual(resolveUmrahTravel("UMRAH_PACKAGE", air, "2026-12-01", now), { travel: { preferredDate: "2026-12-01", provisional: true } });
    assert.deepEqual(resolveUmrahTravel("UMRAH_PACKAGE", ["KIND: SEA"], "", now), { error: "TRAVEL_DATE_REQUIRED" });
    assert.deepEqual(resolveUmrahTravel("UMRAH_PACKAGE", air, undefined, now), { travel: { preferredDateMissing: true } });
    assert.deepEqual(resolveUmrahTravel("UMRAH_PACKAGE", ["KIND: VISA_ONLY"], "", now), { travel: null });
    assert.deepEqual(resolveUmrahTravel("UMRAH_PACKAGE", ["KIND: VISA_ONLY"], undefined, now), { travel: null });
    assert.deepEqual(resolveUmrahTravel("UMRAH_PACKAGE", [], "", now), { travel: null }, "a package with no type: optional");
    assert.deepEqual(resolveUmrahTravel("UMRAH_PACKAGE", air, "2026-02-30", now), { error: "TRAVEL_DATE_INVALID" });
    assert.deepEqual(resolveUmrahTravel("UMRAH_PACKAGE", air, "01/12/2026", now), { error: "TRAVEL_DATE_INVALID" });
    assert.deepEqual(resolveUmrahTravel("UMRAH_PACKAGE", air, "2026-10-24", now), { error: "TRAVEL_DATE_PASSED" });
    assert.deepEqual(resolveUmrahTravel("UMRAH_PACKAGE", air, "2026-10-25", now).travel?.preferredDate, "2026-10-25", "one day of slack");
    assert.deepEqual(resolveUmrahTravel("UMRAH_PACKAGE", air, "2030-01-01", now), { error: "TRAVEL_DATE_INVALID" });
    assert.deepEqual(resolveUmrahTravel("flight", air, "", now), { travel: null }, "other services ignore it");
  });

  test("POST /contact-requests: flight package without a date refused (nothing created), with a date stored; visa only without one accepted; old client flagged", async () => {
    const air = await umrahPackage("AIR");
    const phone = testPhone();
    const refused = await submit(air, { phone, preferredTravelDate: "" });
    assert.equal(refused.res.status, 400, JSON.stringify(refused.res.body));
    assert.equal(refused.res.body.code, "TRAVEL_DATE_REQUIRED");
    assert.match(refused.res.body.message, /ليس حجزًا مؤكدًا/);
    const past = await submit(air, { phone, preferredTravelDate: "2020-01-01" });
    assert.equal(past.res.body.code, "TRAVEL_DATE_PASSED");
    assert.equal(await requestsFor(phone), 0);

    const date = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    const ok = await submit(air, { phone, preferredTravelDate: date });
    assert.equal(ok.res.status, 201, JSON.stringify(ok.res.body));
    const stored = await prisma.contactRequest.findUnique({ where: { id: ok.res.body.data.id }, select: { intakeData: true } });
    assert.deepEqual(stored.intakeData.umrahTravel, { preferredDate: date, provisional: true });

    const oldPhone = testPhone();
    const old = await submit(air, { phone: oldPhone });
    assert.equal(old.res.status, 201, JSON.stringify(old.res.body));
    const oldStored = await prisma.contactRequest.findUnique({ where: { id: old.res.body.data.id }, select: { intakeData: true } });
    assert.deepEqual(oldStored.intakeData.umrahTravel, { preferredDateMissing: true });
    const staffRow = (await admin.get(`/api/contact-requests?limit=100&serviceKind=UMRAH&search=${oldPhone}`)).body.data.find((row) => row.id === old.res.body.data.id);
    // Staff see the flag (the next step asks for it once the documents are reviewed: umrahStaffQueue.test.js).
    assert.equal(staffRow?.intakeData?.umrahTravel?.preferredDateMissing, true);

    const visa = await umrahPackage("VISA_ONLY");
    const visaPhone = testPhone();
    const visaOnly = await submit(visa, { phone: visaPhone, preferredTravelDate: "" });
    assert.equal(visaOnly.res.status, 201, JSON.stringify(visaOnly.res.body));
    const visaStored = await prisma.contactRequest.findUnique({ where: { id: visaOnly.res.body.data.id }, select: { intakeData: true } });
    assert.equal(visaStored.intakeData.umrahTravel, undefined);
  });

  test("the draft route applies the same travel date rule", async () => {
    const service = await umrahPackage("SEA", { passport: false });
    const created = await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: service.id });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const token = created.body.data.token;
    const patched = await request(app).patch(`/api/intake-drafts/${token}`).send({ name: "TEST-WF مسودة عمرة بحرية", phone: testPhone(), travelerCount: 1, travelers: [{ fullName: "A" }] });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));
    const refused = await request(app).post(`/api/intake-drafts/${token}/submit`).send({ acceptedTotal: PRICE, acceptedCurrency: "SAR", guarantorPhone: GUARANTOR, preferredTravelDate: "" });
    assert.equal(refused.status, 400, JSON.stringify(refused.body));
    assert.equal(refused.body.code, "TRAVEL_DATE_REQUIRED");
    const date = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
    const accepted = await request(app).post(`/api/intake-drafts/${token}/submit`).send({ acceptedTotal: PRICE, acceptedCurrency: "SAR", guarantorPhone: GUARANTOR, preferredTravelDate: date });
    assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
    const stored = await prisma.contactRequest.findUnique({ where: { id: accepted.body.data.id }, select: { intakeData: true } });
    assert.equal(stored.intakeData.umrahTravel.preferredDate, date);
  });

  test("the draft route applies the same contact rules", async () => {
    const service = await umrahPackage("VISA_ONLY", { passport: false });
    const created = await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: service.id });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const token = created.body.data.token;
    const phone = testPhone();
    const patched = await request(app).patch(`/api/intake-drafts/${token}`).send({ name: "TEST-WF مسودة عمرة", phone, travelerCount: 1, travelers: [{ fullName: "A" }] });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));
    const refused = await request(app).post(`/api/intake-drafts/${token}/submit`).send({ acceptedTotal: PRICE, acceptedCurrency: "SAR", guarantorPhone: "abc" });
    assert.equal(refused.status, 400, JSON.stringify(refused.body));
    assert.equal(refused.body.code, "GUARANTOR_PHONE_INVALID");
    const accepted = await request(app).post(`/api/intake-drafts/${token}/submit`).send({ acceptedTotal: PRICE, acceptedCurrency: "SAR", guarantorPhone: GUARANTOR });
    assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
    const stored = await prisma.contactRequest.findUnique({ where: { id: accepted.body.data.id }, select: { intakeData: true, pricingMode: true } });
    assert.equal(stored.pricingMode, "FIXED");
    assert.equal(stored.intakeData.umrahContacts.guarantorPhone, GUARANTOR);
  });

  for (const [kind, execution, delivery] of [
    ["VISA_ONLY", "جارٍ إصدار التأشيرة", "تسليم التأشيرة"],
    ["AIR", "جارٍ إصدار التذاكر", "تسليم التأشيرة والتذاكر"],
    ["SEA", "جارٍ إصدار التذاكر", "تسليم التأشيرة والتذاكر"],
  ]) {
    test(`${kind}: package → pilgrims and guarantor → fixed total → payment under review → ${execution} → delivery`, async () => {
      const service = await umrahPackage(kind);
      const publicRow = (await request(app).get("/api/services/public/packages")).body.data.find((row) => row.id === service.id);
      assert.ok(publicRow, "published package is offered");
      assert.equal(publicRow.pricingMode, "FIXED");
      assert.equal(umrahPackageKind(publicRow.features), kind);

      const phone = testPhone();
      const submissionKey = randomUUID();
      const { res: created, documentCount } = await submit(service, { phone, submissionKey, extra: { name: "قريب المعتمر", phone: "0912345678" } });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const { id } = created.body.data;
      assert.ok(created.body.data.paymentAccess?.token, "fixed price: straight to payment");

      // a retry of the same submission returns the same request (with a fresh
      // payment token; the first one stops working)
      const retry = await submit(service, { phone, submissionKey, extra: { name: "قريب المعتمر", phone: "0912345678" } });
      assert.equal(retry.res.status, 200, JSON.stringify(retry.res.body));
      assert.equal(retry.res.body.data.id, id);
      assert.equal(await requestsFor(phone), 1, "no duplicate request");
      const paymentAccess = retry.res.body.data.paymentAccess;

      let detail = (await employee.get(`/api/contact-requests/${id}`)).body.data;
      assert.equal(detail.pricingMode, "FIXED");
      assert.equal(detail.travelers.length, 2, "every pilgrim is a traveler");
      assert.equal(detail.documents.length, documentCount);
      assert.ok(detail.documents.some((d) => d.label === "إقامة الضامن"), "guarantor residence arrived");
      assert.deepEqual(detail.intakeData.umrahContacts, { guarantorPhone: GUARANTOR, extraContact: { name: "قريب المعتمر", phone: "0912345678" } });
      assert.equal(detail.progress.serviceKind, "UMRAH");
      assert.ok(!detail.progress.steps.some((step) => step.key === "QUOTE"), "no later quote approval");

      const summary = await request(app).get(`/api/contact-requests/${id}/payment-access`).set("X-Payment-Access", paymentAccess.token);
      assert.equal(summary.status, 200, JSON.stringify(summary.body));
      assert.equal(Number(summary.body.data.amount), PRICE * 2);
      assert.equal(summary.body.data.currency, "SAR");
      assert.ok(summary.body.data.accounts.length > 0 && summary.body.data.accounts.every((row) => row.currency === "SAR"), "account in the request's currency");

      const receipt = await request(app)
        .post(`/api/contact-requests/${id}/payment-access/receipt`)
        .set("X-Payment-Access", paymentAccess.token)
        .attach("file", PDF(), { filename: "receipt.pdf", contentType: "application/pdf" });
      assert.equal(receipt.status, 201, JSON.stringify(receipt.body));
      assert.equal(receipt.body.data.request.paymentStatus, "UNDER_REVIEW", "a receipt is never a payment");
      assert.equal((await employee.post(`/api/contact-requests/${id}/confirm-payment`).send({})).status, 403, "only finance confirms");

      for (const document of detail.documents) {
        assert.equal((await employee.patch(`/api/contact-requests/${id}/documents/${document.id}/status`).send({ status: "ACCEPTED" })).status, 200);
      }
      assert.equal((await accountant.post(`/api/contact-requests/${id}/confirm-payment`).send({})).status, 200);

      const started = await employee.post(`/api/contact-requests/${id}/start-execution`).send({});
      assert.equal(started.status, 200, JSON.stringify(started.body));
      assert.equal(started.body.data.progress.label, execution);
      assert.equal(started.body.data.progress.steps.find((step) => step.key === "DELIVERY").label, delivery);

      detail = (await employee.get(`/api/contact-requests/${id}`)).body.data;
      for (const traveler of detail.travelers) {
        const file = await employee
          .post(`/api/contact-requests/${id}/deliverables`)
          .field("label", `التأشيرة — ${traveler.fullName}`)
          .field("travelerIds", JSON.stringify([traveler.id]))
          .field("publish", "true")
          .attach("file", PDF(), { filename: "final.pdf", contentType: "application/pdf" });
        assert.equal(file.status, 201, JSON.stringify(file.body));
      }
      const final = await prisma.contactRequest.findUnique({ where: { id }, select: { status: true, outcome: true, paymentStatus: true } });
      assert.equal(final.paymentStatus, "CONFIRMED");
      assert.equal(final.status, "CLOSED");
      assert.equal(final.outcome, "COMPLETED");
    });
  }
});
