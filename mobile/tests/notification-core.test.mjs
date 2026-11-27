import { test } from "node:test";
import assert from "node:assert/strict";
import { notificationTarget, notificationTimeAgo } from "../www/js/notification-core.js";

test("notification opens exact case before general order when both are set", () => {
  assert.deepEqual(notificationTarget({ contactRequestId: "case-1", orderId: "order-2" }), {
    screen: "requestDetail", params: { requestId: "case-1" },
  });
  assert.deepEqual(notificationTarget({ orderId: "order-2" }), {
    screen: "orderDetail", params: { orderId: "order-2" },
  });
  assert.equal(notificationTarget({ message: "open /another/customer" }), null);
  assert.equal(notificationTarget(null), null);
});
test("notification time is stable for invalid or future dates", () => {
  const now = Date.parse("2026-11-27T09:00:00Z");
  assert.equal(notificationTimeAgo("bad-date", now), "");
  assert.equal(notificationTimeAgo("2026-11-27T09:05:00Z", now), "الآن");
  assert.equal(notificationTimeAgo("2026-11-27T08:45:00Z", now), "منذ 15 د");
  assert.equal(notificationTimeAgo("2026-11-26T09:00:00Z", now), "منذ 1 يوم");
});
