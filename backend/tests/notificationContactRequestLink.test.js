import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { registerCustomer, uniqueSuffix } from "./helpers/api.js";

// The mobile app's notification tap needs a real id to deep-link to —
// otherwise every notification about a request's progress just reopens
// the notification list. See prisma/schema.prisma's Notification.contactRequestId.
describe("customer notifications link back to the ContactRequest they're about", () => {
  test("submitting a request as a logged-in customer creates a notification carrying that request's id", async () => {
    const { agent } = await registerCustomer({ fullName: `Notif Link Customer ${uniqueSuffix()}` });

    const submitRes = await agent.post("/api/contact-requests").send({
      name: "Notif Link Tester",
      phone: `24997${uniqueSuffix()}`,
      message: "طلب تجريبي للتحقق من ربط الإشعار بالطلب",
    });
    assert.equal(submitRes.status, 201, JSON.stringify(submitRes.body));
    const requestId = submitRes.body.data.id;

    const notifRes = await agent.get("/api/customer/notifications?limit=10");
    assert.equal(notifRes.status, 200, JSON.stringify(notifRes.body));
    const notification = notifRes.body.data.find((n) => n.type === "CONTACT_REQUEST_RECEIVED");
    assert.ok(notification, "expected a CONTACT_REQUEST_RECEIVED notification");
    assert.equal(notification.contactRequestId, requestId);
  });
});
