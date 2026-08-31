import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";
import { normalizePhone } from "../src/utils/phone.js";
import {
  buildCustomerChecklist,
  buildCustomerNextActions,
} from "../src/modules/contact-request-tracking/customer-checklist.js";

// Smart Case Operations — Release D (Customer Portal 2.0). Pure functions
// over data the tracking listing already loads: what is left for the
// customer to do, and nothing that is actually waiting on staff.

const passportRequirement = { id: "req-passport", name: "جواز السفر", required: true, type: "DOCUMENT" };

describe("buildCustomerChecklist()", () => {
  test("reports a required document with nothing uploaded as missing", () => {
    const checklist = buildCustomerChecklist({
      requirementsSnapshot: [passportRequirement],
      documents: [],
      travelers: [],
    });

    assert.equal(checklist.length, 1);
    assert.equal(checklist[0].state, "MISSING");
    assert.equal(checklist[0].kind, "DOCUMENT");
    assert.equal(checklist[0].label, "جواز السفر");
  });

  test("distinguishes accepted, under-review and rejected — a pending file is with us, not the customer", () => {
    const base = { requirementsSnapshot: [passportRequirement], travelers: [] };

    assert.equal(
      buildCustomerChecklist({ ...base, documents: [{ id: "d1", requirementId: "req-passport", status: "ACCEPTED" }] })[0].state,
      "ACCEPTED"
    );
    assert.equal(
      buildCustomerChecklist({ ...base, documents: [{ id: "d1", requirementId: "req-passport", status: "PENDING" }] })[0].state,
      "UNDER_REVIEW"
    );

    const rejected = buildCustomerChecklist({
      ...base,
      documents: [{ id: "d1", requirementId: "req-passport", status: "REJECTED", reviewNote: "الصورة غير واضحة" }],
    })[0];
    assert.equal(rejected.state, "REJECTED");
    assert.equal(rejected.reviewNote, "الصورة غير واضحة", "the customer is told why it came back");
  });

  test("ignores superseded documents, so a replaced file never masks the current one", () => {
    const checklist = buildCustomerChecklist({
      requirementsSnapshot: [passportRequirement],
      travelers: [],
      documents: [
        { id: "old", requirementId: "req-passport", status: "ACCEPTED", supersededAt: new Date() },
        { id: "new", requirementId: "req-passport", status: "PENDING" },
      ],
    });
    assert.equal(checklist[0].state, "UNDER_REVIEW");
    assert.equal(checklist[0].documentId, "new");
  });

  test("names the traveler a document belongs to", () => {
    const checklist = buildCustomerChecklist({
      requirementsSnapshot: [passportRequirement],
      travelers: [{ id: "t1", fullName: "أحمد" }],
      documents: [{ id: "d1", requirementId: "req-passport", status: "PENDING", travelerId: "t1" }],
    });
    assert.equal(checklist[0].travelerName, "أحمد");
  });

  test("omits a requirement whose condition does not hold — never asked, so never 'missing'", () => {
    const snapshot = [
      { id: "req-married", name: "هل أنت متزوج؟", required: true, type: "YES_NO" },
      {
        id: "req-marriage-doc",
        name: "عقد الزواج",
        required: true,
        type: "DOCUMENT",
        conditionRequirementId: "req-married",
        conditionOperator: "EQUALS",
        conditionValue: "yes",
      },
    ];

    const single = buildCustomerChecklist({
      requirementsSnapshot: snapshot,
      documents: [],
      travelers: [],
      intakeData: { answers: { "req-married": "no" } },
    });
    assert.deepEqual(single.map((i) => i.requirementId), ["req-married"]);

    const married = buildCustomerChecklist({
      requirementsSnapshot: snapshot,
      documents: [],
      travelers: [],
      intakeData: { answers: { "req-married": "yes" } },
    });
    assert.deepEqual(married.map((i) => i.requirementId), ["req-married", "req-marriage-doc"]);
  });

  test("tracks answer-type requirements alongside documents", () => {
    const checklist = buildCustomerChecklist({
      requirementsSnapshot: [{ id: "req-job", name: "المهنة", required: true, type: "TEXT" }],
      documents: [],
      travelers: [],
      intakeData: { answers: { "req-job": "مهندس" } },
    });
    assert.equal(checklist[0].kind, "ANSWER");
    assert.equal(checklist[0].state, "ANSWERED");
    assert.equal(checklist[0].answer, "مهندس");
  });

  test("a request with no checklist at all (plain contact form) produces no rows", () => {
    assert.deepEqual(buildCustomerChecklist({ documents: [], travelers: [] }), []);
  });
});

describe("buildCustomerNextActions()", () => {
  test("puts a rejected document first, carrying the reason", () => {
    const checklist = [
      { requirementId: "r1", label: "صورة شخصية", kind: "DOCUMENT", required: true, state: "MISSING" },
      { requirementId: "r2", label: "جواز السفر", kind: "DOCUMENT", required: true, state: "REJECTED", reviewNote: "غير واضح" },
    ];

    const actions = buildCustomerNextActions({}, checklist);
    assert.equal(actions[0].code, "REPLACE_DOCUMENT");
    assert.equal(actions[0].reason, "غير واضح");
    assert.equal(actions[1].code, "UPLOAD_DOCUMENT");
  });

  test("asks for a price decision while an invoice is pending", () => {
    const actions = buildCustomerNextActions({ invoice: { status: "PENDING" } }, []);
    assert.deepEqual(actions.map((a) => a.code), ["REVIEW_INVOICE"]);
  });

  test("asks for the transfer once the price is agreed", () => {
    const actions = buildCustomerNextActions({ paymentStatus: "AWAITING_TRANSFER" }, []);
    assert.deepEqual(actions.map((a) => a.code), ["SEND_TRANSFER"]);
  });

  test("says nothing when everything is with us — 'wait' is not an action", () => {
    const checklist = [{ requirementId: "r1", label: "جواز", kind: "DOCUMENT", required: true, state: "UNDER_REVIEW" }];
    const actions = buildCustomerNextActions(
      { invoice: { status: "APPROVED" }, paymentStatus: "CONFIRMED" },
      checklist
    );
    assert.deepEqual(actions, []);
  });

  test("does not chase an optional missing document", () => {
    const checklist = [{ requirementId: "r1", label: "مستند إضافي", kind: "DOCUMENT", required: false, state: "MISSING" }];
    assert.deepEqual(buildCustomerNextActions({}, checklist), []);
  });
});

// The wiring: the tracking listing must actually carry the derived
// checklist, since the portal's whole action-first view depends on it.
describe("GET /api/tracking/requests carries the checklist", () => {
  test("returns checklist rows and next actions for the caller's own request", async () => {
    const suffix = uniqueSuffix();
    const localPhone = `0961${suffix}`;
    const phone = normalizePhone(localPhone);

    const service = await prisma.service.create({
      data: { code: `SVC-CHK-${suffix}`, name: `Checklist Service ${suffix}`, category: "qa-checklist", basePrice: 10 },
    });
    const requirement = await prisma.visaRequirement.create({
      data: { serviceId: service.id, name: "جواز السفر", required: true, type: "DOCUMENT", sortOrder: 0 },
    });

    const contactRequest = await prisma.contactRequest.create({
      data: {
        name: "Checklist Customer",
        phone: localPhone,
        phoneNormalized: phone,
        message: "طلب باشتراطات",
        serviceId: service.id,
        requirementsSnapshot: [
          { id: requirement.id, name: "جواز السفر", required: true, type: "DOCUMENT" },
        ],
      },
    });

    await prisma.contactRequestLoginCode.create({
      data: { phone, code: "246801", expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });
    const agent = request.agent(app);
    const verifyRes = await agent.post("/api/tracking/verify-code").send({ phone: localPhone, code: "246801" });
    assert.equal(verifyRes.status, 200, JSON.stringify(verifyRes.body));

    const listRes = await agent.get("/api/tracking/requests");
    assert.equal(listRes.status, 200);

    const row = listRes.body.data.find((r) => r.id === contactRequest.id);
    assert.ok(row, "the caller's own request is listed");
    assert.deepEqual(
      row.checklist.map((i) => [i.requirementId, i.state]),
      [[requirement.id, "MISSING"]]
    );
    assert.deepEqual(
      row.nextActions.map((a) => a.code),
      ["UPLOAD_DOCUMENT"],
      "a missing required document is the customer's move"
    );
  });
});
