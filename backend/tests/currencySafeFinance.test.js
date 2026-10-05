import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";

import prisma from "../src/config/database.js";
import { loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import { getFinancialReport } from "../src/modules/finance/finance.service.js";

// Financial rule under test (see docs/FINANCIAL_MODEL.md):
//   * An order is priced in ONE currency (order.currency) — the settlement
//     currency. Its balance is always expressed in that currency.
//   * A payment records what was actually received (amount + currency). When
//     that differs from the order currency the staff member must supply the
//     rate used (fxRate = order-currency units per 1 payment-currency unit);
//     the server stores fxRate and convertedAmount (Decimal, half-up, 2dp) as
//     an immutable snapshot, so later rate changes never rewrite history.
//   * paid = Σ converted(PAID) − Σ converted(REFUNDED), floored at 0;
//     balanceDue = max(total − paid, 0); overpaidAmount = max(paid − total, 0).
//   * Reports never add amounts across currencies.

const n = (value) => Number(value);

describe("currency-safe payments", () => {
  let agent;
  let customerId;
  let serviceId;

  before(async () => {
    agent = await loginAsSuperAdmin();
    const customer = await agent.post("/api/customers").send({
      fullName: "Currency Test Customer",
      passportNo: `CUR${uniqueSuffix()}`,
      nationality: "Sudan",
    });
    customerId = customer.body.data.id;
    const service = await agent.post("/api/services").send({
      code: `CUR-SVC-${uniqueSuffix()}`,
      name: "Currency Test Service",
      category: "test",
      basePrice: 100,
    });
    serviceId = service.body.data.id;
  });

  async function createOrder(total, currency = "SAR") {
    const res = await agent.post("/api/orders").send({ customerId, currency, items: [{ serviceId, quantity: 1, unitPrice: total }] });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.data;
  }

  async function pay(orderId, body) {
    return agent.post("/api/payments").send({ orderId, paymentMethod: "bank_transfer", ...body });
  }

  async function reload(orderId) {
    const res = await agent.get(`/api/orders/${orderId}`);
    assert.equal(res.status, 200);
    return res.body.data;
  }

  test("same-currency payment is stored with rate 1 and counts at face value", async () => {
    const order = await createOrder(1000, "SAR");
    const res = await pay(order.id, { amount: 1000, currency: "SAR" });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(n(res.body.data.fxRate), 1);
    assert.equal(n(res.body.data.convertedAmount), 1000);
    const after = await reload(order.id);
    assert.equal(after.paymentStatus, "PAID");
    assert.equal(n(after.paidAmount), 1000);
    assert.equal(n(after.balanceDue), 0);
  });

  test("EXPLOIT: a payment in another currency is not counted 1:1 against the order total", async () => {
    const order = await createOrder(1000, "SAR");
    // 400,000 SDG at 0.0015 SAR/SDG = 600 SAR — NOT 400,000 and not "PAID".
    const res = await pay(order.id, { amount: 400000, currency: "SDG", fxRate: 0.0015 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(n(res.body.data.convertedAmount), 600);
    const after = await reload(order.id);
    assert.equal(after.paymentStatus, "PARTIAL");
    assert.equal(n(after.paidAmount), 600);
    assert.equal(n(after.balanceDue), 400);
  });

  test("cross-currency payment without a rate is rejected", async () => {
    const order = await createOrder(1000, "SAR");
    const res = await pay(order.id, { amount: 100, currency: "USD" });
    assert.equal(res.status, 400);
    assert.equal((await reload(order.id)).paymentStatus, "UNPAID");
  });

  test("invalid or contradictory rates are rejected", async () => {
    const order = await createOrder(1000, "SAR");
    assert.equal((await pay(order.id, { amount: 100, currency: "USD", fxRate: 0 })).status, 400);
    assert.equal((await pay(order.id, { amount: 100, currency: "USD", fxRate: -3.75 })).status, 400);
    assert.equal((await pay(order.id, { amount: 100, currency: "SAR", fxRate: 2 })).status, 400, "same-currency rate must be 1");
  });

  test("multiple mixed-currency partial payments accumulate in the order currency", async () => {
    const order = await createOrder(1000, "SAR");
    await pay(order.id, { amount: 400000, currency: "SDG", fxRate: 0.0015 }); // 600
    await pay(order.id, { amount: 100, currency: "USD", fxRate: 3.75 }); // 375
    let after = await reload(order.id);
    assert.equal(after.paymentStatus, "PARTIAL");
    assert.equal(n(after.paidAmount), 975);
    assert.equal(n(after.balanceDue), 25);
    await pay(order.id, { amount: 25, currency: "SAR" });
    after = await reload(order.id);
    assert.equal(after.paymentStatus, "PAID");
    assert.equal(n(after.balanceDue), 0);
  });

  test("overpayment is flagged, not hidden", async () => {
    const order = await createOrder(1000, "SAR");
    await pay(order.id, { amount: 1200, currency: "SAR" });
    const after = await reload(order.id);
    assert.equal(after.paymentStatus, "PAID");
    assert.equal(n(after.balanceDue), 0);
    assert.equal(n(after.overpaidAmount), 200);
  });

  test("conversion uses Decimal half-up rounding to 2 decimals", async () => {
    const order = await createOrder(1000, "SAR");
    const half = await pay(order.id, { amount: 0.05, currency: "USD", fxRate: 0.5 }); // 0.025 -> 0.03
    assert.equal(n(half.body.data.convertedAmount), 0.03);
    const third = await pay(order.id, { amount: 100, currency: "USD", fxRate: 0.3333333 }); // 33.33333 -> 33.33
    assert.equal(n(third.body.data.convertedAmount), 33.33);
    const after = await reload(order.id);
    assert.equal(n(after.paidAmount), 33.36, "no floating point drift in the running total");
  });

  test("refunds reduce the net paid amount (same and cross currency)", async () => {
    const order = await createOrder(1000, "SAR");
    await pay(order.id, { amount: 1000, currency: "SAR" });
    await pay(order.id, { amount: 400, currency: "SAR", status: "REFUNDED" });
    let after = await reload(order.id);
    assert.equal(after.paymentStatus, "PARTIAL");
    assert.equal(n(after.paidAmount), 600);
    assert.equal(n(after.balanceDue), 400);

    await pay(order.id, { amount: 100, currency: "USD", fxRate: 3.75, status: "REFUNDED" }); // -375
    after = await reload(order.id);
    assert.equal(n(after.paidAmount), 225);
  });

  test("a refund-only order stays unpaid and never goes negative", async () => {
    const order = await createOrder(100, "SAR");
    await pay(order.id, { amount: 100, currency: "SAR", status: "REFUNDED" });
    const after = await reload(order.id);
    assert.equal(after.paymentStatus, "UNPAID");
    assert.equal(n(after.paidAmount), 0);
  });
});

describe("currency-safe financial reports", () => {
  test("EXPLOIT: totals are reported per currency and never summed across currencies", async () => {
    const suffix = uniqueSuffix();
    const org = await prisma.organization.create({ data: { slug: `fin-${suffix}`, name: `Finance Test ${suffix}` } });
    const customer = await prisma.customer.create({
      data: { organizationId: org.id, customerNo: `FIN-${suffix}`, fullName: "Report Customer", passportNo: `FINP${suffix}` },
    });
    const mk = (currency, total, i) =>
      prisma.order.create({
        data: { organizationId: org.id, orderNumber: `FIN-${suffix}-${i}`, customerId: customer.id, currency, totalAmount: total },
      });
    await mk("SAR", "100.10", 1);
    await mk("SAR", "200.20", 2);
    await mk("USD", "50.00", 3);
    await mk("SDG", "900000.00", 4);

    const report = await getFinancialReport({ period: "month", organizationId: org.id });

    assert.ok(Array.isArray(report.totalsByCurrency), "report must expose totalsByCurrency");
    const by = Object.fromEntries(report.totalsByCurrency.map((row) => [row.currency, row]));
    assert.deepEqual(Object.keys(by).sort(), ["SAR", "SDG", "USD"]);
    assert.equal(by.SAR.revenue, "300.30", "Decimal-exact (0.1+0.2 style drift must not occur)");
    assert.equal(by.USD.revenue, "50.00");
    assert.equal(by.SDG.revenue, "900000.00");
    assert.equal(by.SAR.outstanding, "300.30");
    assert.equal(report.totals, undefined, "no single mixed-currency grand total may be produced");
  });
});
