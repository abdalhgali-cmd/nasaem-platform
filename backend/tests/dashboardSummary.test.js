import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { getDashboardSummary, getOperationsCenter } from "../src/modules/dashboard/dashboard.service.js";

describe("dashboard summary and operations", () => {
  test("summary returns period counters without fabricating profit", async () => {
    const summary = await getDashboardSummary();
    assert.ok(summary.periods.today);
    assert.ok(summary.periods.last7Days);
    assert.ok(summary.periods.month);
    assert.equal(summary.profit, null);
    assert.match(summary.profitNote, /تكلفة المورد/);
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
