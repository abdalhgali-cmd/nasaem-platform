import test from "node:test";
import assert from "node:assert/strict";
import { formatRequestUpdatedAt, requestListState } from "../www/js/request-list-view.js";

test("My Requests leads with the server progress and the real next action", () => {
  const state = requestListState({
    progress: { label: "بانتظار مراجعة الدفع" },
    statusLabel: "قديم",
    nextAction: "لا تحتاج إلى إجراء الآن",
    updatedAt: "2026-10-30T08:00:00.000Z",
  });
  assert.equal(state.status, "بانتظار مراجعة الدفع");
  assert.equal(state.nextAction, "لا تحتاج إلى إجراء الآن");
  assert.equal(state.updatedAt, "2026-10-30T08:00:00.000Z");
});

test("request update time is safe for missing and invalid server values", () => {
  assert.equal(formatRequestUpdatedAt(null), "");
  assert.equal(formatRequestUpdatedAt("not-a-date"), "");
  assert.match(formatRequestUpdatedAt("2026-10-30T08:00:00.000Z"), /2026|٢٠٢٦/);
});
