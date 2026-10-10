import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import prisma from "../src/config/database.js";
import { uniqueSuffix } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";

async function newRequest(overrides = {}) {
  const suffix = uniqueSuffix();
  return prisma.contactRequest.create({
    data: { name: `Synthetic ${suffix}`, phone: `2499${suffix.slice(-8)}`, phoneNormalized: `2499${suffix.slice(-8)}`, message: "synthetic", ...overrides },
  });
}

async function pricedRequest({ paymentStatus = "AWAITING_TRANSFER", withDeliverable = false, creator }) {
  const request = await newRequest({ paymentStatus });
  await prisma.invoice.create({ data: { contactRequestId: request.id, amount: "500.00", currency: "SAR", status: "APPROVED", createdByUserId: creator.id } });
  if (withDeliverable) {
    await prisma.contactRequestDeliverable.create({
      data: { contactRequestId: request.id, label: "visa", fileName: "visa.pdf", storagePath: "contact-request-deliverables/x.pdf", mimeType: "application/pdf", sizeBytes: 10, uploadedByUserId: creator.id },
    });
  }
  return request;
}

const setStatus = (client, id, body) => client.patch(`/api/contact-requests/${id}/status`).send(body);

describe("contact request state transitions", () => {
  test("a priced request cannot be completed before payment is confirmed and a file is delivered", async () => {
    const employee = await createStaffUser({ role: "EMPLOYEE" });
    const client = staffClient(employee);

    const unpaid = await pricedRequest({ creator: employee });
    const r1 = await setStatus(client, unpaid.id, { status: "CLOSED", outcome: "COMPLETED" });
    assert.equal(r1.status, 409);
    assert.equal(r1.body.code, "COMPLETION_NEEDS_PAYMENT");

    const paidNoFile = await pricedRequest({ creator: employee, paymentStatus: "CONFIRMED" });
    const r2 = await setStatus(client, paidNoFile.id, { status: "CLOSED", outcome: "COMPLETED" });
    assert.equal(r2.status, 409);
    assert.equal(r2.body.code, "COMPLETION_NEEDS_DELIVERABLE");

    const done = await pricedRequest({ creator: employee, paymentStatus: "CONFIRMED", withDeliverable: true });
    assert.equal((await setStatus(client, done.id, { status: "CLOSED", outcome: "COMPLETED" })).status, 200);
  });

  test("an unpaid request can be cancelled or rejected without any payment", async () => {
    const employee = await createStaffUser({ role: "EMPLOYEE" });
    const client = staffClient(employee);
    const cancelled = await pricedRequest({ creator: employee });
    const res = await setStatus(client, cancelled.id, { status: "CLOSED", outcome: "CANCELLED" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.outcome, "CANCELLED");
    const rejected = await newRequest();
    assert.equal((await setStatus(client, rejected.id, { status: "CLOSED", outcome: "REJECTED", outcomeNote: "غير مؤهل" })).status, 200);
  });

  test("cancelling after a confirmed payment requires a note on how the money is handled", async () => {
    const admin = await createStaffUser({ role: "ADMIN" });
    const client = staffClient(admin);
    const request = await pricedRequest({ creator: admin, paymentStatus: "CONFIRMED" });
    const noNote = await setStatus(client, request.id, { status: "CLOSED", outcome: "CANCELLED" });
    assert.equal(noNote.status, 400);
    assert.equal(noNote.body.code, "REFUND_NOTE_REQUIRED");
    assert.equal((await setStatus(client, request.id, { status: "CLOSED", outcome: "CANCELLED", outcomeNote: "سيُعاد المبلغ بتحويل بنكي" })).status, 200);
  });

  test("no backward step without re-opening; re-opening needs an admin and a reason, and is audited", async () => {
    const employee = await createStaffUser({ role: "EMPLOYEE" });
    const admin = await createStaffUser({ role: "ADMIN" });
    const request = await newRequest();
    assert.equal((await setStatus(staffClient(employee), request.id, { status: "CONTACTED" })).status, 200);
    const backward = await setStatus(staffClient(employee), request.id, { status: "NEW" });
    assert.equal(backward.status, 409);
    assert.equal(backward.body.code, "INVALID_TRANSITION");

    assert.equal((await setStatus(staffClient(employee), request.id, { status: "CLOSED", outcome: "REJECTED" })).status, 200);
    const employeeReopen = await setStatus(staffClient(employee), request.id, { status: "CONTACTED", reason: "خطأ في الإغلاق" });
    assert.equal(employeeReopen.status, 403);

    const reopen = await setStatus(staffClient(admin), request.id, { status: "CONTACTED", reason: "أُغلق بالخطأ" });
    assert.equal(reopen.status, 200);
    assert.equal(reopen.body.data.outcome, null);

    let log = null;
    // logActivity is fire-and-forget: allow a slow CI database up to 5 s.
    for (let i = 0; i < 100 && !log; i += 1) {
      log = await prisma.activityLog.findFirst({ where: { entityId: request.id, action: "CONTACT_REQUEST_REOPENED" } });
      if (!log) await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(log, "re-open is audited");
    assert.equal(log.userId, admin.id);
    assert.equal(log.newValue.reason, "أُغلق بالخطأ");
    assert.equal(log.oldValue.outcome, "REJECTED");
  });
});
