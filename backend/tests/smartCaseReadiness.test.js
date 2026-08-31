import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import { computeReadiness } from "../src/modules/contact-requests/contact-requests.service.js";

// Smart Case Operations — Release C groundwork (readiness engine). Most of
// this is tested as a pure function (no HTTP calls needed, so no budget
// concern against the shared 5-per-15min public-endpoint limiter) — one
// small integration test at the end confirms it's actually wired into
// GET /api/contact-requests.

function baseRequest(overrides = {}) {
  return {
    status: "NEW",
    paymentStatus: "NOT_REQUIRED",
    requirementsSnapshot: [],
    intakeData: null,
    documents: [],
    ...overrides,
  };
}

describe("computeReadiness() — pure function", () => {
  test("a request with no requirements and no payment needed is ready", () => {
    const readiness = computeReadiness(baseRequest());
    assert.equal(readiness.overall, "READY_FOR_PROCESSING");
    assert.equal(readiness.queue, "READY_FOR_PROCESSING");
    assert.equal(readiness.documentsComplete, true);
    assert.equal(readiness.paymentReady, true);
  });

  test("a missing required document blocks readiness (queue: MISSING_DOCUMENTS)", () => {
    const readiness = computeReadiness(
      baseRequest({
        requirementsSnapshot: [{ id: "r1", required: true, type: "DOCUMENT" }],
      })
    );
    assert.equal(readiness.overall, "NOT_READY");
    assert.equal(readiness.documentsComplete, false);
    assert.equal(readiness.queue, "MISSING_DOCUMENTS");
  });

  test("a requirement with no `type` field (pre-Release-A snapshot) is treated as DOCUMENT", () => {
    const readiness = computeReadiness(
      baseRequest({ requirementsSnapshot: [{ id: "r1", required: true }] })
    );
    assert.equal(readiness.documentsComplete, false);
  });

  test("an ACCEPTED, non-superseded document for the requirement satisfies it", () => {
    const readiness = computeReadiness(
      baseRequest({
        requirementsSnapshot: [{ id: "r1", required: true, type: "DOCUMENT" }],
        documents: [{ requirementId: "r1", status: "ACCEPTED", supersededAt: null }],
      })
    );
    assert.equal(readiness.documentsComplete, true);
    assert.equal(readiness.overall, "READY_FOR_PROCESSING");
  });

  test("a PENDING document under review is not yet complete (queue: NEEDS_REVIEW)", () => {
    const readiness = computeReadiness(
      baseRequest({
        requirementsSnapshot: [{ id: "r1", required: true, type: "DOCUMENT" }],
        documents: [{ requirementId: "r1", status: "PENDING", supersededAt: null }],
      })
    );
    assert.equal(readiness.overall, "NOT_READY");
    assert.equal(readiness.documentsUnderReview, true);
    assert.equal(readiness.queue, "NEEDS_REVIEW");
  });

  test("a REJECTED document (awaiting customer replacement) puts it in the WAITING_CUSTOMER queue", () => {
    const readiness = computeReadiness(
      baseRequest({
        requirementsSnapshot: [{ id: "r1", required: true, type: "DOCUMENT" }],
        documents: [{ requirementId: "r1", status: "REJECTED", supersededAt: null }],
      })
    );
    assert.equal(readiness.overall, "NOT_READY");
    assert.equal(readiness.queue, "WAITING_CUSTOMER");
  });

  test("a superseded (replaced) document no longer counts — only the current version is evaluated", () => {
    const readiness = computeReadiness(
      baseRequest({
        requirementsSnapshot: [{ id: "r1", required: true, type: "DOCUMENT" }],
        documents: [
          { requirementId: "r1", status: "REJECTED", supersededAt: new Date() },
          { requirementId: "r1", status: "ACCEPTED", supersededAt: null },
        ],
      })
    );
    assert.equal(readiness.overall, "READY_FOR_PROCESSING");
  });

  test("an unanswered required non-DOCUMENT requirement blocks readiness", () => {
    const readiness = computeReadiness(
      baseRequest({
        requirementsSnapshot: [{ id: "r1", required: true, type: "NUMBER" }],
        intakeData: { answers: {} },
      })
    );
    assert.equal(readiness.answersComplete, false);
    assert.equal(readiness.overall, "NOT_READY");
  });

  test("an answered required non-DOCUMENT requirement is satisfied", () => {
    const readiness = computeReadiness(
      baseRequest({
        requirementsSnapshot: [{ id: "r1", required: true, type: "NUMBER" }],
        intakeData: { answers: { r1: "3" } },
      })
    );
    assert.equal(readiness.answersComplete, true);
    assert.equal(readiness.overall, "READY_FOR_PROCESSING");
  });

  test("a conditional requirement that doesn't currently apply is never counted as missing", () => {
    const readiness = computeReadiness(
      baseRequest({
        requirementsSnapshot: [
          { id: "parent", required: true, type: "YES_NO" },
          {
            id: "child",
            required: true,
            type: "DOCUMENT",
            conditionRequirementId: "parent",
            conditionOperator: "EQUALS",
            conditionValue: "YES",
          },
        ],
        intakeData: { answers: { parent: "NO" } },
      })
    );
    assert.equal(readiness.documentsComplete, true, "the conditional child requirement doesn't apply, so it can't be missing");
    assert.equal(readiness.overall, "READY_FOR_PROCESSING");
  });

  test("a conditional requirement that does apply is still enforced", () => {
    const readiness = computeReadiness(
      baseRequest({
        requirementsSnapshot: [
          { id: "parent", required: true, type: "YES_NO" },
          {
            id: "child",
            required: true,
            type: "DOCUMENT",
            conditionRequirementId: "parent",
            conditionOperator: "EQUALS",
            conditionValue: "YES",
          },
        ],
        intakeData: { answers: { parent: "YES" } },
      })
    );
    assert.equal(readiness.documentsComplete, false);
    assert.equal(readiness.overall, "NOT_READY");
  });

  test("unconfirmed payment blocks readiness even when documents/answers are complete", () => {
    const readiness = computeReadiness(baseRequest({ paymentStatus: "AWAITING_TRANSFER" }));
    assert.equal(readiness.paymentReady, false);
    assert.equal(readiness.overall, "NOT_READY");
    assert.equal(readiness.queue, "WAITING_PAYMENT");
  });

  test("a CLOSED request is always in the COMPLETED queue regardless of other state", () => {
    const readiness = computeReadiness(baseRequest({ status: "CLOSED", paymentStatus: "AWAITING_TRANSFER" }));
    assert.equal(readiness.queue, "COMPLETED");
  });
});

describe("readiness is wired into GET /api/contact-requests", () => {
  test("a freshly submitted request with no requirements shows readiness: READY_FOR_PROCESSING", async () => {
    const agent = await loginAsSuperAdmin();
    const phone = `089${uniqueSuffix()}`;
    const res = await request(app).post("/api/contact-requests").send({
      name: "Readiness Integration Test",
      phone,
      message: "اختبار محرك الجاهزية",
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const listRes = await agent.get("/api/contact-requests?limit=50");
    const found = listRes.body.data.find((r) => r.id === res.body.data.id);
    assert.ok(found.readiness);
    assert.equal(found.readiness.overall, "READY_FOR_PROCESSING");
  });
});
