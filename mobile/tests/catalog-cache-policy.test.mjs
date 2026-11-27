import { test } from "node:test";
import assert from "node:assert/strict";
import { recoverCatalogOnFailure } from "../www/js/catalog-cache-policy.js";

test("informational catalog fallback is explicitly stale", () => {
  const source = { services: [{ id: "s", basePrice: 100 }], visaTypes: [] };
  const result = recoverCatalogOnFailure(new Error("offline"), source);
  assert.equal(result.stale, true);
  assert.notEqual(result, source);
  assert.equal(source.stale, undefined, "the cached object is not mutated");
});

test("fresh pricing and booking checks fail closed on offline or API error", () => {
  const err = Object.assign(new Error("offline"), { status: 503 });
  assert.throws(() => recoverCatalogOnFailure(err, { services: [{ basePrice: 100 }] }, { fresh: true }), (e) => e === err);
  assert.throws(() => recoverCatalogOnFailure(err, null), (e) => e === err);
});
