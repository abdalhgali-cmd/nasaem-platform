import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { loadBackOffice, settle } from "./helpers/backOffice.js";
import { allowedActions } from "../src/modules/contact-request-workflow/workflow-policy.js";

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
    // The detail carries what the server would send: the actions this role
    // may take now, from the real workflow policy.
    "GET /api/contact-requests/cr1": { success: true, data: { ...request("cr1"), allowedActions: allowedActions(request("cr1"), { audience: "staff", role }) } },
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
      SUPER_ADMIN: ["overview", "requests", "egypt", "orders", "flights", "customers", "payments", "management"],
      ADMIN: ["overview", "requests", "egypt", "orders", "flights", "customers", "payments", "management"],
      EMPLOYEE: ["requests", "egypt", "orders", "flights", "customers"],
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
  test("G-10: managers accept a decided document with a correction reason; ordinary acceptance stays available", async () => {
    for (const role of ["ADMIN", "SUPER_ADMIN", "EMPLOYEE"]) {
      const r = request("cr1", { executionStartedAt: now, documents: [{ id: "doc1", label: "جواز", status: "REJECTED" }] });
      const view = loadBackOffice("admin-dashboard.html", {
        routes: baseRoutes(role, {
          "GET /api/contact-requests/cr1": { success: true, data: { ...r, allowedActions: allowedActions(r, { audience: "staff", role }) } },
          "PATCH /api/contact-requests/cr1/documents/doc1/status": { success: true, data: {} },
        }),
        url: "http://backoffice.test/admin-dashboard.html#/requests/cr1",
      });
      await settle(120);
      const accept = view.document.querySelector('[data-doc-accept="doc1"]');
      if (role === "EMPLOYEE") {
        assert.equal(accept, null, "employees cannot correct a decided document after execution");
        continue;
      }
      assert.ok(accept, "a manager can reach correction even with no pending documents");
      const input = view.document.getElementById("reject-note-doc1");
      assert.match(input.getAttribute("aria-label"), /تصحيح/);
      const writes = () => view.calls.filter((c) => c.method === "PATCH" && c.path.endsWith("/documents/doc1/status"));
      for (const note of ["", "   ", "  نعم  "]) {
        input.value = note;
        accept.click();
        await settle(30);
        assert.equal(writes().length, 0, "short trimmed reasons never reach the API");
      }
      input.value = "  تم التحقق من صلاحية الجواز  ";
      accept.click();
      await settle(120);
      assert.deepEqual(writes()[0].body, { status: "ACCEPTED", reviewNote: "تم التحقق من صلاحية الجواز" });
    }
    const view = loadBackOffice("admin-dashboard.html", {
      routes: baseRoutes("EMPLOYEE", { "PATCH /api/contact-requests/cr1/documents/d-cr1/status": { success: true, data: {} } }),
      url: "http://backoffice.test/admin-dashboard.html#/requests/cr1",
    });
    await settle(120);
    view.document.querySelector('[data-doc-accept="d-cr1"]').click();
    await settle(120);
    assert.deepEqual(view.calls.find((c) => c.method === "PATCH" && c.path.endsWith("/documents/d-cr1/status")).body, { status: "ACCEPTED" });
  });

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

  test("confirming a declared transfer without a receipt asks for a reason (AUDIT-00 G-05)", async () => {
    const receipt = { id: "rcpt", label: "إيصال", status: "PENDING", classification: "FINANCIAL_DOCUMENT" };
    let withReceipt = false;
    const detail = () => {
      const r = request("cr1", withReceipt ? { documents: [request("cr1").documents[0], receipt] } : {});
      return { success: true, data: { ...r, allowedActions: allowedActions(r, { audience: "staff", role: "ACCOUNTANT" }) } };
    };
    let confirmReply = { status: 200, body: { success: true, data: {} } };
    const view = loadBackOffice("admin-dashboard.html", {
      routes: baseRoutes("ACCOUNTANT", { "GET /api/contact-requests/cr1": () => ({ body: detail() }), "POST /api/contact-requests/cr1/confirm-payment": () => confirmReply }),
      url: "http://backoffice.test/admin-dashboard.html#/requests/cr1",
    });
    await settle(120);
    const d = view.document.getElementById("cr-detail");
    const posts = () => view.calls.filter((c) => c.method === "POST" && c.path.endsWith("/confirm-payment"));
    const alertText = () => view.document.getElementById("cr-action-alert").textContent;

    // No receipt: the reason field is shown; blank or short reasons never reach the server.
    for (const value of ["", "   ", "تم "]) {
      d.querySelector("[data-cr-confirm-reason]").value = value;
      d.querySelector("[data-cr-confirm-payment]").click();
      await settle(40);
      assert.equal(posts().length, 0, JSON.stringify(value));
      assert.match(alertText(), /بدون إيصال/);
    }
    d.querySelector("[data-cr-confirm-reason]").value = "  تمت المطابقة مع كشف البنك  ";
    d.querySelector("[data-cr-confirm-payment]").click();
    await settle(120);
    assert.deepEqual(posts()[0].body, { reason: "تمت المطابقة مع كشف البنك" });

    // With a current receipt: no field, nothing extra sent. If the receipt was
    // rejected meanwhile, the server's refusal redraws the view with the field.
    withReceipt = true;
    view.window.location.hash = "#/requests/cr2";
    await settle(80);
    view.window.location.hash = "#/requests/cr1";
    await settle(120);
    const fresh = view.document.getElementById("cr-detail");
    assert.equal(fresh.querySelector("[data-cr-confirm-reason]"), null);
    withReceipt = false;
    confirmReply = { status: 409, body: { success: false, code: "RECEIPT_OR_REASON_REQUIRED", message: "لا يوجد إيصال تحويل لهذا الطلب. اكتب سبب تأكيد الدفع بدون إيصال." } };
    fresh.querySelector("[data-cr-confirm-payment]").click();
    await settle(160);
    assert.deepEqual(posts().at(-1).body, {});
    assert.ok(view.document.getElementById("cr-detail").querySelector("[data-cr-confirm-reason]"), "the reason field appears after the refusal");
    assert.match(alertText(), /بدون إيصال/);
  });

  test("a closed request is read-only: no review, payment, execution, file or close controls; only an admin reopen", async () => {
    const closed = request("cr1", { status: "CLOSED", outcome: "CANCELLED", invoice: { amount: "500", currency: "SAR", status: "PENDING" }, paymentStatus: "NOT_REQUIRED" });
    for (const role of ["EMPLOYEE", "ACCOUNTANT", "ADMIN"]) {
      const view = loadBackOffice("admin-dashboard.html", {
        routes: baseRoutes(role, { "GET /api/contact-requests/cr1": { success: true, data: { ...closed, allowedActions: allowedActions(closed, { audience: "staff", role }) } } }),
        url: "http://backoffice.test/admin-dashboard.html#/requests/cr1",
      });
      await settle(120);
      const detail = view.document.getElementById("cr-detail");
      for (const selector of ["[data-doc-accept]", "[data-cr-confirm-payment]", '[data-cr-form="invoice"]', '[data-cr-form="start-execution"]', '[data-cr-form="deliverable"]', '[data-cr-form="close"]']) {
        assert.equal(detail.querySelector(selector), null, `${role}: ${selector} on a closed request`);
      }
      assert.equal(Boolean(detail.querySelector('[data-cr-form="reopen"]')), role === "ADMIN", `${role}: reopen`);
    }
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

describe("keyboard and small screens", () => {
  test("arrow keys move between visible tabs (RTL: left = next) and set aria-selected", async () => {
    const { window, document } = loadBackOffice("admin-dashboard.html", { routes: baseRoutes("EMPLOYEE") });
    await settle(80);
    const first = document.querySelector('#tabs [data-tab="requests"]');
    first.focus();
    first.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    await settle(30);
    const selected = document.querySelector("#tabs [aria-selected=true]");
    assert.equal(selected.dataset.tab, "egypt");
    assert.equal(document.activeElement, selected);
    assert.equal(document.getElementById("tab-egypt").classList.contains("hidden"), false);
    selected.dispatchEvent(new window.KeyboardEvent("keydown", { key: "End", bubbles: true }));
    await settle(30);
    assert.equal(document.querySelector("#tabs [aria-selected=true]").dataset.tab, "customers", "End skips hidden tabs");
  });

  test("list cells carry their column label for the stacked phone layout", async () => {
    const { document } = loadBackOffice("admin-dashboard.html", { routes: baseRoutes("EMPLOYEE") });
    await settle(120);
    const cells = [...document.querySelectorAll("#cr-body tr:first-child td")];
    assert.deepEqual(cells.map((td) => td.dataset.label).slice(0, 3), ["المرجع", "العميل", "الخدمة"]);
  });
});

describe("errors shown to staff are Arabic", () => {
  test("an English server message becomes an Arabic explanation with field details", async () => {
    const { window, document } = loadBackOffice("admin-dashboard.html", {
      routes: baseRoutes("EMPLOYEE", {
        "PATCH /api/contact-requests/cr1/status": async () => ({ status: 400, body: { success: false, message: "Validation failed", errors: { fieldErrors: { outcome: ["يرجى تحديد نتيجة الإغلاق"] } } } }),
      }),
      url: "http://backoffice.test/admin-dashboard.html#/requests/cr1",
    });
    await settle(120);
    const form = document.querySelector('[data-cr-form="close"]');
    form.dispatchEvent(new window.Event("submit", { cancelable: true, bubbles: true }));
    await settle(80);
    const text = document.getElementById("cr-action-alert").textContent;
    assert.match(text, /البيانات المدخلة غير مكتملة أو غير صحيحة/);
    assert.match(text, /يرجى تحديد نتيجة الإغلاق/);
    assert.doesNotMatch(text, /Validation failed/);
  });
});

describe("links from the Next.js admin", () => {
  test("?customerRequest= and ?order= open the record; ?customer= opens the customer card with per-currency balances", async () => {
    const cr = loadBackOffice("admin-dashboard.html", { routes: baseRoutes("EMPLOYEE"), url: "http://backoffice.test/admin-dashboard.html?customerRequest=cr1" });
    await settle(150);
    assert.equal(cr.window.location.hash, "#/requests/cr1");
    assert.equal(cr.window.location.search, "");
    assert.match(cr.document.getElementById("cr-detail").textContent, /Customer cr1/);

    const customer = {
      id: "c1", customerNo: "C-1", fullName: "<b>Customer One</b>", phone: "+249", orders: [{ id: "o1", orderNumber: "ORD-1", status: "NEW", paymentStatus: "PARTIAL", totalAmount: "100", currency: "USD", createdAt: now }],
      summary: { orderCount: 1, activeOrders: 1, balancesByCurrency: [{ currency: "USD", paid: 40, outstanding: 60 }, { currency: "SAR", paid: 0, outstanding: 50 }] },
    };
    const cu = loadBackOffice("admin-dashboard.html", {
      routes: baseRoutes("EMPLOYEE", { "GET /api/customers": { success: true, data: [], meta: { page: 1, totalPages: 1, total: 0 } }, "GET /api/customers/c1": { success: true, data: customer } }),
      url: "http://backoffice.test/admin-dashboard.html?customer=c1",
    });
    await settle(150);
    const card = cu.document.getElementById("customer-detail-card");
    assert.equal(cu.document.querySelector("#tabs [aria-selected=true]").dataset.tab, "customers");
    assert.match(card.textContent, /<b>Customer One<\/b>/, "name rendered as text");
    assert.equal(card.querySelectorAll("b").length, 0);
    assert.match(card.textContent, /USD/);
    assert.match(card.textContent, /SAR/);
    assert.ok(card.querySelector('a[href="#/orders/o1"]'));
  });
});
