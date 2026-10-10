import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

import { listPublicFiles, loadBackOffice, publicFile, settle } from "./helpers/backOffice.js";

const HOSTILE = '<img src=x onerror="window.__pwned=1"><b id="injected">bold</b>';

describe("back-office pages are compatible with the CSP", () => {
  test("no page has inline scripts or inline event handler attributes", () => {
    for (const page of listPublicFiles(".html")) {
      const html = publicFile(page);
      for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        assert.match(match[1], /\bsrc=/, `${page}: inline <script> is blocked by script-src 'self'`);
        assert.equal(match[2].trim(), "", `${page}: <script src> must not also carry inline code`);
      }
      assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${page}: inline event handlers are blocked by script-src-attr 'none'`);
    }
  });

  test("every back-office script parses and generates no inline handlers", () => {
    for (const file of listPublicFiles(".js")) {
      const source = publicFile(file);
      assert.doesNotThrow(() => new vm.Script(source, { filename: file }), `${file} has a syntax error`);
      assert.doesNotMatch(source, /<[^>]*\son(click|submit|change|input|load|error)\s*=/i, `${file} builds markup with an inline handler`);
    }
  });

  test("every script a page references exists", () => {
    const available = new Set(listPublicFiles(".js"));
    for (const page of listPublicFiles(".html")) {
      for (const match of publicFile(page).matchAll(/<script src="\/([^"]+)"/g)) {
        assert.ok(available.has(match[1]), `${page} references missing ${match[1]}`);
      }
    }
  });
});

describe("untrusted values render as text in the dashboard", () => {
  const adminUser = { id: "u1", fullName: HOSTILE, employeeNo: "E-1", role: "ADMIN" };
  const order = {
    id: "o1",
    orderNumber: "ORD-1",
    status: "NEW",
    paymentStatus: "UNPAID",
    totalAmount: "100",
    currency: "USD",
    createdAt: new Date().toISOString(),
    customer: { fullName: HOSTILE, customerNo: HOSTILE },
  };
  const routes = {
    "GET /api/auth/me": { success: true, data: adminUser },
    "GET /api/notifications": { success: true, data: [{ id: "n1", title: HOSTILE, message: HOSTILE, createdAt: new Date().toISOString() }], meta: { unreadCount: 1 } },
    "GET /api/dashboard/stats": { success: true, data: { orders: 1, customers: 1, payments: 1, documents: 0, offers: 0, users: 1, latestOrders: [order] } },
    "GET /api/orders": { success: true, data: [order], meta: { page: 1, totalPages: 1, total: 1 } },
    "GET /api/orders/o1": {
      success: true,
      data: {
        ...order,
        items: [{ service: { name: HOSTILE }, quantity: 1, unitPrice: "100", total: "100" }],
        payments: [{ amount: "10", currency: "USD", paymentMethod: HOSTILE, status: "PAID", createdAt: new Date().toISOString() }],
        history: [{ changedAt: new Date().toISOString(), oldStatus: "NEW", newStatus: "NEW", notes: HOSTILE }],
      },
    },
    "GET /api/customers": { success: true, data: [{ customerNo: HOSTILE, fullName: HOSTILE, passportNo: HOSTILE, nationality: HOSTILE, phone: HOSTILE }], meta: { page: 1, totalPages: 1, total: 1 } },
    "GET /api/payments": { success: true, data: [{ order: { orderNumber: HOSTILE, customer: { fullName: HOSTILE } }, amount: "1", currency: "USD", paymentMethod: HOSTILE, status: "PAID", createdAt: new Date().toISOString() }], meta: { page: 1, totalPages: 1, total: 1 } },
  };

  function assertNoInjection(window, where) {
    assert.equal(window.document.querySelectorAll("#injected").length, 0, `${where}: hostile markup created an element`);
    assert.equal(window.document.querySelectorAll('img[src="x"]').length, 0, `${where}: hostile <img> created`);
    assert.equal(window.__pwned, undefined, `${where}: hostile handler ran`);
  }

  test("overview, orders, order detail, customers, payments and the header escape server data", async () => {
    const { window, document } = loadBackOffice("admin-dashboard.html", { routes });
    await settle(60);
    assertNoInjection(window, "overview");
    assert.match(document.getElementById("app-header").textContent, /<img src=x/);

    document.querySelector('[data-tab="orders"]').click();
    await settle();
    document.querySelector("#orders-body [data-order-id]").click();
    await settle(60);
    assertNoInjection(window, "order detail");
    assert.match(document.getElementById("order-detail-card").textContent, /<b id="injected">/);

    document.querySelector('[data-tab="customers"]').click();
    await settle();
    assertNoInjection(window, "customers");

    document.querySelector('[data-tab="payments"]').click();
    await settle();
    assertNoInjection(window, "payments");

    document.getElementById("notif-btn").click();
    await settle();
    assertNoInjection(window, "notifications");
  });
});
