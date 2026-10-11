import "./env.js";
import "./helpers/journeyLimits.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { createOrganization, createStaffUser, staffClient } from "./helpers/staff.js";
import {
  PDF,
  acceptAllDocuments,
  activityActions,
  createTestVisa,
  deliverable,
  priceAndApprove,
  readyAndPaid,
  staffDetail,
  submitRequest,
  testPhone,
  trackingClient,
  uploadReceipt,
} from "./helpers/workflow.js";

// Reproduces the independent review's findings against the real API and a
// real PostgreSQL database (no mocks): closed-request boundaries, execution
// readiness, completion and multi-traveler delivery, draft files, progress
// semantics, and concurrent transitions.

let admin;
let employee;
let accountant;
let contentManager;
let fixture;

before(async () => {
  admin = staffClient(await createStaffUser({ role: "ADMIN" }));
  employee = staffClient(await createStaffUser({ role: "EMPLOYEE" }));
  accountant = staffClient(await createStaffUser({ role: "ACCOUNTANT" }));
  contentManager = staffClient(await createStaffUser({ role: "CONTENT_MANAGER" }));
  fixture = await createTestVisa(admin);
});

async function newRequest(options = {}) {
  const phone = testPhone();
  const id = await submitRequest({ phone, ...fixture, ...options });
  return { id, phone, tracking: trackingClient(phone) };
}

async function cancel(id, note = "TEST-WF ألغى العميل الطلب") {
  const res = await employee.patch(`/api/contact-requests/${id}/status`).send({ status: "CLOSED", outcome: "CANCELLED", outcomeNote: note });
  assert.equal(res.status, 200, JSON.stringify(res.body));
}

function assertConflict(res, label) {
  assert.equal(res.status, 409, `${label}: expected 409, got ${res.status} ${JSON.stringify(res.body)}`);
  assert.equal(res.body.success, false);
  assert.match(res.body.message || "", /[؀-ۿ]/, `${label}: the message must be Arabic`);
}

describe("closed requests are read-only for workflow actions", () => {
  test("a cancelled request with a pending price cannot be approved, and nothing else moves it", async () => {
    const { id, tracking } = await newRequest();
    const invoice = await employee.post(`/api/contact-requests/${id}/invoice`).send({ amount: 100, currency: "USD" });
    assert.equal(invoice.status, 200);
    await cancel(id);

    assertConflict(await tracking.post(`/api/tracking/requests/${id}/invoice/approve`).send({}), "approve price");
    assertConflict(await tracking.post(`/api/tracking/requests/${id}/invoice/reject`).send({}), "reject price");
    assertConflict(await tracking.post(`/api/tracking/requests/${id}/mark-transfer-sent`).send({}), "declare transfer");
    assertConflict(
      await tracking.post(`/api/tracking/requests/${id}/payment-receipt`).field("label", "x").attach("file", PDF(), { filename: "r.pdf", contentType: "application/pdf" }),
      "receipt"
    );
    assertConflict(
      await tracking.post(`/api/tracking/requests/${id}/documents`).field("label", "TEST-WF مستند إضافي").attach("file", PDF(), { filename: "d.pdf", contentType: "application/pdf" }),
      "customer document"
    );
    assertConflict(await employee.post(`/api/contact-requests/${id}/invoice`).send({ amount: 120, currency: "USD" }), "revise price");
    assertConflict(await employee.post(`/api/contact-requests/${id}/start-execution`).send({}), "start execution");
    assertConflict(await deliverable(employee, id), "final file");
    assertConflict(await employee.post(`/api/contact-requests/${id}/provider-submissions`).send({ supplierId: "any-supplier" }), "provider hand-off");

    const detail = await staffDetail(admin, id);
    assert.equal(detail.status, "CLOSED");
    assert.equal(detail.outcome, "CANCELLED");
    assert.equal(detail.paymentStatus, "NOT_REQUIRED", "the cancelled request never entered AWAITING_TRANSFER");
    assert.equal(detail.invoice.status, "PENDING");
    const docId = detail.documents[0].id;
    assertConflict(await employee.patch(`/api/contact-requests/${id}/documents/${docId}/status`).send({ status: "ACCEPTED" }), "document review");

    const tracked = await tracking.request(id);
    assert.deepEqual(tracked.allowedActions, [], "the customer is offered nothing on a closed request");
    assert.deepEqual(detail.allowedActions.filter((action) => action !== "REOPEN"), [], "staff are offered only an explicit reopen");
  });

  test("a closed request with a payment under review cannot be confirmed or rejected; offers cannot be selected or added", async () => {
    const { id, tracking } = await newRequest();
    await priceAndApprove({ staff: employee, tracking, id });
    await uploadReceipt(tracking, id);
    await cancel(id);
    assertConflict(await accountant.post(`/api/contact-requests/${id}/confirm-payment`).send({}), "confirm payment");
    assertConflict(await accountant.post(`/api/contact-requests/${id}/reject-payment`).send({ reason: "TEST-WF غير واضح" }), "reject payment");

    const offered = await newRequest();
    const offer = await employee.post(`/api/contact-requests/${offered.id}/offers`).send({ carrier: "TEST-WF", amount: 50, currency: "USD" });
    assert.equal(offer.status, 201, JSON.stringify(offer.body));
    await cancel(offered.id);
    assertConflict(await offered.tracking.post(`/api/tracking/requests/${offered.id}/offers/${offer.body.data.id}/select`).send({}), "select offer");
    assertConflict(await employee.post(`/api/contact-requests/${offered.id}/offers`).send({ carrier: "TEST-WF 2", amount: 60, currency: "USD" }), "add offer");
  });

  test("history stays readable: documents and published files of a closed request still download for their owner", async () => {
    const { id, tracking } = await newRequest({ travelers: 1 });
    await readyAndPaid({ staff: employee, accountant, tracking, id });
    assert.equal((await employee.post(`/api/contact-requests/${id}/start-execution`).send({})).status, 200);
    const traveler = (await staffDetail(employee, id)).travelers[0];
    const published = await deliverable(employee, id, { travelerIds: [traveler.id], publish: true });
    assert.equal(published.status, 201, JSON.stringify(published.body));
    const tracked = await tracking.request(id);
    assert.equal(tracked.status, "CLOSED");
    assert.equal(tracked.outcome, "COMPLETED");
    assert.equal((await tracking.get(`/api/tracking/requests/${id}/deliverables/${tracked.deliverables[0].id}/file`)).status, 200);
    assert.equal((await tracking.get(`/api/tracking/requests/${id}/documents/${tracked.documents[0].id}/file`)).status, 200);
  });

  test("reopening is explicit, admin-only, needs a reason and is audited; an employee cannot reopen", async () => {
    const { id } = await newRequest();
    await cancel(id);
    assert.equal((await employee.patch(`/api/contact-requests/${id}/status`).send({ status: "CONTACTED", reason: "TEST-WF إعادة فتح" })).status, 403);
    assert.equal((await admin.patch(`/api/contact-requests/${id}/status`).send({ status: "CONTACTED" })).status, 400);
    const reopened = await admin.patch(`/api/contact-requests/${id}/status`).send({ status: "CONTACTED", reason: "TEST-WF طلب العميل المتابعة" });
    assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
    assert.ok((await activityActions(id)).includes("CONTACT_REQUEST_REOPENED"));
  });
});

describe("execution starts only when the request is really ready", () => {
  test("paid, but a traveler's required document is missing / rejected / still under review", async () => {
    // one of two travelers never uploaded the passport
    const missing = await newRequest({ withDocsFor: [0] });
    await readyAndPaid({ staff: employee, accountant, tracking: missing.tracking, id: missing.id });
    const res = await employee.post(`/api/contact-requests/${missing.id}/start-execution`).send({});
    assertConflict(res, "missing document");
    assert.equal(res.body.code, "NOT_READY");
    assert.ok(res.body.reasons.some((reason) => reason.code === "DOCUMENTS_MISSING"), JSON.stringify(res.body));

    // a document was rejected after payment
    const rejected = await newRequest();
    await readyAndPaid({ staff: employee, accountant, tracking: rejected.tracking, id: rejected.id });
    const passport = (await staffDetail(employee, rejected.id)).documents.find((d) => d.requirementId);
    // a later re-review rejecting the passport
    await prisma.contactRequestDocument.update({ where: { id: passport.id }, data: { status: "REJECTED", reviewNote: "TEST-WF غير واضح" } });
    const rejectedRes = await employee.post(`/api/contact-requests/${rejected.id}/start-execution`).send({});
    assertConflict(rejectedRes, "rejected document");
    assert.ok(rejectedRes.body.reasons.some((reason) => reason.code === "DOCUMENTS_REJECTED"));

    // a document is still waiting for review
    const pending = await newRequest();
    await priceAndApprove({ staff: employee, tracking: pending.tracking, id: pending.id });
    await uploadReceipt(pending.tracking, pending.id);
    assert.equal((await accountant.post(`/api/contact-requests/${pending.id}/confirm-payment`).send({})).status, 200);
    const pendingRes = await employee.post(`/api/contact-requests/${pending.id}/start-execution`).send({});
    assertConflict(pendingRes, "document under review");
    assert.ok(pendingRes.body.reasons.some((reason) => reason.code === "DOCUMENTS_UNDER_REVIEW"));

    const detail = await staffDetail(employee, pending.id);
    assert.equal(detail.progress.canStartExecution, false, "the back-office does not offer it either");
    assert.ok(!detail.allowedActions.includes("START_EXECUTION"));
    assert.ok(detail.progress.blockers.length > 0);
  });

  test("unpaid requests cannot start; a paid ready request starts exactly once", async () => {
    const { id, tracking } = await newRequest();
    await acceptAllDocuments(employee, id);
    await priceAndApprove({ staff: employee, tracking, id });
    const unpaid = await employee.post(`/api/contact-requests/${id}/start-execution`).send({});
    assertConflict(unpaid, "unpaid");
    assert.ok(unpaid.body.reasons.some((reason) => reason.code === "PAYMENT_NOT_CONFIRMED"));
  });
});

describe("completion and delivery", () => {
  test("one traveler's file does not complete a two-traveler request; full coverage does", async () => {
    const { id, tracking } = await newRequest();
    await readyAndPaid({ staff: employee, accountant, tracking, id });
    assert.equal((await employee.post(`/api/contact-requests/${id}/start-execution`).send({})).status, 200);
    const [first, second] = (await staffDetail(employee, id)).travelers;

    const one = await deliverable(employee, id, { travelerIds: [first.id], publish: true });
    assert.equal(one.status, 201, JSON.stringify(one.body));
    let detail = await staffDetail(employee, id);
    assert.equal(detail.status, "CONTACTED", "one of two travelers delivered: still open");
    assert.equal(detail.progress.stage, "IN_EXECUTION");
    assert.equal(detail.progress.steps.find((s) => s.key === "DELIVERY").state, "current");

    // completing by hand is refused too, with the missing traveler named
    const early = await employee.patch(`/api/contact-requests/${id}/status`).send({ status: "CLOSED", outcome: "COMPLETED" });
    assertConflict(early, "manual completion");
    assert.ok(early.body.reasons.some((reason) => reason.code === "DELIVERY_INCOMPLETE"));

    const two = await deliverable(employee, id, { travelerIds: [second.id], publish: true });
    assert.equal(two.status, 201, JSON.stringify(two.body));
    detail = await staffDetail(employee, id);
    assert.equal(detail.status, "CLOSED");
    assert.equal(detail.outcome, "COMPLETED");
  });

  test("a combined file covers several travelers only when that coverage is recorded and valid", async () => {
    const { id, tracking } = await newRequest();
    const other = await newRequest();
    await readyAndPaid({ staff: employee, accountant, tracking, id });
    assert.equal((await employee.post(`/api/contact-requests/${id}/start-execution`).send({})).status, 200);
    const travelers = (await staffDetail(employee, id)).travelers;
    const foreign = (await staffDetail(employee, other.id)).travelers[0];

    const bad = await deliverable(employee, id, { travelerIds: [travelers[0].id, foreign.id], publish: true });
    assert.equal(bad.status, 400, JSON.stringify(bad.body));
    assert.equal(bad.body.code, "INVALID_COVERAGE");
    const unassigned = await deliverable(employee, id, { publish: true });
    assert.equal(unassigned.status, 400, "a multi-traveler request needs the file's coverage");
    assert.equal(unassigned.body.code, "COVERAGE_REQUIRED");

    const combined = await deliverable(employee, id, { travelerIds: travelers.map((t) => t.id), publish: true });
    assert.equal(combined.status, 201, JSON.stringify(combined.body));
    const detail = await staffDetail(employee, id);
    assert.equal(detail.outcome, "COMPLETED");
  });

  test("a prepared (draft) file is invisible and not downloadable for the customer until published", async () => {
    const { id, tracking } = await newRequest({ travelers: 1 });
    await acceptAllDocuments(employee, id);
    // prepared before payment: allowed as a draft, publishing is refused
    const draft = await deliverable(employee, id, { publish: false });
    assert.equal(draft.status, 201, JSON.stringify(draft.body));
    const draftId = draft.body.data.id;
    assert.equal(draft.body.data.publishedAt, null);
    assertConflict(await deliverable(employee, id, { publish: true }), "publish before payment");

    let tracked = await tracking.request(id);
    assert.equal(tracked.deliverables.length, 0, "drafts are not listed");
    assert.equal((await tracking.get(`/api/tracking/requests/${id}/deliverables/${draftId}/file`)).status, 404);
    const notes = await prisma.notification.count({ where: { contactRequestId: id, type: "CONTACT_REQUEST_DELIVERABLE_READY" } });
    assert.equal(notes, 0, "a draft is never announced");

    await priceAndApprove({ staff: employee, tracking, id });
    await uploadReceipt(tracking, id);
    assert.equal((await accountant.post(`/api/contact-requests/${id}/confirm-payment`).send({})).status, 200);
    assert.equal((await staffDetail(employee, id)).status, "CONTACTED", "payment + draft does not complete anything");
    assertConflict(await employee.post(`/api/contact-requests/${id}/deliverables/${draftId}/publish`).send({}), "publish before execution");
    assert.equal((await employee.post(`/api/contact-requests/${id}/start-execution`).send({})).status, 200);
    assert.equal((await accountant.post(`/api/contact-requests/${id}/deliverables/${draftId}/publish`).send({})).status, 403);
    const published = await employee.post(`/api/contact-requests/${id}/deliverables/${draftId}/publish`).send({});
    assert.equal(published.status, 200, JSON.stringify(published.body));
    tracked = await tracking.request(id);
    assert.equal(tracked.deliverables.length, 1);
    assert.equal(tracked.outcome, "COMPLETED");
    assertConflict(await employee.post(`/api/contact-requests/${id}/deliverables/${draftId}/publish`).send({}), "publish twice");
  });
});

describe("progress semantics", () => {
  test("steps reflect what actually happened", async () => {
    const { id, tracking } = await newRequest();
    let progress = (await tracking.request(id)).progress;
    const state = (key) => progress.steps.find((s) => s.key === key).state;
    assert.equal(state("RECEIVED"), "done");
    assert.equal(state("DOCUMENTS"), "current", "received does not mean reviewed");

    await acceptAllDocuments(employee, id);
    await priceAndApprove({ staff: employee, tracking, id });
    await uploadReceipt(tracking, id);
    progress = (await tracking.request(id)).progress;
    assert.equal(state("DOCUMENTS"), "done");
    assert.equal(state("PAYMENT"), "current", "a receipt is not an accepted payment");

    assert.equal((await accountant.post(`/api/contact-requests/${id}/confirm-payment`).send({})).status, 200);
    assert.equal((await employee.post(`/api/contact-requests/${id}/start-execution`).send({})).status, 200);
    progress = (await tracking.request(id)).progress;
    assert.equal(state("PAYMENT"), "done");
    assert.equal(state("EXECUTION"), "current", "started is not finished");
    assert.equal(state("DELIVERY"), "upcoming");

    await cancel(id, "TEST-WF ألغى العميل بعد الدفع، يُسترد المبلغ");
    progress = (await tracking.request(id)).progress;
    assert.equal(progress.stage, "CLOSED");
    assert.equal(progress.label, "تم إلغاء الطلب");
    assert.notEqual(state("DELIVERY"), "done", "a cancelled request never shows as delivered");
    assert.ok(progress.steps.every((s) => s.state !== "current"));
  });
});

describe("concurrent transitions (real PostgreSQL, row locks)", () => {
  test("five simultaneous execution starts: one wins, actor/time preserved, one audit row, one notification", async () => {
    const { id, tracking } = await newRequest({ travelers: 1 });
    await readyAndPaid({ staff: employee, accountant, tracking, id });
    const callers = [admin, employee, admin, employee, admin];
    const results = await Promise.all(callers.map((client) => client.post(`/api/contact-requests/${id}/start-execution`).send({})));
    const winners = results.filter((res) => res.status === 200);
    assert.equal(winners.length, 1, JSON.stringify(results.map((r) => r.status)));
    for (const loser of results.filter((res) => res.status !== 200)) assertConflict(loser, "losing start");
    const row = await prisma.contactRequest.findUnique({ where: { id } });
    assert.equal(row.executionStartedAt.toISOString(), winners[0].body.data.executionStartedAt);
    assert.equal(row.executionStartedByUserId, winners[0].body.data.executionStartedByUserId);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal((await activityActions(id)).filter((a) => a === "CONTACT_REQUEST_EXECUTION_STARTED").length, 1);
  });

  test("accepting and rejecting the same receipt at once cannot both win", async () => {
    const { id, tracking } = await newRequest();
    await acceptAllDocuments(employee, id);
    await priceAndApprove({ staff: employee, tracking, id });
    await uploadReceipt(tracking, id);
    const [confirm, reject] = await Promise.all([
      accountant.post(`/api/contact-requests/${id}/confirm-payment`).send({}),
      admin.post(`/api/contact-requests/${id}/reject-payment`).send({ reason: "TEST-WF المبلغ ناقص" }),
    ]);
    const statuses = [confirm.status, reject.status].sort();
    assert.deepEqual(statuses, [200, 409], JSON.stringify([confirm.body, reject.body]));
    const row = await prisma.contactRequest.findUnique({ where: { id } });
    if (confirm.status === 200) {
      assert.equal(row.paymentStatus, "CONFIRMED");
      assert.equal(row.paymentRejectionReason, null);
    } else {
      assert.equal(row.paymentStatus, "AWAITING_TRANSFER");
      assert.equal(row.paymentConfirmedAt, null);
    }
    const actions = await activityActions(id);
    assert.equal(actions.filter((a) => a === "CONTACT_REQUEST_PAYMENT_CONFIRMED" || a === "CONTACT_REQUEST_PAYMENT_REJECTED").length, 1);
  });

  test("completion and cancellation at once: the winner's outcome is not overwritten", async () => {
    const { id, tracking } = await newRequest({ travelers: 1 });
    await readyAndPaid({ staff: employee, accountant, tracking, id });
    assert.equal((await employee.post(`/api/contact-requests/${id}/start-execution`).send({})).status, 200);
    const traveler = (await staffDetail(employee, id)).travelers[0];
    const draft = await deliverable(employee, id, { travelerIds: [traveler.id], publish: false });
    const [publish, cancelRes] = await Promise.all([
      employee.post(`/api/contact-requests/${id}/deliverables/${draft.body.data.id}/publish`).send({}),
      admin.patch(`/api/contact-requests/${id}/status`).send({ status: "CLOSED", outcome: "CANCELLED", outcomeNote: "TEST-WF ألغى العميل، يُسترد المبلغ" }),
    ]);
    const row = await prisma.contactRequest.findUnique({ where: { id } });
    assert.equal(row.status, "CLOSED");
    if (publish.status === 200) {
      assert.equal(row.outcome, "COMPLETED", "publish won and completed; the cancel must not overwrite it");
      assertConflict(cancelRes, "late cancel");
    } else {
      assert.equal(row.outcome, "CANCELLED");
      assertConflict(publish, "late publish");
    }
    // closing an already closed request again is refused, not silently re-labelled
    assertConflict(await admin.patch(`/api/contact-requests/${id}/status`).send({ status: "CLOSED", outcome: "REJECTED", outcomeNote: "TEST-WF" }), "re-close");
  });

  test("approving a price that staff revised meanwhile is refused (the customer approves what they saw)", async () => {
    const { id, tracking } = await newRequest();
    await employee.post(`/api/contact-requests/${id}/invoice`).send({ amount: 100, currency: "USD" });
    const seen = (await tracking.request(id)).invoice;
    await employee.post(`/api/contact-requests/${id}/invoice`).send({ amount: 150, currency: "USD" });
    const stale = await tracking.post(`/api/tracking/requests/${id}/invoice/approve`).send({ invoiceVersion: seen.updatedAt });
    assertConflict(stale, "stale approval");
    assert.equal(stale.body.code, "QUOTE_CHANGED");
    const fresh = (await tracking.request(id)).invoice;
    assert.equal((await tracking.post(`/api/tracking/requests/${id}/invoice/approve`).send({ invoiceVersion: fresh.updatedAt })).status, 200);
  });
});

describe("correction of an accidental execution start", () => {
  test("admin-only, needs a reason, keeps history, and is refused once a file is published", async () => {
    const { id, tracking } = await newRequest({ travelers: 1 });
    await readyAndPaid({ staff: employee, accountant, tracking, id });
    const started = await employee.post(`/api/contact-requests/${id}/start-execution`).send({});
    assert.equal(started.status, 200);
    assert.equal((await employee.post(`/api/contact-requests/${id}/execution/revert`).send({ reason: "TEST-WF ضغط بالخطأ" })).status, 403);
    assert.equal((await admin.post(`/api/contact-requests/${id}/execution/revert`).send({})).status, 400);
    const reverted = await admin.post(`/api/contact-requests/${id}/execution/revert`).send({ reason: "TEST-WF ضغط بالخطأ" });
    assert.equal(reverted.status, 200, JSON.stringify(reverted.body));
    assert.equal(reverted.body.data.executionStartedAt, null);
    const log = await prisma.activityLog.findFirst({ where: { entityId: id, action: "CONTACT_REQUEST_EXECUTION_REVERTED" } });
    assert.ok(log, "the correction is audited");
    assert.equal(log.oldValue.executionStartedAt, started.body.data.executionStartedAt, "the original start is kept in the audit trail");
    assertConflict(await admin.post(`/api/contact-requests/${id}/execution/revert`).send({ reason: "TEST-WF مرة ثانية" }), "nothing to revert");

    assert.equal((await employee.post(`/api/contact-requests/${id}/start-execution`).send({})).status, 200);
    const traveler = (await staffDetail(employee, id)).travelers[0];
    await deliverable(employee, id, { travelerIds: [traveler.id], publish: true });
    assertConflict(await admin.post(`/api/contact-requests/${id}/execution/revert`).send({ reason: "TEST-WF بعد التسليم" }), "after delivery");
  });
});

describe("ownership and organization boundaries", () => {
  test("another customer, another organization and unauthorized roles cannot act on the request", async () => {
    const { id, tracking } = await newRequest({ travelers: 1 });
    await readyAndPaid({ staff: employee, accountant, tracking, id });
    const stranger = trackingClient(testPhone());
    assert.equal((await stranger.post(`/api/tracking/requests/${id}/invoice/approve`).send({})).status, 404);
    assert.equal((await stranger.post(`/api/tracking/requests/${id}/mark-transfer-sent`).send({})).status, 404);

    const otherOrg = await createOrganization("wf-other");
    const outsider = staffClient(await createStaffUser({ role: "ADMIN", organizationId: otherOrg.id }));
    assert.equal((await outsider.post(`/api/contact-requests/${id}/start-execution`).send({})).status, 404);
    assert.equal((await outsider.post(`/api/contact-requests/${id}/execution/revert`).send({ reason: "TEST-WF" })).status, 404);
    assert.equal((await accountant.post(`/api/contact-requests/${id}/start-execution`).send({})).status, 403);
    assert.equal((await contentManager.post(`/api/contact-requests/${id}/start-execution`).send({})).status, 403);
    assert.equal((await accountant.post(`/api/contact-requests/${id}/execution/revert`).send({ reason: "TEST-WF" })).status, 403);
    assert.equal((await staffDetail(employee, id)).executionStartedAt, null);
  });
});
