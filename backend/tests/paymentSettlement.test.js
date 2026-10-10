import "./env.js";
import { describe, test, before } from "node:test";
import assert from "node:assert/strict";

import prisma from "../src/config/database.js";
import { uniqueSuffix } from "./helpers/api.js";
import { createOrganization, createStaffUser, staffClient } from "./helpers/staff.js";
import { getFinancialReport } from "../src/modules/finance/finance.service.js";

// Financial acceptance scenarios. Each test gets its own order in its own
// organization, so reports can be compared exactly.
let organization;
let accountant;
let employee;

before(async () => {
  organization = await createOrganization("finance");
  accountant = await createStaffUser({ role: "ACCOUNTANT", organizationId: organization.id });
  employee = await createStaffUser({ role: "EMPLOYEE", organizationId: organization.id });
});

async function newOrder({ total = "1000.00", currency = "USD" } = {}) {
  const suffix = uniqueSuffix();
  const customer = await prisma.customer.create({
    data: { customerNo: `FIN-${suffix}`, fullName: `Finance Customer ${suffix}`, organizationId: organization.id },
  });
  return prisma.order.create({
    data: { orderNumber: `FIN-ORD-${suffix}`, customerId: customer.id, totalAmount: total, currency, organizationId: organization.id },
  });
}

const key = () => `k${uniqueSuffix()}${Math.random().toString(16).slice(2, 8)}`;

async function settlementOf(orderId) {
  const res = await staffClient(accountant).get(`/api/orders/${orderId}`);
  assert.equal(res.status, 200);
  return { ...res.body.data.settlement, orderPaymentStatus: res.body.data.paymentStatus };
}

function pay(orderId, body, { idempotencyKey } = {}) {
  const req = staffClient(accountant).post("/api/payments");
  if (idempotencyKey) req.set("Idempotency-Key", idempotencyKey);
  return req.send({ orderId, paymentMethod: "cash", ...body });
}

describe("currency integrity", () => {
  test("1000 USD order, confirmed 400 USD: paid 400, outstanding 600, PARTIAL", async () => {
    const order = await newOrder();
    const res = await pay(order.id, { amount: 400, currency: "USD" });
    assert.equal(res.status, 201);
    const s = await settlementOf(order.id);
    assert.equal(s.netPaid, "400.00");
    assert.equal(s.outstanding, "600.00");
    assert.equal(s.status, "PARTIAL");
    assert.equal(s.orderPaymentStatus, "PARTIAL");
  });

  test("a payment without a currency is recorded in the order's currency, not SAR", async () => {
    const order = await newOrder();
    const res = await pay(order.id, { amount: 100 });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.currency, "USD");
  });

  test("a payment in another currency is refused and nothing is recorded", async () => {
    const order = await newOrder();
    const res = await pay(order.id, { amount: 400, currency: "SAR" });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "CURRENCY_MISMATCH");
    assert.equal(await prisma.payment.count({ where: { orderId: order.id } }), 0);
  });

  test("a payment row can no longer be labelled PARTIAL or REFUNDED", async () => {
    const order = await newOrder();
    assert.equal((await pay(order.id, { amount: 100, status: "PARTIAL" })).status, 400);
    assert.equal((await pay(order.id, { amount: 100, status: "REFUNDED" })).status, 400);
  });

  test("more than two decimals is refused instead of silently rounded", async () => {
    const order = await newOrder();
    assert.equal((await pay(order.id, { amount: 10.005 })).status, 400);
  });
});

describe("pending vs confirmed money, over-payment", () => {
  test("a pending payment does not count as received until confirmed", async () => {
    const order = await newOrder();
    await pay(order.id, { amount: 400 });
    const pending = await pay(order.id, { amount: 300, pendingReview: true });
    assert.equal(pending.status, 201);
    let s = await settlementOf(order.id);
    assert.equal(s.netPaid, "400.00");
    assert.equal(s.pending, "300.00");

    const confirm = await staffClient(accountant).post(`/api/payments/${pending.body.data.id}/confirm`);
    assert.equal(confirm.status, 200);
    s = await settlementOf(order.id);
    assert.equal(s.netPaid, "700.00");
    assert.equal(s.pending, "0.00");
    assert.equal(s.status, "PARTIAL");
  });

  test("over-payment is refused; paying exactly the balance settles the order", async () => {
    const order = await newOrder();
    await pay(order.id, { amount: 400 });
    const over = await pay(order.id, { amount: 700 });
    assert.equal(over.status, 409);
    assert.equal(over.body.code, "OVERPAYMENT");
    assert.equal((await pay(order.id, { amount: 600 })).status, 201);
    const s = await settlementOf(order.id);
    assert.equal(s.status, "PAID");
    assert.equal(s.outstanding, "0.00");
  });

  test("confirming a pending payment that would over-pay is refused", async () => {
    const order = await newOrder();
    const pending = await pay(order.id, { amount: 800, pendingReview: true });
    await pay(order.id, { amount: 500 });
    const confirm = await staffClient(accountant).post(`/api/payments/${pending.body.data.id}/confirm`);
    assert.equal(confirm.status, 409);
    assert.equal((await settlementOf(order.id)).netPaid, "500.00");
  });

  test("an EMPLOYEE cannot record or confirm payments", async () => {
    const order = await newOrder();
    const res = await staffClient(employee).post("/api/payments").send({ orderId: order.id, amount: 1, paymentMethod: "cash" });
    assert.equal(res.status, 403);
  });
});

describe("idempotency and concurrency", () => {
  test("replaying the same submission records one payment and returns it", async () => {
    const order = await newOrder();
    const k = key();
    const first = await pay(order.id, { amount: 250 }, { idempotencyKey: k });
    const replay = await pay(order.id, { amount: 250 }, { idempotencyKey: k });
    assert.equal(first.status, 201);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.replayed, true);
    assert.equal(replay.body.data.id, first.body.data.id);
    assert.equal(await prisma.payment.count({ where: { orderId: order.id } }), 1);
  });

  test("the same key with a different payment is refused", async () => {
    const order = await newOrder();
    const k = key();
    await pay(order.id, { amount: 250 }, { idempotencyKey: k });
    const reused = await pay(order.id, { amount: 300 }, { idempotencyKey: k });
    assert.equal(reused.status, 409);
    assert.equal(reused.body.code, "IDEMPOTENCY_KEY_REUSED");
  });

  test("two intentionally distinct payments of the same amount both count", async () => {
    const order = await newOrder();
    assert.equal((await pay(order.id, { amount: 100 }, { idempotencyKey: key() })).status, 201);
    assert.equal((await pay(order.id, { amount: 100 }, { idempotencyKey: key() })).status, 201);
    assert.equal((await settlementOf(order.id)).netPaid, "200.00");
  });

  test("concurrent duplicate submissions create exactly one payment", async () => {
    const order = await newOrder();
    const k = key();
    const results = await Promise.all(Array.from({ length: 6 }, () => pay(order.id, { amount: 150 }, { idempotencyKey: k })));
    assert.ok(results.every((r) => [200, 201].includes(r.status)), results.map((r) => r.status).join(","));
    assert.equal(await prisma.payment.count({ where: { orderId: order.id } }), 1);
  });

  test("concurrent distinct payments never over-pay the order", async () => {
    const order = await newOrder();
    const results = await Promise.all(Array.from({ length: 6 }, () => pay(order.id, { amount: 300 }, { idempotencyKey: key() })));
    const accepted = results.filter((r) => r.status === 201).length;
    assert.equal(accepted, 3, `statuses: ${results.map((r) => r.status)}`);
    assert.ok(results.filter((r) => r.status !== 201).every((r) => r.status === 409));
    assert.equal((await settlementOf(order.id)).netPaid, "900.00");
  });
});

describe("refunds", () => {
  test("partial refunds reduce net paid, cannot exceed the payment, and are linked to it", async () => {
    const order = await newOrder();
    const payment = (await pay(order.id, { amount: 400 })).body.data;

    const refund = await staffClient(accountant).post(`/api/payments/${payment.id}/refund`).send({ amount: 150, reason: "إلغاء جزء من الخدمة" });
    assert.equal(refund.status, 201);
    assert.equal(refund.body.data.kind, "REFUND");
    assert.equal(refund.body.data.refundOfPaymentId, payment.id);
    assert.equal(refund.body.data.currency, "USD");
    assert.equal(refund.body.data.createdByUserId, accountant.id);
    let s = await settlementOf(order.id);
    assert.equal(s.netPaid, "250.00");
    assert.equal(s.refunded, "150.00");
    assert.equal(s.status, "PARTIAL");

    const over = await staffClient(accountant).post(`/api/payments/${payment.id}/refund`).send({ amount: 300, reason: "أكثر من المتاح" });
    assert.equal(over.status, 409);
    assert.equal(over.body.code, "OVER_REFUND");

    assert.equal((await staffClient(accountant).post(`/api/payments/${payment.id}/refund`).send({ amount: 250, reason: "استرجاع الباقي" })).status, 201);
    s = await settlementOf(order.id);
    assert.equal(s.netPaid, "0.00");
    assert.equal(s.status, "REFUNDED");

    const original = await prisma.payment.findUnique({ where: { id: payment.id } });
    assert.equal(original.status, "PAID", "the original payment record is preserved");
    assert.equal(original.amount.toFixed(2), "400.00");
  });

  test("a refund cannot be taken from a pending payment or from a refund", async () => {
    const order = await newOrder();
    const pending = (await pay(order.id, { amount: 100, pendingReview: true })).body.data;
    assert.equal((await staffClient(accountant).post(`/api/payments/${pending.id}/refund`).send({ amount: 10, reason: "غير مؤكدة" })).status, 409);
  });

  test("duplicate and concurrent refunds do not over-refund", async () => {
    const order = await newOrder();
    const payment = (await pay(order.id, { amount: 300 })).body.data;
    const k = key();
    const dup = await Promise.all([1, 2, 3].map(() =>
      staffClient(accountant).post(`/api/payments/${payment.id}/refund`).set("Idempotency-Key", k).send({ amount: 100, reason: "استرجاع مكرر" })
    ));
    assert.equal(await prisma.payment.count({ where: { refundOfPaymentId: payment.id } }), 1, dup.map((r) => r.status).join(","));

    const racing = await Promise.all([1, 2, 3].map(() =>
      staffClient(accountant).post(`/api/payments/${payment.id}/refund`).set("Idempotency-Key", key()).send({ amount: 200, reason: "استرجاع متزامن" })
    ));
    assert.equal(racing.filter((r) => r.status === 201).length, 1, racing.map((r) => r.status).join(","));
    assert.equal((await settlementOf(order.id)).netPaid, "0.00");
  });

  test("an EMPLOYEE cannot refund", async () => {
    const order = await newOrder();
    const payment = (await pay(order.id, { amount: 100 })).body.data;
    assert.equal((await staffClient(employee).post(`/api/payments/${payment.id}/refund`).send({ amount: 10, reason: "غير مسموح" })).status, 403);
  });
});

describe("reports agree with the order settlement", () => {
  test("finance totals equal the sum of order settlements, per currency", async () => {
    const reportOrg = await createOrganization("finance-report");
    const reportAccountant = await createStaffUser({ role: "ACCOUNTANT", organizationId: reportOrg.id });
    const make = async (total, currency) => {
      const suffix = uniqueSuffix();
      const customer = await prisma.customer.create({ data: { customerNo: `RPT-${suffix}`, fullName: "Report", organizationId: reportOrg.id } });
      return prisma.order.create({ data: { orderNumber: `RPT-${suffix}`, customerId: customer.id, totalAmount: total, currency, organizationId: reportOrg.id } });
    };
    const usd = await make("1000.00", "USD");
    const sar = await make("500.00", "SAR");
    const client = staffClient(reportAccountant);
    const p1 = (await client.post("/api/payments").send({ orderId: usd.id, amount: 400, paymentMethod: "cash" })).body.data;
    await client.post(`/api/payments/${p1.id}/refund`).send({ amount: 100, reason: "استرجاع جزئي" });
    await client.post("/api/payments").send({ orderId: sar.id, amount: 200, paymentMethod: "cash", pendingReview: true });
    await client.post("/api/payments").send({ orderId: sar.id, amount: 50, paymentMethod: "cash" });

    const report = await getFinancialReport({ period: "month", organizationId: reportOrg.id });
    assert.equal(report.totals.mixedCurrencies, true);
    assert.equal(report.totals.paid, null, "USD and SAR are never added together");
    const byCurrency = Object.fromEntries(report.totalsByCurrency.map((row) => [row.currency, row]));
    assert.equal(byCurrency.USD.paid, 300);
    assert.equal(byCurrency.USD.refunds, 100);
    assert.equal(byCurrency.USD.outstanding, 700);
    assert.equal(byCurrency.SAR.paid, 50);
    assert.equal(byCurrency.SAR.pendingReview, 200);
    assert.equal(byCurrency.SAR.outstanding, 450);

    const usdSettlement = (await client.get(`/api/orders/${usd.id}`)).body.data.settlement;
    assert.equal(Number(usdSettlement.netPaid), byCurrency.USD.paid);
  });
});
