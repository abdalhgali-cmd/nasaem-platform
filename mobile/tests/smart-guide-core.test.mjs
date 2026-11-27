import { test } from "node:test";
import assert from "node:assert/strict";
import { GUIDE_CHOICES, guideService, guideOutcome } from "../www/js/smart-guide-core.js";

test("guide choices are restricted to approved journeys and tracking", () => {
  assert.deepEqual(GUIDE_CHOICES.map((choice) => choice.key), ["umrah", "egypt", "tracking"]);
});
test("only actual catalog entries can be selected", () => {
  const catalog = { services: [{ id: "u", code: "SVC-UMRAH" }, { id: "f", code: "SVC-FLIGHT" }, { id: "e", code: "SVC-EGYPT-SECURITY-APPROVAL" }], visaTypes: [] };
  assert.equal(guideService(catalog, "umrah").id, "u");
  assert.equal(guideOutcome("egypt", catalog).service.id, "e");
  assert.deepEqual(guideOutcome("tracking", catalog), { action: "track" });
  assert.deepEqual(guideOutcome("other", catalog), { action: "unknown" });
});
test("unknown or empty published catalog never fabricates a price or service", () => {
  assert.deepEqual(guideOutcome("umrah", { services: [], visaTypes: [] }), { action: "unavailable" });
  assert.deepEqual(guideOutcome("egypt", null), { action: "unavailable" });
  assert.equal(guideService({ services: [{ code: "SVC-HOTEL" }] }, "egypt"), null);
});
