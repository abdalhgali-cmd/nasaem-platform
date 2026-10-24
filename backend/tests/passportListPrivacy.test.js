// Owner rule (2026-10-24): passport numbers never appear in full in any
// staff list response; they are shown in full only inside a record's own
// details to authorised staff. One synthetic passport number is placed on
// a customer, an order, a payment, a document and a request traveler, and
// every list endpoint is checked for it. Synthetic data only.
import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";

import prisma from "../src/config/database.js";
import { uniqueSuffix } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";

let admin;
let passportNo;
let ids;

before(async () => {
  const user = await createStaffUser({ role: "ADMIN" });
  admin = staffClient(user);
  passportNo = `PRIV${uniqueSuffix()}`;
  const organizationId = user.organizationId;
  const customer = await prisma.customer.create({ data: { organizationId, customerNo: `PRIV-${uniqueSuffix()}`, fullName: "Privacy Customer", passportNo, nationality: "SD" } });
  // Dated first so it is inside every "oldest/newest N" list.
  const order = await prisma.order.create({ data: { organizationId, orderNumber: `ORD-PRIV-${uniqueSuffix()}`, customerId: customer.id, status: "NEW", totalAmount: 100, currency: "SDG", createdAt: new Date(Date.now() + 60_000), updatedAt: new Date("2000-01-01T00:00:00Z") } });
  const payment = await prisma.payment.create({ data: { orderId: order.id, amount: 50, currency: "SDG", paymentMethod: "BANK_TRANSFER" } });
  await prisma.document.create({ data: { orderId: order.id, customerId: customer.id, uploadedById: user.id, type: "PASSPORT", fileName: "p.pdf", storagePath: "documents/p.pdf", createdAt: new Date(Date.now() + 60_000) } });
  const request = await prisma.contactRequest.create({
    data: { organizationId, name: "عميل الخصوصية", phone: "0912000001", message: "طلب اختبار الخصوصية", createdAt: new Date(Date.now() + 60_000), travelers: { create: [{ fullName: "مسافر", passportNo, sortOrder: 0 }] } },
  });
  ids = { customer: customer.id, order: order.id, payment: payment.id, request: request.id };
});

describe("passport numbers in API list responses", () => {
  test("no staff list carries the full number", async () => {
    const lists = [
      "/api/customers",
      "/api/orders",
      "/api/payments",
      "/api/documents",
      "/api/contact-requests?limit=50",
      "/api/dashboard/stats",
      "/api/dashboard/operations",
      "/api/flight-bookings/admin/list",
    ];
    for (const path of lists) {
      const res = await admin.get(path);
      assert.equal(res.status, 200, `${path}: ${res.status}`);
      assert.ok(!JSON.stringify(res.body).includes(passportNo), `${path} exposes the full passport number`);
    }
    // ...while the records are really in the lists (masked), not just missing.
    const requests = await admin.get("/api/contact-requests?limit=50");
    const row = requests.body.data.find((r) => r.id === ids.request);
    assert.ok(row, "the request is in the list");
    assert.equal(row.travelers[0].passportNo, `•••${passportNo.slice(-3)}`);
  });

  test("each record's own details show the full number to staff", async () => {
    for (const path of [`/api/customers/${ids.customer}`, `/api/orders/${ids.order}`, `/api/payments/${ids.payment}`, `/api/contact-requests/${ids.request}`]) {
      const res = await admin.get(path);
      assert.equal(res.status, 200, path);
      assert.ok(JSON.stringify(res.body).includes(passportNo), `${path} shows it in full`);
    }
  });
});
