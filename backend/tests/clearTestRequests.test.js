import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import prisma from "../src/config/database.js";
import { UPLOAD_ROOT } from "../src/config/uploadRoot.js";
import { cleanupScope, clearTestRequests, collectCounts, databaseLabel, deleteOrphanedFiles, targetRequests } from "../src/scripts/clear-test-requests.js";
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
  // Financial evidence, kept whole: a request whose payment was confirmed
  // (with its document and file) and one with an issued payment receipt.
  const confirmedFile = await writeUpload(`contact-request-documents/confirmed-${tag}.pdf`);
  const confirmed = await prisma.contactRequest.create({ data: { name: "طلب مدفوع", phone: "0912345679", message: "paid", paymentStatus: "CONFIRMED" } });
  const confirmedDoc = await prisma.contactRequestDocument.create({ data: { contactRequestId: confirmed.id, label: "إيصال", fileName: "r.pdf", storagePath: confirmedFile, mimeType: "application/pdf", sizeBytes: 4 } });
  const receipted = await prisma.contactRequest.create({ data: { name: "طلب بإيصال", phone: "0912345670", message: "receipt" } });
  await prisma.paymentReceipt.create({ data: { contactRequestId: receipted.id, receiptNo: `RC-${tag}`, amount: 10, currency: "SAR", customerName: "x", serviceName: "x", paidAt: new Date() } });
  // An unsent draft.
  await prisma.intakeDraft.create({ data: { token: `draft-${tag}`, expiresAt: new Date(Date.now() + 86_400_000) } });
  // A legacy order with a payment (deleted) …
  const order = await prisma.order.create({ data: { orderNumber: `ORD-${tag}`, customerId: customer.id, totalAmount: 100 } });
  await prisma.payment.create({ data: { orderId: order.id, amount: 100, paymentMethod: "BANK_TRANSFER" } });
  // … an order with money received (kept) …
  const received = await prisma.order.create({ data: { orderNumber: `ORD-P-${tag}`, customerId: customer.id, totalAmount: 70 } });
  await prisma.payment.create({ data: { orderId: received.id, amount: 70, paymentMethod: "BANK_TRANSFER", status: "PAID" } });
  // … and an order with a refund (kept: refund evidence).
  const refunded = await prisma.order.create({ data: { orderNumber: `ORD-R-${tag}`, customerId: customer.id, totalAmount: 50 } });
  const paid = await prisma.payment.create({ data: { orderId: refunded.id, amount: 50, paymentMethod: "BANK_TRANSFER", status: "PAID" } });
  await prisma.payment.create({ data: { orderId: refunded.id, amount: 50, paymentMethod: "BANK_TRANSFER", kind: "REFUND", refundOfPaymentId: paid.id } });
  // A file nobody references must never be touched.
  const unrelated = await writeUpload(`site-assets/unrelated-${tag}.png`);

  const before = await collectCounts();
  assert.ok(before.contactRequests >= 3 && before.intakeDrafts >= 1 && before.orders >= 3);
  // The dry-run list names the test request, never the protected ones, and no personal data.
  const targets = await targetRequests();
  assert.ok(targets.some((t) => t.id === request.id));
  assert.ok(!targets.some((t) => t.id === confirmed.id || t.id === receipted.id));
  assert.doesNotMatch(JSON.stringify(targets), /0912345678|طلب اختبار/);

  const result = await clearTestRequests();
  assert.equal(result.after.contactRequestsToDelete, 0);
  assert.equal(result.after.contactRequests, result.after.contactRequestsKept, "only financial evidence remains");
  assert.equal(await prisma.contactRequest.count({ where: { id: request.id } }), 0);
  assert.equal(await prisma.contactRequest.count({ where: { id: { in: [confirmed.id, receipted.id] } } }), 2, "financial evidence is kept");
  assert.equal(await prisma.contactRequestDocument.count({ where: { id: confirmedDoc.id } }), 1);
  assert.equal(await prisma.paymentReceipt.count({ where: { contactRequestId: receipted.id } }), 1);
  assert.equal(result.after.intakeDrafts, 0);
  assert.equal(await prisma.order.count({ where: { id: order.id } }), 0);
  assert.equal(await prisma.order.count({ where: { id: refunded.id } }), 1, "refund evidence is kept");
  assert.equal(await prisma.payment.count({ where: { orderId: refunded.id } }), 2);
  assert.equal(await prisma.order.count({ where: { id: received.id } }), 1, "money received is kept");
  assert.ok(result.after.ordersFinancial >= 2, "orders with financial evidence are reported as kept");
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
  assert.ok(!result.files.includes(confirmedFile), "a kept request's file is never a deletion candidate");
  const files = await deleteOrphanedFiles(result.files);
  assert.equal(await exists(requestFile), false);
  assert.equal(await exists(unrelated), true);
  assert.equal(await exists(confirmedFile), true);
  // (A shared database may hold a path outside UPLOAD_ROOT from another test:
  // that one is refused, never deleted — covered by the next test.)
  assert.ok(files.deleted >= 1, "the deleted request's file is removed");

  // Idempotent.
  const again = await clearTestRequests();
  assert.deepEqual(again.deleted, { requestNotifications: 0, contactRequests: 0, intakeDrafts: 0, flightBookings: 0, orders: 0 });

  await fs.rm(path.join(UPLOAD_ROOT, unrelated), { force: true });
  await fs.rm(path.join(UPLOAD_ROOT, confirmedFile), { force: true });
});

test("clear-test-requests --include-financial-test-data: paid and receipted test requests go too, only before the cutoff, only with the exact count", async () => {
  const tag = randomUUID().slice(0, 8);
  const receiptFile = await writeUpload(`payment-receipts/fin-${tag}.pdf`);
  const paid = await prisma.contactRequest.create({ data: { name: "مدفوع تجريبي", phone: "0912000001", message: "paid", paymentStatus: "CONFIRMED" } });
  await prisma.paymentReceipt.create({ data: { contactRequestId: paid.id, receiptNo: `RF-${tag}`, amount: 10, currency: "SAR", customerName: "x", serviceName: "x", paidAt: new Date(), storagePath: receiptFile } });
  const plain = await prisma.contactRequest.create({ data: { name: "عادي", phone: "0912000002", message: "plain" } });
  await new Promise((r) => setTimeout(r, 20));
  const cutoff = new Date().toISOString();
  await new Promise((r) => setTimeout(r, 20));
  // made after the owner's confirmation: never touched
  const later = await prisma.contactRequest.create({ data: { name: "بعد التأكيد", phone: "0912000003", message: "later", paymentStatus: "CONFIRMED" } });
  const auditBefore = await prisma.activityLog.count();

  const scope = cleanupScope({ includeFinancial: true, before: cutoff });
  assert.throws(() => cleanupScope({ before: "not-a-date" }), /valid date/);
  assert.throws(() => cleanupScope({ before: "2026-01-01'; DROP TABLE x;--" }), /valid date/);
  const listed = await targetRequests(prisma, scope);
  assert.ok(listed.some((t) => t.id === paid.id && t.financial));
  assert.ok(listed.some((t) => t.id === plain.id && !t.financial));
  assert.ok(!listed.some((t) => t.id === later.id), "after the cutoff: not a target");
  const financial = listed.filter((t) => t.financial).length;

  // a wrong confirmation rolls everything back
  await assert.rejects(() => clearTestRequests(prisma, scope, { expectedFinancial: financial + 1 }), /not the confirmed/);
  await assert.rejects(() => clearTestRequests(prisma, scope), /not the confirmed/, "no confirmation, no deletion");
  assert.equal(await prisma.contactRequest.count({ where: { id: { in: [paid.id, plain.id] } } }), 2, "nothing deleted on refusal");

  const result = await clearTestRequests(prisma, scope, { expectedFinancial: financial });
  assert.equal(await prisma.contactRequest.count({ where: { id: { in: [paid.id, plain.id] } } }), 0);
  assert.equal(await prisma.paymentReceipt.count({ where: { contactRequestId: paid.id } }), 0, "its receipt goes with it");
  assert.equal(await prisma.contactRequest.count({ where: { id: later.id } }), 1, "a request made after the cutoff is kept");
  assert.equal(result.after.contactRequestsToDelete, 0);
  assert.ok(result.files.includes(receiptFile), "the receipt's file is a deletion candidate");
  assert.equal(await prisma.activityLog.count(), auditBefore + 1, "the audit log is kept, plus one documenting row");
  const audit = await prisma.activityLog.findFirst({ where: { action: "TEST_REQUESTS_CLEARED" }, orderBy: { createdAt: "desc" } });
  assert.equal(audit.newValue.includeFinancial, true);
  assert.equal(audit.newValue.createdBefore, new Date(cutoff).toISOString());
  await deleteOrphanedFiles(result.files);
  assert.equal(await exists(receiptFile), false);

  // idempotent
  const again = await clearTestRequests(prisma, scope, { expectedFinancial: 0 });
  assert.equal(again.deleted.contactRequests, 0);
  await prisma.contactRequest.delete({ where: { id: later.id } });
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
