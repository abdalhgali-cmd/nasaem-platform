import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { loginAsSuperAdmin } from "./helpers/api.js";

describe("pagination", () => {
  test("services list respects limit and returns pagination meta", async () => {
    const agent = await loginAsSuperAdmin();
    const res = await agent.get("/api/services?page=1&limit=2");

    assert.equal(res.status, 200);
    assert.ok(res.body.data.length <= 2);
    assert.equal(res.body.meta.limit, 2);
    assert.equal(res.body.meta.page, 1);
    assert.equal(typeof res.body.meta.total, "number");
    assert.equal(typeof res.body.meta.totalPages, "number");
  });

  test("limit is capped rather than allowing an unbounded page size", async () => {
    const agent = await loginAsSuperAdmin();
    const res = await agent.get("/api/services?limit=100000");

    assert.equal(res.status, 200);
    assert.ok(res.body.meta.limit <= 100);
  });
});
