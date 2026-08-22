import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { loginAsSuperAdmin } from "./helpers/api.js";

describe("dashboard financial summaries", () => {
  test("SUPER_ADMIN receives sales, paid, and service-level financial aggregates", async () => {
    const agent = await loginAsSuperAdmin();
    const res = await agent.get("/api/dashboard/stats");

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data.financial);
    assert.ok(Array.isArray(res.body.data.financial.salesByCurrency));
    assert.ok(Array.isArray(res.body.data.financial.paidByCurrency));
    assert.ok(Array.isArray(res.body.data.financial.serviceSales));
  });
});
