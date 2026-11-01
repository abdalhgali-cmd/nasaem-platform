import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { loadBackOffice, settle } from "./helpers/backOffice.js";

// The back-office Egypt tab (queue / travel schedule) and the Egypt workspace
// in a request's detail, run in jsdom with mocked API answers shaped like the
// server's (egypt-queue.service.js).

const row = (id, overrides = {}) => ({
  id,
  name: `عميل ${id}`,
  phone: "+249900000000",
  entryMode: "AIR",
  travelerCount: 1,
  stage: "APPROVAL_IN_PROGRESS",
  stageLabel: "جاري إصدار الموافقة",
  approvalIssued: false,
  approvalIssuedOn: null,
  circularStatus: "NOT_STARTED",
  travelDate: "2030-01-02",
  preparationMissing: [],
  flightChoice: null,
  flightInquiryId: null,
  documentsFlagged: 0,
  daysUntil: 2,
  imminent: true,
  overdue: false,
  missingDate: false,
  ...overrides,
});

const workspace = (overrides = {}) => ({
  ...row("eg1"),
  route: { entryMode: "AIR", departureCity: "بورتسودان", arrivalAirport: "القاهرة" },
  approvals: [],
  circulars: [],
  tickets: [],
  linkedInquiry: null,
  reminders: [{ id: "r1", travelDate: "2030-01-02", kind: "URGENT", status: "SENT", dueAt: new Date().toISOString(), sentAt: new Date().toISOString(), revision: 1 }],
  receipt: { receiptNo: "NR-2026-000001", pdfStatus: "READY" },
  receiptDeliveries: [{ status: "SKIPPED", recipient: "", lastError: "NO_RECIPIENT" }],
  passportQuality: [{ documentId: "d1", label: "جواز", warnings: ["GLARE"] }],
  preparationComplete: false,
  ...overrides,
});

const detail = {
  id: "eg1",
  name: "عميل eg1",
  phone: "+249900000000",
  status: "NEW",
  paymentStatus: "CONFIRMED",
  createdAt: new Date().toISOString(),
  visaType: { code: "VISA-EGYPT-CLEARANCE-AIR", name: "موافقة حربي — جوي" },
  documents: [],
  offers: [],
  deliverables: [],
  travelers: [{ id: "t1", fullName: "مسافر" }],
  allowedActions: [],
  paymentReceipt: { receiptNo: "NR-2026-000001", pdfStatus: "READY" },
  customerMessages: [{ status: "SKIPPED" }],
};

function routes(extra = {}) {
  return {
    "GET /api/auth/me": { success: true, data: { id: "me", fullName: "Staff", employeeNo: "E-1", role: "EMPLOYEE" } },
    "GET /api/notifications": { success: true, data: [], meta: { unreadCount: 0 } },
    "GET /api/services": { success: true, data: [] },
    "GET /api/contact-requests": { success: true, data: [], meta: { page: 1, totalPages: 1, total: 0 } },
    "GET /api/contact-requests/egypt/queue": {
      success: true,
      data: {
        rows: [row("eg1"), row("eg2", { travelDate: null, daysUntil: null, imminent: false, missingDate: true })],
        counts: { APPROVAL_IN_PROGRESS: 2 },
        stageLabels: { AWAITING_PAYMENT: "بانتظار الدفع", APPROVAL_IN_PROGRESS: "جاري إصدار الموافقة" },
        truncated: false,
      },
    },
    "GET /api/contact-requests/eg1": { success: true, data: detail },
    "GET /api/contact-requests/eg1/egypt": { success: true, data: workspace() },
    "GET /api/contact-requests/eg1/notes": { success: true, data: [] },
    "GET /api/contact-requests/eg1/timeline": { success: true, data: [] },
    "GET /api/orders": { success: true, data: [], meta: { page: 1, totalPages: 1, total: 0 } },
    "GET /api/flight-bookings/admin/list": { success: true, bookings: [] },
    ...extra,
  };
}

describe("back-office Egypt tab", () => {
  test("travel schedule lists rows with imminent and missing-date flags and opens the request workspace", async () => {
    const { document, calls } = loadBackOffice("admin-dashboard.html", { routes: routes(), url: "http://backoffice.test/admin-dashboard.html#/egypt" });
    await settle(120);
    const queueCall = calls.find((c) => c.path === "/api/contact-requests/egypt/queue");
    assert.ok(queueCall, "queue loaded");
    assert.match(queueCall.search, /view=schedule/);
    const rows = document.querySelectorAll("#egypt-body [data-egypt-id]");
    assert.equal(rows.length, 2);
    assert.ok(rows[0].querySelector('[data-egypt-flag="imminent"]'));
    assert.ok(rows[1].querySelector('[data-egypt-flag="missing"]'));

    rows[0].querySelector("td:nth-child(2)").click();
    await settle(120);
    const panel = document.getElementById("egypt-workspace");
    assert.ok(panel, "Egypt workspace shown in the request detail");
    assert.ok(panel.querySelector('[data-cr-form="egypt-approval"]'));
    assert.ok(panel.textContent.includes("انعكاس ضوء"), "passport quality hints shown");
    assert.ok(panel.textContent.includes("لا يوجد بريد إلكتروني للعميل"));
  });

  test("issuing the approval posts the date and file; the travel date needs a reason", async () => {
    const posted = [];
    const { window, document, calls } = loadBackOffice("admin-dashboard.html", {
      routes: routes({
        "POST /api/contact-requests/eg1/egypt/approval": ({ body }) => {
          posted.push(body);
          return { status: 201, body: { success: true, data: { id: "a1" } } };
        },
        "PATCH /api/contact-requests/eg1/egypt/travel-date": { success: true, data: {} },
      }),
      url: "http://backoffice.test/admin-dashboard.html#/requests/eg1",
    });
    await settle(150);
    const form = document.querySelector('[data-cr-form="egypt-approval"]');
    const fileInput = form.querySelector('input[type="file"]');
    Object.defineProperty(fileInput, "files", { value: [new window.File(["%PDF-1.4"], "approval.pdf", { type: "application/pdf" })] });
    form.querySelector('input[name="issuedOn"]').value = "2026-10-18";
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await settle(80);
    assert.equal(posted.length, 1);
    assert.equal(posted[0].get("issuedOn"), "2026-10-18");
    assert.ok(posted[0].get("file"));

    const dateForm = document.querySelector('[data-cr-form="egypt-travel-date"]');
    dateForm.querySelector('input[name="entryDate"]').value = "2030-02-01";
    dateForm.querySelector('input[name="reason"]').value = "طلب العميل";
    dateForm.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await settle(80);
    const patch = calls.find((c) => c.method === "PATCH" && c.path === "/api/contact-requests/eg1/egypt/travel-date");
    assert.deepEqual(patch.body, { entryDate: "2030-02-01", reason: "طلب العميل" });
  });
});
