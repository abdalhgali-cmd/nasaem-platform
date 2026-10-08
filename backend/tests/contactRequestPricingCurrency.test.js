import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";

// QAR joined SUPPORTED_CURRENCIES (src/utils/enums.js) alongside the
// existing SAR/USD/EUR/EGP/SDG/AED/GBP set. This exercises it through the
// same pricing-invoice path staff actually use, not just the enum in
// isolation.

async function createCase() {
  return prisma.contactRequest.create({
    data: {
      name: "Pricing Currency Test",
      phone: `0933${uniqueSuffix()}`,
      phoneNormalized: `+249933${uniqueSuffix()}`,
      message: "حالة اختبار عملة القطري",
    },
  });
}

describe("contact-request pricing accepts QAR", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
  });

  test("pricing-invoice stores a QAR-denominated invoice", async () => {
    const contactRequest = await createCase();

    const invoiceRes = await agent
      .post(`/api/contact-requests/${contactRequest.id}/pricing-invoice`)
      .send({ sourceAmount: 100, exchangeRate: 110, marginPercent: 10, currency: "QAR" });
    assert.equal(invoiceRes.status, 201, JSON.stringify(invoiceRes.body));
    assert.equal(invoiceRes.body.data.invoice.currency, "QAR");
    assert.ok(Math.abs(Number(invoiceRes.body.data.invoice.amount) - 100 * 110 * 1.1) < 0.001);
  });

  test("an unsupported currency is rejected", async () => {
    const contactRequest = await createCase();

    const res = await agent
      .post(`/api/contact-requests/${contactRequest.id}/pricing-invoice`)
      .send({ sourceAmount: 100, exchangeRate: 110, marginPercent: 0, currency: "JPY" });
    assert.equal(res.status, 400);
  });
});
