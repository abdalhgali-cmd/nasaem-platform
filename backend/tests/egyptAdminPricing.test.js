import "./env.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request, loginAsSuperAdmin } from "./helpers/api.js";
import { getCurrencyRates } from "../src/modules/flights/flights.service.js";
import { refreshStoredFlightPrices } from "../src/modules/flights/fx-refresh.service.js";

const codes = ["VISA-EGYPT-CLEARANCE-AIR", "VISA-EGYPT-CLEARANCE-BORDER"];
const url = "/api/visa-types/egypt/config";

test("Egypt admin controls require authentication and reject invalid or partial rates", async () => {
  const anonymousGet = await request(app).get(url);
  assert.equal(anonymousGet.status, 401);
  const anonymousWrite = await request(app).patch(url).send({ usdRateToSdg: 9200 });
  assert.equal(anonymousWrite.status, 401);
  const agent = await loginAsSuperAdmin();
  const invalid = await agent.patch(url).send({ usdRateToSdg: 0, air: { priceUsd: 85, active: true }, border: { priceUsd: 155, active: true } });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, "INVALID_EGYPT_PRICING");
});

test("Egypt admin sets both fixed per-traveler variants and the shared SDG rate", async () => {
  const agent = await loginAsSuperAdmin();
  const original = await prisma.visaType.findMany({ where: { code: { in: codes } } });
  assert.equal(original.length, 2, "seed must create both Egypt variants");
  const originalRate = await prisma.setting.findUnique({ where: { key: "FX_USD_SDG" } });
  try {
    const updated = await agent.patch(url).send({
      usdRateToSdg: 9200,
      air: { priceUsd: 85, active: true },
      border: { priceUsd: 155, active: true },
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.data.usdRateToSdg, 9200);
    assert.equal(updated.body.data.air.priceUsd, 85);
    assert.equal(updated.body.data.border.priceUsd, 155);
    const catalog = await request(app).get("/api/services/public");
    assert.equal(catalog.status, 200);
    for (const [code, usd, sdg] of [[codes[0], 85, 782000], [codes[1], 155, 1426000]]) {
      const variant = catalog.body.data.visaTypes.find((v) => v.code === code);
      assert.ok(variant, `active variant ${code} must appear publicly`);
      assert.equal(variant.pricingMode, "FIXED");
      assert.equal(variant.priceUnit, "PER_TRAVELER");
      assert.equal(variant.currency, "USD");
      assert.equal(Number(variant.basePrice), usd);
      assert.equal(Number(variant.priceSdg), sdg);
    }
  } finally {
    // Keep this shared test database's seed configuration unchanged for
    // later files (including E2E tests for unavailable/QUOTE variants).
    for (const row of original) {
      await prisma.visaType.update({
        where: { id: row.id },
        data: { active: row.active, basePrice: row.basePrice, currency: row.currency,
          pricingMode: row.pricingMode, priceUnit: row.priceUnit,
          paymentAfterDocumentReview: row.paymentAfterDocumentReview },
      });
    }
    if (originalRate) {
      await prisma.setting.update({ where: { key: "FX_USD_SDG" }, data: { value: originalRate.value } });
    } else {
      await prisma.setting.deleteMany({ where: { key: "FX_USD_SDG" } });
    }
    await refreshStoredFlightPrices(await getCurrencyRates());
  }
});

// ---- acceptance: roles, availability and price history

import { createStaffUser, staffClient } from "./helpers/staff.js";
import { applyEgyptPricingConfig } from "../src/modules/egypt-clearance/egypt-pricing-admin.controller.js";

async function snapshotConfig() {
  const rows = await prisma.visaType.findMany({ where: { code: { in: codes } } });
  const rate = await prisma.setting.findUnique({ where: { key: "FX_USD_SDG" } });
  return async () => {
    for (const row of rows) {
      await prisma.visaType.update({ where: { id: row.id }, data: { active: row.active, basePrice: row.basePrice, currency: row.currency, pricingMode: row.pricingMode, priceUnit: row.priceUnit, paymentAfterDocumentReview: row.paymentAfterDocumentReview } });
    }
    if (rate) await prisma.setting.update({ where: { key: "FX_USD_SDG" }, data: { value: rate.value } });
    else await prisma.setting.deleteMany({ where: { key: "FX_USD_SDG" } });
    await refreshStoredFlightPrices(await getCurrencyRates());
  };
}

async function submitAir(acceptedTotal) {
  const visa = await prisma.visaType.findUnique({ where: { code: codes[0] }, include: { requirements: { where: { active: true } } } });
  let req = request(app)
    .post("/api/contact-requests")
    .field("name", "TEST-EGP عميل")
    .field("phone", `091${String(Date.now()).slice(-7)}`)
    .field("message", "TEST-EGP")
    .field("visaTypeId", visa.id)
    .field("travelers", JSON.stringify([{ fullName: "TEST-EGP مسافر", isPrimary: true }, { fullName: "TEST-EGP مرافق" }]))
    .field("travelerCount", "2")
    .field("acceptedTotal", String(acceptedTotal))
    .field("acceptedCurrency", "USD");
  const documents = visa.requirements.filter((r) => r.type === "DOCUMENT" && r.required);
  const labels = [];
  const ids = [];
  const owners = [];
  for (const requirement of documents) {
    const travelersFor = requirement.scope === "TRAVELER" ? ["0", "1"] : [""];
    for (const owner of travelersFor) {
      labels.push(requirement.name);
      ids.push(requirement.id);
      owners.push(owner);
      req = req.attach("documents", Buffer.from("%PDF-1.4\n%%EOF"), { filename: "doc.pdf", contentType: "application/pdf" });
    }
  }
  return req.field("documentLabels", JSON.stringify(labels)).field("documentRequirementIds", JSON.stringify(ids)).field("documentTravelerIndexes", JSON.stringify(owners));
}

test("only administrators can read or change the Egypt settings", async () => {
  for (const role of ["EMPLOYEE", "ACCOUNTANT", "CONTENT_MANAGER"]) {
    const staff = staffClient(await createStaffUser({ role }));
    assert.equal((await staff.get(url)).status, 403, role);
    assert.equal((await staff.patch(url).send({ usdRateToSdg: 1, air: { priceUsd: 1, active: true }, border: { priceUsd: 1, active: true } })).status, 403, role);
  }
});

test("approved prices: per-traveler total, a disabled variant refuses new requests, and a price change never reprices an existing request", async () => {
  const restore = await snapshotConfig();
  try {
    const applied = await applyEgyptPricingConfig({ usdRateToSdg: 9200, air: { priceUsd: 85, active: true }, border: { priceUsd: 155, active: true } });
    assert.equal(applied.error, undefined);
    // Two travelers at 85 USD each: the confirmed total is 170 USD.
    const created = await submitAir(170);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    const stored = await prisma.contactRequest.findUnique({ where: { id }, include: { invoice: true } });
    assert.equal(stored.pricingMode, "FIXED");
    assert.equal(Number(stored.invoice.amount), 170);
    assert.equal(stored.invoice.status, "APPROVED", "no quote or price-approval stage");
    assert.equal(stored.paymentStatus, "AWAITING_TRANSFER");

    // A new price applies to new requests only.
    await applyEgyptPricingConfig({ usdRateToSdg: 9200, air: { priceUsd: 99, active: true }, border: { priceUsd: 155, active: true } });
    const after = await prisma.contactRequest.findUnique({ where: { id }, include: { invoice: true } });
    assert.equal(Number(after.invoice.amount), 170, "the confirmed price is kept");
    const stale = await submitAir(170);
    assert.equal(stale.status, 409, "a total confirmed at the old price is refused");

    // Disabled: no longer listed, and a submission is refused (nothing created).
    await applyEgyptPricingConfig({ usdRateToSdg: 9200, air: { priceUsd: 85, active: false }, border: { priceUsd: 155, active: true } });
    const catalog = await request(app).get("/api/services/public");
    assert.ok(!catalog.body.data.visaTypes.some((v) => v.code === codes[0]));
    const before = await prisma.contactRequest.count();
    const refused = await submitAir(170);
    assert.ok([400, 409, 422].includes(refused.status), JSON.stringify(refused.body));
    assert.equal(await prisma.contactRequest.count(), before);
    await prisma.contactRequest.delete({ where: { id } });
  } finally {
    await restore();
  }
});

test("a price that would not survive storage (sub-cent) is refused, and a variant without its document checklist cannot be opened", async () => {
  const agent = await loginAsSuperAdmin();
  const subCent = await agent.patch(url).send({ usdRateToSdg: 9200, air: { priceUsd: 0.001, active: true }, border: { priceUsd: 155, active: true } });
  assert.equal(subCent.status, 400);
  const restore = await snapshotConfig();
  const air = await prisma.visaType.findUnique({ where: { code: codes[0] } });
  const documents = await prisma.visaRequirement.findMany({ where: { visaTypeId: air.id, active: true, type: "DOCUMENT" }, select: { id: true } });
  try {
    await prisma.visaRequirement.updateMany({ where: { id: { in: documents.map((d) => d.id) } }, data: { active: false } });
    const refused = await agent.patch(url).send({ usdRateToSdg: 9200, air: { priceUsd: 85, active: true }, border: { priceUsd: 155, active: false } });
    assert.equal(refused.status, 409, JSON.stringify(refused.body));
    assert.equal((await prisma.visaType.findUnique({ where: { code: codes[0] } })).active, air.active, "nothing changed");
    // Counted from a fixed point in time (a sliding window could drop an
    // earlier test's row on a slow runner).
    const since = new Date();
    const audit = await prisma.activityLog.count({ where: { action: "EGYPT_PRICING_UPDATED", createdAt: { gte: since } } });
    // Saving with the variant inactive is allowed and audited in the same transaction.
    const saved = await agent.patch(url).send({ usdRateToSdg: 9200, air: { priceUsd: 85, active: false }, border: { priceUsd: 155, active: false } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(await prisma.activityLog.count({ where: { action: "EGYPT_PRICING_UPDATED", createdAt: { gte: since } } }), audit + 1);
  } finally {
    await prisma.visaRequirement.updateMany({ where: { id: { in: documents.map((d) => d.id) } }, data: { active: true } });
    await restore();
  }
});
