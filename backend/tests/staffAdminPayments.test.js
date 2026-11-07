import "./env.js";
import { test } from "node:test";
import assert from "node:assert/strict";

import { loadBackOffice, settle } from "./helpers/backOffice.js";

const order = {
  id: "o-usd",
  orderNumber: "ORD-USD",
  status: "PROCESSING",
  paymentStatus: "PARTIAL",
  totalAmount: "1000",
  currency: "USD",
  createdAt: new Date().toISOString(),
  customer: { fullName: "Synthetic", customerNo: "C-1" },
  items: [],
  history: [],
  payments: [{ id: "p1", kind: "PAYMENT", amount: "400", currency: "USD", paymentMethod: "cash", status: "PAID", createdAt: new Date().toISOString() }],
  settlement: { currency: "USD", total: "1000.00", confirmedPaid: "400.00", refunded: "0.00", netPaid: "400.00", outstanding: "600.00", pending: "0.00", status: "PARTIAL", excludedForeignCurrency: [] },
};

function routes({ failFirstPayment = false } = {}) {
  let paymentCalls = 0;
  return {
    "GET /api/auth/me": { success: true, data: { id: "acc", fullName: "Accountant", employeeNo: "E-2", role: "ACCOUNTANT" } },
    "GET /api/notifications": { success: true, data: [], meta: { unreadCount: 0 } },
    "GET /api/orders": { success: true, data: [order], meta: { page: 1, totalPages: 1, total: 1 } },
    "GET /api/orders/o-usd": { success: true, data: order },
    "POST /api/payments": async () => {
      paymentCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 40));
      if (failFirstPayment && paymentCalls === 1) return { status: 503, body: { success: false, message: "unavailable" } };
      return { status: 201, body: { success: true, data: { id: "p2" } } };
    },
  };
}

const ORDER_URL = "http://backoffice.test/admin-dashboard.html#/orders/o-usd";

async function openOrder(window, document) {
  await settle(120);
  assert.ok(document.getElementById("payment-form"), "accountant sees the payment form");
}

test("the payment form sends the order currency and an idempotency key, once per click burst", async () => {
  const { window, document, calls } = loadBackOffice("admin-dashboard.html", { routes: routes(), url: ORDER_URL });
  await openOrder(window, document);

  assert.equal(document.getElementById("payment-currency").value, "USD");
  document.getElementById("payment-amount").value = "100";
  document.getElementById("payment-method").value = "cash";
  const form = document.getElementById("payment-form");
  form.dispatchEvent(new window.Event("submit", { cancelable: true }));
  form.dispatchEvent(new window.Event("submit", { cancelable: true }));
  form.dispatchEvent(new window.Event("submit", { cancelable: true }));
  await settle(150);

  const posts = calls.filter((c) => c.method === "POST" && c.path === "/api/payments");
  assert.equal(posts.length, 1, "button stays disabled while the request runs");
  assert.equal(posts[0].body.currency, "USD");
  assert.equal(posts[0].body.status, undefined, "no payment-row status is sent");
  assert.ok(posts[0].headers["Idempotency-Key"], "idempotency key sent");
  assert.equal(posts[0].headers["X-Requested-With"], "XMLHttpRequest");
});

test("retrying the same payment after a failure reuses the idempotency key", async () => {
  const { window, document, calls } = loadBackOffice("admin-dashboard.html", { routes: routes({ failFirstPayment: true }), url: ORDER_URL });
  await openOrder(window, document);
  document.getElementById("payment-amount").value = "100";
  document.getElementById("payment-method").value = "cash";
  const form = document.getElementById("payment-form");
  form.dispatchEvent(new window.Event("submit", { cancelable: true }));
  await settle(200);
  assert.match(document.getElementById("payment-alert").textContent, /غير متاحة مؤقتًا/, "a 503 is explained in Arabic");
  form.dispatchEvent(new window.Event("submit", { cancelable: true }));
  await settle(200);

  const posts = calls.filter((c) => c.method === "POST" && c.path === "/api/payments");
  assert.equal(posts.length, 2, "writes are never retried automatically; the second is the user's");
  assert.equal(posts[0].headers["Idempotency-Key"], posts[1].headers["Idempotency-Key"]);
});
