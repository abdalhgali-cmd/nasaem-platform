import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { getDashboardSummary, getOperationsCenter } from "../src/modules/dashboard/dashboard.service.js";
import { loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

describe("dashboard summary and operations", () => {
  test("summary returns period counters without fabricating profit", async () => {
    const summary = await getDashboardSummary();
    assert.ok(summary.periods.today);
    assert.ok(summary.periods.last7Days);
    assert.ok(summary.periods.month);
    assert.equal(summary.profit, null);
    assert.match(summary.profitNote, /تكلفة المورد/);
  });

  // Regression: the "today paid" figure used to sum any payment whose
  // status wasn't REFUNDED, which — once payment review introduced
  // pendingReview payments that stay UNPAID until confirmed — would have
  // counted a not-yet-confirmed payment as already collected.
  test("a pending-review payment does not inflate today's paid total until confirmed", async () => {
    const agent = await loginAsSuperAdmin();
    const suffix = uniqueSuffix();

    const customerRes = await agent.post("/api/customers").send({ fullName: "Summary Regression " + suffix, passportNo: "SUMREG" + suffix, nationality: "Test" });
    const serviceRes = await agent.post("/api/services").send({ code: "SUMREG-" + suffix, name: "Summary regression service", category: "test", basePrice: 100 });
    const orderRes = await agent.post("/api/orders").send({ customerId: customerRes.body.data.id, items: [{ serviceId: serviceRes.body.data.id, quantity: 1, unitPrice: 100 }] });

    const before = Number((await getDashboardSummary()).periods.today.paid);

    await agent.post("/api/payments").send({ orderId: orderRes.body.data.id, amount: 100, paymentMethod: "bank_transfer", pendingReview: true });
    const withPending = Number((await getDashboardSummary()).periods.today.paid);
    assert.equal(withPending, before, "a pending-review payment must not count as paid yet");

    const paymentsRes = await agent.get(`/api/payments?orderId=${orderRes.body.data.id}`);
    await agent.post(`/api/payments/${paymentsRes.body.data[0].id}/confirm`);
    const afterConfirm = Number((await getDashboardSummary()).periods.today.paid);
    assert.equal(afterConfirm, before + 100, "a confirmed payment must count as paid");
  });

  test("operations exposes ageHours and stalled queue", async () => {
    const data = await getOperationsCenter();
    assert.equal(typeof data.queues.stalled, "number");
    for (const item of data.items) {
      assert.equal(typeof item.ageHours, "number");
      assert.ok(item.ageHours >= 0);
    }
  });
});
