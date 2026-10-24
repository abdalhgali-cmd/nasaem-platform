import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { catalogPricing, decideSubmissionPricing, fixedTotal } from "../src/modules/contact-request-pricing/fixed-price.js";
import { ACTIONS, allowedActions, checkAction } from "../src/modules/contact-request-workflow/workflow-policy.js";
import { deriveRequestProgress } from "../src/modules/contact-request-progress/request-progress.js";
import { isEgyptTravelTask } from "../src/modules/contact-request-tracking/egypt-travel-tasks.js";
import { egyptTravelBlockers } from "../src/modules/contact-request-workflow/workflow-policy.js";

// Pure decisions (no database): pricing configuration, the submission
// decision, the workflow policy and the progress for both pricing modes.

const item = (overrides = {}) => ({ id: "s1", code: "SVC", name: "خدمة", basePrice: "150.00", currency: "SAR", pricingMode: "FIXED", priceUnit: "PER_TRAVELER", paymentAfterDocumentReview: false, ...overrides });

describe("catalog pricing configuration", () => {
  test("FIXED only when explicitly configured with a positive price", () => {
    assert.equal(catalogPricing(item()).mode, "FIXED");
    assert.equal(catalogPricing(item({ pricingMode: "QUOTE" })).mode, "QUOTE", "a basePrice alone never makes a fixed price");
    assert.equal(catalogPricing(item({ pricingMode: undefined })).mode, "QUOTE");
    assert.equal(catalogPricing(item({ basePrice: "0" })).mode, "QUOTE");
  });

  test("per-traveler totals count the travelers", () => {
    const pricing = catalogPricing(item());
    assert.deepEqual(fixedTotal(pricing, { travelers: 3 }), { units: 3, total: 450 });
    assert.deepEqual(fixedTotal(pricing, { travelers: 0, travelerCount: 2 }), { units: 2, total: 300 });
    assert.deepEqual(fixedTotal(catalogPricing(item({ priceUnit: "PER_REQUEST" })), { travelers: 4 }), { units: 1, total: 150 });
  });
});

describe("submission pricing decision", () => {
  test("a confirmed matching total is recorded as FIXED with its snapshot", () => {
    const now = new Date("2026-10-11T10:00:00Z");
    const decision = decideSubmissionPricing(item(), "SERVICE", { acceptedTotal: "300", acceptedCurrency: "SAR", travelers: 2 }, now);
    assert.equal(decision.mode, "FIXED");
    assert.deepEqual(
      { unitPrice: decision.snapshot.unitPrice, units: decision.snapshot.units, total: decision.snapshot.total, currency: decision.snapshot.currency, acceptedAt: decision.snapshot.acceptedAt },
      { unitPrice: 150, units: 2, total: 300, currency: "SAR", acceptedAt: now.toISOString() }
    );
  });

  test("a different total or currency is refused with the current total", () => {
    const changed = decideSubmissionPricing(item(), "SERVICE", { acceptedTotal: 150, travelers: 2 });
    assert.equal(changed.error, "PRICE_CHANGED");
    assert.equal(changed.details.total, 300);
    assert.equal(decideSubmissionPricing(item(), "SERVICE", { acceptedTotal: 300, acceptedCurrency: "USD", travelers: 2 }).error, "PRICE_CHANGED");
    assert.equal(decideSubmissionPricing(item(), "SERVICE", { acceptedTotal: 300, travelers: 2 }).error, "PRICE_CHANGED", "matching total without an accepted currency is not informed consent");
  });

  test("a FIXED item without a confirmed total becomes a quote request (older clients)", () => {
    const decision = decideSubmissionPricing(item(), "SERVICE", { travelers: 1 });
    assert.equal(decision.mode, "QUOTE");
    assert.equal(decision.snapshot.reason, "FIXED_PRICE_NOT_CONFIRMED");
  });

  test("a confirmed total for an item that is now QUOTE is refused", () => {
    assert.equal(decideSubmissionPricing(item({ pricingMode: "QUOTE" }), "SERVICE", { acceptedTotal: 150 }).error, "PRICING_MODE_CHANGED");
    assert.deepEqual(decideSubmissionPricing(item({ pricingMode: "QUOTE" }), "SERVICE", {}), { mode: "QUOTE", snapshot: null });
  });
});

const fixedRequest = (overrides = {}) => ({
  status: "NEW",
  pricingMode: "FIXED",
  pricingSnapshot: { mode: "FIXED", total: 300, currency: "SAR", unitPrice: 150, units: 2, priceUnit: "PER_TRAVELER", paymentAfterDocumentReview: false },
  invoice: { status: "APPROVED", version: 1, amount: 300, currency: "SAR" },
  paymentStatus: "AWAITING_TRANSFER",
  offers: [],
  documents: [],
  travelers: [{ id: "t1", fullName: "أ" }],
  deliverables: [],
  requirementsSnapshot: [{ id: "r1", name: "الجواز", required: true, type: "DOCUMENT", scope: "TRAVELER" }],
  ...overrides,
});

describe("workflow policy by pricing mode", () => {
  test("FIXED: no quote can be issued, added or approved", () => {
    const request = fixedRequest();
    assert.equal(checkAction(ACTIONS.ISSUE_QUOTE, request).code, "FIXED_PRICE");
    assert.equal(checkAction(ACTIONS.ADD_OFFER, request).code, "FIXED_PRICE");
    assert.equal(checkAction(ACTIONS.APPROVE_QUOTE, request, { invoiceVersion: 1 }).code, "QUOTE_NOT_PENDING");
    assert.ok(!allowedActions(request, { audience: "customer" }).includes(ACTIONS.APPROVE_QUOTE));
    assert.ok(allowedActions(request, { audience: "customer" }).includes(ACTIONS.UPLOAD_RECEIPT), "payment is open right away");
  });

  test("FIXED with payment after document review: locked until documents are approved, same price", () => {
    const locked = fixedRequest({ pricingSnapshot: { ...fixedRequest().pricingSnapshot, paymentAfterDocumentReview: true } });
    const refusal = checkAction(ACTIONS.UPLOAD_RECEIPT, locked);
    assert.equal(refusal.code, "PAYMENT_AFTER_DOCUMENT_REVIEW");
    assert.ok(refusal.reasons.some((r) => r.code === "DOCUMENTS_MISSING"));
    assert.ok(!allowedActions(locked, { audience: "customer" }).includes(ACTIONS.UPLOAD_RECEIPT));

    const pending = { ...locked, documents: [{ id: "d", requirementId: "r1", travelerId: "t1", status: "PENDING" }] };
    assert.equal(checkAction(ACTIONS.UPLOAD_RECEIPT, pending).code, "PAYMENT_AFTER_DOCUMENT_REVIEW", "uploaded is not approved");

    const approved = { ...locked, documents: [{ id: "d", requirementId: "r1", travelerId: "t1", status: "ACCEPTED" }] };
    assert.equal(checkAction(ACTIONS.UPLOAD_RECEIPT, approved), null);
    assert.equal(approved.invoice.amount, 300);
  });

  test("QUOTE keeps the version-checked approval", () => {
    const request = { ...fixedRequest(), pricingMode: "QUOTE", pricingSnapshot: null, invoice: { status: "PENDING", version: 2 }, paymentStatus: "NOT_REQUIRED" };
    assert.equal(checkAction(ACTIONS.ISSUE_QUOTE, request), null);
    assert.equal(checkAction(ACTIONS.APPROVE_QUOTE, request, {}).code, "QUOTE_VERSION_REQUIRED");
    assert.equal(checkAction(ACTIONS.APPROVE_QUOTE, request, { invoiceVersion: 1 }).code, "QUOTE_CHANGED");
    assert.equal(checkAction(ACTIONS.APPROVE_QUOTE, request, { invoiceVersion: 2 }), null);
    // Legacy rows (pricingMode null) are QUOTE.
    assert.equal(checkAction(ACTIONS.ISSUE_QUOTE, { ...request, pricingMode: null }), null);
  });
});

describe("progress by pricing mode", () => {
  test("FIXED has no quote step; RECEIVED records the accepted total", () => {
    const progress = deriveRequestProgress(fixedRequest());
    assert.equal(progress.pricingMode, "FIXED");
    assert.ok(!progress.steps.some((s) => s.key === "QUOTE"));
    assert.deepEqual(progress.steps.map((s) => s.key), ["RECEIVED", "DOCUMENTS", "PAYMENT", "PAYMENT_REVIEW", "EXECUTION", "DELIVERY"]);
    assert.match(progress.steps[0].status, /300 SAR/);
    assert.equal(progress.pricing.total, 300);
  });

  test("FIXED locked payment is reported, then unlocked", () => {
    const locked = fixedRequest({ pricingSnapshot: { ...fixedRequest().pricingSnapshot, paymentAfterDocumentReview: true } });
    const progress = deriveRequestProgress(locked);
    assert.equal(progress.stage, "AWAITING_DOCUMENT_REVIEW");
    assert.equal(progress.paymentLocked, true);
    assert.match(progress.steps.find((s) => s.key === "PAYMENT").status, /بعد اعتماد المستندات/);
    const open = deriveRequestProgress({ ...locked, documents: [{ id: "d", requirementId: "r1", travelerId: "t1", status: "ACCEPTED" }] });
    assert.equal(open.paymentLocked, false);
    assert.equal(open.stage, "AWAITING_PAYMENT");
    assert.equal(open.steps.find((s) => s.key === "PAYMENT").state, "current");
  });

  test("QUOTE keeps the quote step; execution started is not completed", () => {
    const quote = deriveRequestProgress({ ...fixedRequest(), pricingMode: "QUOTE", pricingSnapshot: null, invoice: { status: "PENDING", version: 1 }, paymentStatus: "NOT_REQUIRED" });
    assert.ok(quote.steps.some((s) => s.key === "QUOTE"));
    assert.equal(quote.pricingMode, "QUOTE");
    const started = deriveRequestProgress(fixedRequest({ paymentStatus: "CONFIRMED", executionStartedAt: new Date(), documents: [{ id: "d", requirementId: "r1", travelerId: "t1", status: "ACCEPTED" }], serviceRef: { category: "flight" } }));
    const execution = started.steps.find((s) => s.key === "EXECUTION");
    assert.equal(execution.state, "current");
    assert.equal(execution.started, true);
    assert.equal(execution.label, "إصدار التذكرة");
    assert.match(execution.status, /لم يكتمل بعد/);
  });
});

describe("Egypt travel tasks are recognised by their stable key", () => {
  // The circular is issued, so the only thing these tests vary is the task.
  const request = { visaType: { code: "VISA-EGYPT-CLEARANCE" }, intakeData: { egyptTravel: { entryMode: "AIR", bookingStatus: "NEEDS_NASAEM", entryDate: "2030-01-01" } }, documents: [], deliverables: [{ id: "c1", kind: "CIRCULAR", publishedAt: new Date(), supersededAt: null }] };
  test("a keyed task blocks whatever its title", () => {
    const task = { status: "OPEN", source: "SYSTEM", systemKey: "EGYPT_TRAVEL_CIRCULAR", title: "Prepare circular (renamed)" };
    assert.equal(isEgyptTravelTask(task), true);
    assert.ok(egyptTravelBlockers({ ...request, tasks: [task] }).some((r) => r.code === "TRAVEL_TASKS_OPEN"));
  });
  test("a task whose title merely mentions مصر does not", () => {
    const task = { status: "OPEN", source: "SYSTEM", systemKey: null, title: "مهمة عامة عن مصر" };
    assert.equal(isEgyptTravelTask(task), false);
    assert.deepEqual(egyptTravelBlockers({ ...request, tasks: [task] }), []);
    assert.equal(isEgyptTravelTask({ status: "OPEN", source: "MANUAL", systemKey: "EGYPT_TRAVEL_CIRCULAR" }), false);
  });
});

describe("Egypt completion needs the issued circular and, over land, the entry point (AUDIT-00 G-04)", () => {
  const plan = (entryMode, extra = {}) => ({ visaType: { code: "VISA-EGYPT-CLEARANCE" }, intakeData: { egyptTravel: { entryMode, bookingStatus: "NEEDS_NASAEM", entryDate: "2030-01-01", ...extra } }, documents: [], tasks: [] });
  const circular = { id: "c1", kind: "CIRCULAR", publishedAt: new Date(), supersededAt: null };
  const codes = (request) => egyptTravelBlockers(request).map((r) => r.code);

  test("no circular, or only a superseded one → CIRCULAR_NOT_ISSUED", () => {
    assert.deepEqual(codes({ ...plan("AIR"), deliverables: [] }), ["CIRCULAR_NOT_ISSUED"]);
    assert.deepEqual(codes({ ...plan("AIR"), deliverables: [{ ...circular, supersededAt: new Date() }] }), ["CIRCULAR_NOT_ISSUED"]);
    assert.deepEqual(codes({ ...plan("AIR"), deliverables: [circular] }), []);
  });

  test("over land: the entry point is required too", () => {
    assert.deepEqual(codes({ ...plan("BORDER"), deliverables: [circular] }), ["ENTRY_PORT_MISSING"]);
    assert.deepEqual(codes({ ...plan("BORDER", { entryPort: "أرقين" }), deliverables: [circular] }), []);
  });
});
