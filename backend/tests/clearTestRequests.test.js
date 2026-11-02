import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import prisma from "../src/config/database.js";
import { UPLOAD_ROOT } from "../src/config/uploadRoot.js";
import { clearTestRequests, collectCounts, databaseLabel, deleteOrphanedFiles } from "../src/scripts/clear-test-requests.js";
import { createStaffUser } from "./helpers/staff.js";

// Runs on the disposable test database. Builds one of each kind of request
// record, then clears them: requests and their own rows go, refund evidence,
// staff, customers, catalog and the audit log stay, and only the files the
// deleted rows referenced are removed.
async function writeUpload(rel) {
  const absolute = path.join(UPLOAD_ROOT, rel);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, "test");
  return rel;
}

async function exists(rel) {
  return fs.access(path.join(UPLOAD_ROOT, rel)).then(() => true, () => false);
}

test("clear-test-requests: deletes requests and their records, keeps refund evidence and everything else", async () => {
  const tag = randomUUID().slice(0, 8);
  const staff = await createStaffUser({ role: "ADMIN" });
  const customer = await prisma.customer.create({ data: { customerNo: `CT-${tag}`, fullName: "عميل اختبار" } });
  const servicesBefore = await prisma.service.count();

  // A request with a traveler, a document and its file.
  const requestFile = await writeUpload(`contact-request-documents/clear-${tag}.pdf`);
  const request = await prisma.contactRequest.create({ data: { name: "طلب اختبار", phone: "0912345678", message: "test", customerId: customer.id } });
  await prisma.contactRequestDocument.create({ data: { contactRequestId: request.id, label: "جواز", fileName: "p.pdf", storagePath: requestFile, mimeType: "application/pdf", sizeBytes: 4 } });
  await prisma.notification.create({ data: { title: "t", message: "m", type: "SYSTEM", contactRequestId: request.id, userId: staff.id } }).catch(() => null);
  // An unsent draft.
  await prisma.intakeDraft.create({ data: { token: `draft-${tag}`, expiresAt: new Date(Date.now() + 86_400_000) } });
  // A legacy order with a payment (deleted) …
  const order = await prisma.order.create({ data: { orderNumber: `ORD-${tag}`, customerId: customer.id, totalAmount: 100 } });
  await prisma.payment.create({ data: { orderId: order.id, amount: 100, paymentMethod: "BANK_TRANSFER" } });
  // … and an order with a refund (kept: refund evidence).
  const refunded = await prisma.order.create({ data: { orderNumber: `ORD-R-${tag}`, customerId: customer.id, totalAmount: 50 } });
  const paid = await prisma.payment.create({ data: { orderId: refunded.id, amount: 50, paymentMethod: "BANK_TRANSFER", status: "PAID" } });
  await prisma.payment.create({ data: { orderId: refunded.id, amount: 50, paymentMethod: "BANK_TRANSFER", kind: "REFUND", refundOfPaymentId: paid.id } });
  // A file nobody references must never be touched.
  const unrelated = await writeUpload(`site-assets/unrelated-${tag}.png`);

  const before = await collectCounts();
  assert.ok(before.contactRequests >= 1 && before.intakeDrafts >= 1 && before.orders >= 2);

  const result = await clearTestRequests();
  assert.equal(result.after.contactRequests, 0);
  assert.equal(result.after.contactRequestDocuments, 0);
  assert.equal(result.after.travelers, 0);
  assert.equal(result.after.intakeDrafts, 0);
  assert.equal(await prisma.order.count({ where: { id: order.id } }), 0);
  assert.equal(await prisma.order.count({ where: { id: refunded.id } }), 1, "refund evidence is kept");
  assert.equal(await prisma.payment.count({ where: { orderId: refunded.id } }), 2);
  assert.ok(result.after.ordersProtectedRefundEvidence >= 1, "orders with refunds are reported as kept");
  // Kept.
  assert.equal(await prisma.user.count({ where: { id: staff.id } }), 1);
  assert.equal(await prisma.customer.count({ where: { id: customer.id } }), 1);
  assert.equal(await prisma.service.count(), servicesBefore);
  assert.equal(result.after.keptActivityLog, before.keptActivityLog, "existing audit rows are kept");
  const audit = await prisma.activityLog.findFirst({ where: { action: "TEST_REQUESTS_CLEARED" }, orderBy: { createdAt: "desc" } });
  assert.ok(audit, "the cleanup itself is audited");
  assert.doesNotMatch(JSON.stringify(audit.newValue), /0912345678|طلب اختبار/, "no customer data in the audit row");

  // Files: only the deleted request's file goes.
  assert.ok(result.files.includes(requestFile));
  const files = await deleteOrphanedFiles(result.files);
  assert.equal(await exists(requestFile), false);
  assert.equal(await exists(unrelated), true);
  assert.equal(files.refused, 0);

  // Idempotent.
  const again = await clearTestRequests();
  assert.deepEqual(again.deleted, { requestNotifications: 0, contactRequests: 0, intakeDrafts: 0, flightBookings: 0, orders: 0 });

  await fs.rm(path.join(UPLOAD_ROOT, unrelated), { force: true });
});

test("clear-test-requests: a stored path outside UPLOAD_ROOT is never deleted", async () => {
  const outside = path.join(path.dirname(UPLOAD_ROOT), `outside-${randomUUID().slice(0, 8)}.txt`);
  await fs.writeFile(outside, "keep");
  const result = await deleteOrphanedFiles(["../" + path.basename(outside)]);
  assert.equal(result.deleted, 0);
  assert.equal(await fs.access(outside).then(() => true, () => false), true);
  await fs.rm(outside, { force: true });
});

test("clear-test-requests: the target label never contains credentials", () => {
  assert.equal(databaseLabel({ DATABASE_URL: "postgresql://user:s3cret@db.internal:5432/railway" }), "db.internal/railway");
  assert.equal(databaseLabel({ DATABASE_URL: "" }), null);
});
