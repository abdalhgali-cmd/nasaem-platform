import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogDisplayMode } from "../www/js/catalog-display-policy.js";

test("home hides booking prices when only a stale catalog exists", () => {
  assert.equal(catalogDisplayMode({ stale: true, services: [{ basePrice: "796" }] }), "REFRESH_REQUIRED");
  assert.equal(catalogDisplayMode(null), "REFRESH_REQUIRED");
});
test("a current server catalog can be displayed", () => {
  assert.equal(catalogDisplayMode({ stale: false, services: [] }), "CURRENT");
  assert.equal(catalogDisplayMode({ services: [] }), "CURRENT");
});
