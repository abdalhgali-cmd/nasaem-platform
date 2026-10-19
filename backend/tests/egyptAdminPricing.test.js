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
