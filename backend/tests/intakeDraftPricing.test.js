import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";

// The website's guided intake submits through /intake-drafts/:token/submit.
// It uses the same server pricing as the app (contact-request-pricing/
// fixed-price.js): a FIXED item becomes a FIXED request only with the total
// AND currency the server recomputes; a mismatch creates nothing and leaves
// the draft intact. The submit shares the 5-per-15min public ceiling, so this
// file submits exactly five times.

async function createService(admin, { pricingMode, priceUnit = "PER_TRAVELER" }) {
  const suffix = uniqueSuffix();
  const res = await admin.post("/api/services").send({
    code: `SVC-DRAFT-PRICE-${suffix}`,
    name: `Draft Pricing ${suffix}`,
    category: "qa-drafts",
    basePrice: 150,
    currency: "USD",
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  if (pricingMode === "FIXED") {
    const patch = await admin.patch(`/api/services/${res.body.data.id}`).send({ pricingMode: "FIXED", priceUnit });
    assert.equal(patch.status, 200, JSON.stringify(patch.body));
  }
  return res.body.data;
}

async function draftFor(service) {
  const created = await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: service.id });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const token = created.body.data.token;
  const patch = await request(app)
    .patch(`/api/intake-drafts/${token}`)
    .send({ name: "Draft Pricing Customer", phone: `0915${uniqueSuffix()}`, travelerCount: 2, travelers: [{ fullName: "A" }, { fullName: "B" }] });
  assert.equal(patch.status, 200, JSON.stringify(patch.body));
  return token;
}

const submit = (token, body) => request(app).post(`/api/intake-drafts/${token}/submit`).send(body);

describe("intake drafts — fixed-price confirmation", () => {
  let admin;
  let fixed;
  let quote;

  before(async () => {
    admin = await loginAsSuperAdmin();
    fixed = await createService(admin, { pricingMode: "FIXED" });
    quote = await createService(admin, { pricingMode: "QUOTE" });
  });

  test("a fixed total needs its currency; a mismatch creates nothing; the confirmed total becomes an approved invoice", async () => {
    const token = await draftFor(fixed);
    const before = await prisma.contactRequest.count();

    const missingCurrency = await submit(token, { acceptedTotal: 300 });
    assert.equal(missingCurrency.status, 409, JSON.stringify(missingCurrency.body));
    assert.equal(missingCurrency.body.code, "PRICE_CHANGED");
    assert.equal(missingCurrency.body.details.total, 300);
    assert.equal(missingCurrency.body.details.currency, "USD");

    const wrongCurrency = await submit(token, { acceptedTotal: "300", acceptedCurrency: "SAR" });
    assert.equal(wrongCurrency.status, 409);
    assert.equal(wrongCurrency.body.code, "PRICE_CHANGED");
    assert.equal(await prisma.contactRequest.count(), before, "a refused submission must not create a request");

    const ok = await submit(token, { acceptedTotal: "300.00", acceptedCurrency: "USD" });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const stored = await prisma.contactRequest.findUnique({ where: { id: ok.body.data.id }, include: { invoice: true } });
    assert.equal(stored.pricingMode, "FIXED");
    assert.equal(stored.paymentStatus, "AWAITING_TRANSFER");
    assert.equal(stored.pricingSnapshot.total, 300);
    assert.equal(stored.pricingSnapshot.units, 2);
    assert.equal(stored.invoice.status, "APPROVED");
    assert.equal(Number(stored.invoice.amount), 300);
    assert.equal(stored.invoice.currency, "USD");
  });

  test("a fixed item submitted without a confirmed total stays a quote request", async () => {
    const token = await draftFor(fixed);
    const res = await submit(token, {});
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const stored = await prisma.contactRequest.findUnique({ where: { id: res.body.data.id }, include: { invoice: true } });
    assert.equal(stored.pricingMode, "QUOTE");
    assert.equal(stored.pricingSnapshot.reason, "FIXED_PRICE_NOT_CONFIRMED");
    assert.equal(stored.invoice, null);
  });

  test("a total confirmed for an item that is now quoted is refused", async () => {
    const token = await draftFor(quote);
    const res = await submit(token, { acceptedTotal: 150, acceptedCurrency: "USD" });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "PRICING_MODE_CHANGED");
  });
});
