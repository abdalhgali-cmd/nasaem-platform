import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { loadBackOffice, settle } from "./helpers/backOffice.js";

const now = new Date().toISOString();
const request = (id, overrides = {}) => ({
  id,
  name: `Customer ${id}`,
  phone: "+249900000000",
  phoneNormalized: "249900000000",
  service: "عمرة",
  status: "NEW",
  paymentStatus: "UNDER_REVIEW",
  createdAt: now,
  documents: [{ id: `d-${id}`, label: "جواز", status: "PENDING" }],
  offers: [],
  deliverables: [],
  travelers: [],
  invoice: { amount: "500", currency: "SAR", status: "APPROVED" },
  readiness: {},
  ...overrides,
});

function baseRoutes(role, extra = {}) {
  return {
    "GET /api/auth/me": { success: true, data: { id: "me", fullName: "Staff", employeeNo: "E-1", role } },
    "GET /api/notifications": { success: true, data: [], meta: { unreadCount: 0 } },
    "GET /api/services": { success: true, data: [{ id: "s1", name: "عمرة", category: "umrah" }] },
    "GET /api/contact-requests": { success: true, data: [request("cr1"), request("cr2")], meta: { page: 1, totalPages: 1, total: 2 } },
    "GET /api/contact-requests/cr1": { success: true, data: request("cr1") },
    "GET /api/contact-requests/cr1/notes": { success: true, data: [] },
    "GET /api/contact-requests/cr1/timeline": { success: true, data: [] },
    "GET /api/orders": { success: true, data: [], meta: { page: 1, totalPages: 1, total: 0 } },
    "GET /api/flight-bookings/admin/list": { success: true, bookings: [] },
    "GET /api/dashboard/stats": { success: true, data: { orders: 0, customers: 0, payments: 0, documents: 0, offers: 0, users: 0, latestOrders: [] } },
    "GET /api/users": { success: true, data: [] },
    ...extra,
  };
}

const visibleTabs = (document) => [...document.querySelectorAll("#tabs [data-tab]")].filter((b) => !b.classList.contains("hidden")).map((b) => b.dataset.tab);

describe("dashboard sections per role", () => {
  test("each role sees its sections; EMPLOYEE and ACCOUNTANT reach customer requests", async () => {
    const expected = {
      SUPER_ADMIN: ["overview", "requests", "orders", "flights", "customers", "payments", "management"],
      ADMIN: ["overview", "requests", "orders", "flights", "customers", "payments", "management"],
      EMPLOYEE: ["requests", "orders", "flights", "customers"],
      ACCOUNTANT: ["requests", "orders", "flights", "customers", "payments"],
      CONTENT_MANAGER: ["management"],
    };
    for (const [role, tabs] of Object.entries(expected)) {
      const { document } = loadBackOffice("admin-dashboard.html", { routes: baseRoutes(role) });
      await settle(80);
      assert.deepEqual(visibleTabs(document), tabs, role);
      const active = document.querySelector("#tabs [aria-selected=true]");
      assert.equal(active?.dataset.tab, tabs[0], `${role} lands on its first section`);
    }
  });
});

describe("customer requests", () => {
  test("a deep link opens the request detail directly", async () => {
    const { document } = loadBackOffice("admin-dashboard.html", {
      routes: baseRoutes("EMPLOYEE"),
      url: "http://backoffice.test/admin-dashboard.html#/requests/cr1",
    });
    await settle(120);
    assert.equal(document.querySelector("#tabs [aria-selected=true]").dataset.tab, "requests");
    const detail = document.getElementById("cr-detail");
    assert.equal(detail.classList.contains("hidden"), false);
    assert.match(detail.textContent, /Customer cr1/);
  });

  test("clicking a row opens it and updates the address for sharing", async () => {
    const { window, document } = loadBackOffice("admin-dashboard.html", { routes: baseRoutes("EMPLOYEE") });
    await settle(80);
    document.querySelector('#cr-body [data-cr-id="cr1"]').click();
    await settle(80);
    assert.equal(window.location.hash, "#/requests/cr1");
  });

  test("EMPLOYEE works the request but cannot confirm payment; ACCOUNTANT can confirm but not change status", async () => {
    const employee = loadBackOffice("admin-dashboard.html", { routes: baseRoutes("EMPLOYEE"), url: "http://backoffice.test/admin-dashboard.html#/requests/cr1" });
    await settle(120);
    const ed = employee.document.getElementById("cr-detail");
    assert.ok(ed.querySelector("[data-doc-accept]"), "employee reviews documents");
    assert.ok(ed.querySelector('[data-cr-form="close"]'), "employee can close");
    assert.equal(ed.querySelector("[data-cr-confirm-payment]"), null, "employee cannot confirm payment");
    assert.equal(ed.querySelector('[data-cr-form="assign"]'), null, "employee cannot assign");

    const accountant = loadBackOffice("admin-dashboard.html", { routes: baseRoutes("ACCOUNTANT"), url: "http://backoffice.test/admin-dashboard.html#/requests/cr1" });
    await settle(120);
    const ad = accountant.document.getElementById("cr-detail");
    assert.ok(ad.querySelector("[data-cr-confirm-payment]"), "accountant confirms payment");
    assert.equal(ad.querySelector('[data-cr-form="close"]'), null);
    assert.equal(ad.querySelector("[data-doc-accept]"), null);
  });

  test("a slow detail response never overwrites the request opened after it", async () => {
    const routes = baseRoutes("EMPLOYEE", {
      "GET /api/contact-requests/cr1": async () => {
        await new Promise((r) => setTimeout(r, 150));
        return { status: 200, body: { success: true, data: request("cr1") } };
      },
      "GET /api/contact-requests/cr2": { success: true, data: request("cr2") },
      "GET /api/contact-requests/cr2/notes": { success: true, data: [] },
      "GET /api/contact-requests/cr2/timeline": { success: true, data: [] },
    });
    const { document } = loadBackOffice("admin-dashboard.html", { routes });
    await settle(80);
    document.querySelector('#cr-body [data-cr-id="cr1"]').click();
    await settle(10);
    document.querySelector('#cr-body [data-cr-id="cr2"]').click();
    await settle(300);
    const text = document.getElementById("cr-detail").textContent;
    assert.match(text, /Customer cr2/);
    assert.doesNotMatch(text, /Customer cr1/);
  });

  test("search and filters reach the API", async () => {
    const { window, document, calls } = loadBackOffice("admin-dashboard.html", { routes: baseRoutes("EMPLOYEE") });
    await settle(80);
    const search = document.getElementById("cr-search");
    search.value = "0912";
    search.dispatchEvent(new window.Event("input"));
    const status = document.getElementById("cr-filter-payment");
    status.value = "UNDER_REVIEW";
    status.dispatchEvent(new window.Event("change"));
    await settle(450);
    const last = calls.filter((c) => c.path === "/api/contact-requests").pop();
    const params = new URLSearchParams(last.search);
    assert.equal(params.get("search"), "0912");
    assert.equal(params.get("paymentStatus"), "UNDER_REVIEW");
  });
});

describe("flight bookings and orders", () => {
  test("a flight deep link opens the booking; an order deep link opens the order", async () => {
    const booking = { id: "fb1", booking_number: "FLT-1", status: "PAYMENT_UNDER_REVIEW", amount: "100", currency: "SDG", customer_name: "Flight Customer", passengers: [], created_at: now };
    const flight = loadBackOffice("admin-dashboard.html", {
      routes: baseRoutes("ACCOUNTANT", { "GET /api/flight-bookings/fb1": { success: true, booking } }),
      url: "http://backoffice.test/admin-dashboard.html#/flights/fb1",
    });
    await settle(120);
    const fd = flight.document.getElementById("flight-booking-detail");
    assert.match(fd.textContent, /FLT-1/);
    assert.ok(fd.querySelector('[data-flight-action="confirm-payment"]'), "accountant confirms the transfer");
    assert.equal(fd.querySelector('[data-flight-action="final"]'), null);

    const order = { id: "o1", orderNumber: "ORD-9", status: "NEW", paymentStatus: "UNPAID", totalAmount: "1", currency: "SAR", items: [], payments: [], history: [], createdAt: now, customer: { fullName: "Order Customer" } };
    const ord = loadBackOffice("admin-dashboard.html", {
      routes: baseRoutes("EMPLOYEE", { "GET /api/orders/o1": { success: true, data: order } }),
      url: "http://backoffice.test/admin-dashboard.html#/orders/o1",
    });
    await settle(120);
    assert.match(ord.document.getElementById("order-detail-card").textContent, /ORD-9/);
  });

  test("a section the role cannot use is refused with a message, not a blank page", async () => {
    const { document } = loadBackOffice("admin-dashboard.html", { routes: baseRoutes("EMPLOYEE"), url: "http://backoffice.test/admin-dashboard.html#/payments" });
    await settle(100);
    assert.match(document.getElementById("page-alert").textContent, /غير متاح/);
    assert.equal(document.querySelector("#tabs [aria-selected=true]").dataset.tab, "requests");
  });
});
