import test from "node:test";
import assert from "node:assert/strict";

import { deriveRequestProgress } from "../src/modules/contact-request-progress/request-progress.js";
import { evaluateDelivery } from "../src/modules/contact-request-workflow/workflow-policy.js";
import { NO_ACTION_MESSAGE } from "../src/modules/umrah/umrah-journey.js";
import { umrahDeliverableKind } from "../src/modules/umrah/umrah-delivery.js";

// «رحلتي إلى الحرمين»: the server derives every pilgrim's visa and service
// state, the current step, who it waits on and the one customer action.
const T1 = { id: "t1", fullName: "أحمد", sortOrder: 0 };
const T2 = { id: "t2", fullName: "فاطمة", sortOrder: 1 };
const T3 = { id: "t3", fullName: "علي", sortOrder: 2 };
const NOW = new Date("2026-11-02T08:00:00Z");

function request({ kind = "VISA_ONLY", travelers = [T1], deliverables = [], ...rest } = {}) {
  return {
    id: "req_1",
    status: "IN_PROGRESS",
    serviceRef: { name: "باقة عمرة", category: "umrah_package", features: [`KIND: ${kind}`] },
    visaType: null,
    travelers,
    travelerCount: travelers.length,
    documents: [],
    requirementsSnapshot: [],
    intakeData: {},
    pricingMode: "FIXED",
    pricingSnapshot: { total: 795, currency: "SAR", unitPrice: 795, priceUnit: "PER_TRAVELER", units: travelers.length },
    paymentStatus: "CONFIRMED",
    executionStartedAt: NOW,
    deliverables,
    updatedAt: NOW,
    ...rest,
  };
}
const file = (id, kind, travelerIds, published = true) => ({ id, kind, label: `ملف ${id}`, travelerIds, publishedAt: published ? NOW : null, supersededAt: null });

test("one pilgrim: the visa completes a visa-only package", () => {
  const before = deriveRequestProgress(request());
  assert.equal(before.umrah.pilgrims[0].visa, "IN_PROGRESS");
  assert.deepEqual(before.steps.map((s) => s.key), ["RECEIVED", "DOCUMENTS", "PAYMENT", "PAYMENT_REVIEW", "EXECUTION", "VISAS", "DELIVERY"]);
  assert.equal(before.umrah.now.actor, "AGENCY");
  assert.equal(before.umrah.now.actionRequired, false);
  assert.equal(before.umrah.now.noActionMessage, NO_ACTION_MESSAGE);
  assert.equal(before.umrah.primaryAction, null, "no button for something the customer cannot do");

  const after = deriveRequestProgress(request({ deliverables: [file("v1", "VISA", [])] }));
  assert.equal(after.umrah.pilgrims[0].visa, "ISSUED");
  assert.equal(after.umrah.pilgrims[0].visaFiles[0].id, "v1");
  assert.equal(after.stage, "DELIVERED");
  assert.equal(after.umrah.primaryAction.key, "DOWNLOAD_VISAS");
});

test("three pilgrims: one visa issued is not all visas issued", () => {
  const p = deriveRequestProgress(request({ travelers: [T1, T2, T3], deliverables: [file("v1", "VISA", ["t1"]), file("v2", "VISA", ["t2"])] }));
  assert.deepEqual(p.umrah.pilgrims.map((x) => x.visa), ["ISSUED", "ISSUED", "IN_PROGRESS"]);
  assert.equal(p.umrah.visasIssued, 2);
  assert.notEqual(p.stage, "DELIVERED");
  assert.equal(p.steps.find((s) => s.key === "VISAS").state, "current");
  assert.match(p.steps.find((s) => s.key === "VISAS").status, /2 من 3/);
  assert.equal(evaluateDelivery(request({ travelers: [T1, T2, T3], deliverables: [file("v1", "VISA", ["t1"])] })).complete, false);
  // A draft (not published) visa never counts.
  const draft = deriveRequestProgress(request({ travelers: [T1, T2], deliverables: [file("v1", "VISA", ["t1"]), file("v2", "VISA", ["t2"], false)] }));
  assert.deepEqual(draft.umrah.pilgrims.map((x) => x.visa), ["ISSUED", "IN_PROGRESS"]);
});

test("flight/sea package: issuing every visa does not complete it before the services are delivered", () => {
  for (const kind of ["AIR", "SEA"]) {
    const visasOnly = deriveRequestProgress(request({ kind, travelers: [T1, T2], deliverables: [file("v1", "VISA", ["t1", "t2"])] }));
    assert.equal(visasOnly.umrah.servicesIncluded, true);
    assert.ok(visasOnly.steps.some((s) => s.key === "SERVICES"));
    assert.equal(visasOnly.steps.find((s) => s.key === "VISAS").state, "done");
    assert.equal(visasOnly.steps.find((s) => s.key === "SERVICES").state, "current");
    assert.notEqual(visasOnly.stage, "DELIVERED");
    assert.deepEqual(visasOnly.umrah.pilgrims.map((x) => x.services), ["PREPARING", "PREPARING"]);
    assert.ok(visasOnly.completionBlockers.some((b) => b.code === "SERVICES_INCOMPLETE"));

    const done = deriveRequestProgress(request({ kind, travelers: [T1, T2], deliverables: [file("v1", "VISA", ["t1", "t2"]), file("s1", "SERVICE", ["t1", "t2"])] }));
    assert.equal(done.stage, "DELIVERED");
    assert.deepEqual(done.umrah.pilgrims.map((x) => x.services), ["DELIVERED", "DELIVERED"]);
  }
});

test("an Umrah GENERAL file uploaded before the kinds existed still counts as the visa", () => {
  const p = deriveRequestProgress(request({ deliverables: [file("g1", "GENERAL", [])] }));
  assert.equal(p.umrah.pilgrims[0].visa, "ISSUED");
});

test("the one customer action: documents, payment, a rejected receipt", () => {
  const docs = deriveRequestProgress(request({
    paymentStatus: "AWAITING_TRANSFER", executionStartedAt: null,
    requirementsSnapshot: [{ id: "r1", name: "صورة الجواز", required: true, perTraveler: true }],
  }));
  assert.equal(docs.umrah.primaryAction?.key, "COMPLETE_DOCUMENTS");
  assert.equal(docs.umrah.now.actor, "CUSTOMER");

  const pay = deriveRequestProgress(request({ paymentStatus: "AWAITING_TRANSFER", executionStartedAt: null }));
  assert.equal(pay.umrah.primaryAction.key, "PAY");
  assert.equal(pay.umrah.now.actionRequired, true);

  const rejected = deriveRequestProgress(request({ paymentStatus: "AWAITING_TRANSFER", executionStartedAt: null, paymentRejectionReason: "المبلغ غير مطابق" }));
  assert.equal(rejected.umrah.primaryAction.key, "REUPLOAD_RECEIPT");
  assert.match(rejected.umrah.now.message, /المبلغ غير مطابق/);

  const review = deriveRequestProgress(request({ paymentStatus: "UNDER_REVIEW", executionStartedAt: null }));
  assert.equal(review.umrah.primaryAction, null);
  assert.equal(review.umrah.now.actor, "AGENCY");
});

test("other services are untouched", () => {
  const egypt = deriveRequestProgress({ ...request(), serviceRef: { name: "x", category: "egypt_clearance", features: [] } });
  assert.equal(egypt.umrah, undefined);
  assert.ok(!egypt.steps.some((s) => s.key === "VISAS"));
});

test("staff upload kind: VISA by default, SERVICE only for a flight/sea package", () => {
  assert.deepEqual(umrahDeliverableKind(request(), undefined), { kind: "VISA" });
  assert.equal(umrahDeliverableKind(request(), "SERVICE").error.code, "SERVICES_NOT_INCLUDED");
  assert.deepEqual(umrahDeliverableKind(request({ kind: "SEA" }), "SERVICE"), { kind: "SERVICE" });
  assert.equal(umrahDeliverableKind(request(), "TICKET").error.code, "INVALID_KIND");
});
