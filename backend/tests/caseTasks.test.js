import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";
import { deriveSlaState, ensureSystemTask, syncCaseTasks } from "../src/modules/case-tasks/case-tasks.service.js";

// Smart Case Operations — Release E (internal work management): case tasks,
// deterministic SLA state, and the operations queue summary. Cases are
// created directly rather than through the rate-limited public endpoint.

async function createCase(overrides = {}) {
  return prisma.contactRequest.create({
    data: {
      name: "Task Test Customer",
      phone: `0931${uniqueSuffix()}`,
      phoneNormalized: `+249931${uniqueSuffix()}`,
      message: "حالة اختبار المهام",
      ...overrides,
    },
  });
}

describe("deriveSlaState() — deterministic, never invented", () => {
  test("a case with no recorded expectation has no SLA state at all", () => {
    assert.equal(deriveSlaState(null), null);
    assert.equal(deriveSlaState(undefined), null);
  });

  test("classifies past/today/future against calendar days", () => {
    const now = new Date("2026-08-31T12:00:00Z");
    assert.equal(deriveSlaState(new Date("2026-08-30T23:00:00Z"), now), "OVERDUE");
    assert.equal(deriveSlaState(new Date("2026-08-31T01:00:00Z"), now), "DUE_TODAY");
    assert.equal(deriveSlaState(new Date("2026-09-02T00:00:00Z"), now), "ON_TIME");
  });
});

describe("system task lifecycle", () => {
  test("never opens a duplicate of an already-open system task", async () => {
    const contactRequest = await createCase();

    const first = await ensureSystemTask(contactRequest.id, "REVIEW_DOCUMENTS");
    const second = await ensureSystemTask(contactRequest.id, "REVIEW_DOCUMENTS");

    assert.equal(first.created, true);
    assert.equal(second.created, false, "a repeated case event must not grow the queue");

    const tasks = await prisma.caseTask.findMany({ where: { contactRequestId: contactRequest.id, status: "OPEN" } });
    assert.equal(tasks.length, 1);
  });

  test("syncCaseTasks opens review work, then closes it once review is done and opens payment work", async () => {
    const contactRequest = await createCase();

    await syncCaseTasks(contactRequest.id, {
      documentsUnderReview: true,
      documentsComplete: false,
      answersComplete: true,
      paymentReady: false,
      overall: "NOT_READY",
    });

    let open = await prisma.caseTask.findMany({ where: { contactRequestId: contactRequest.id, status: "OPEN" } });
    assert.deepEqual(open.map((t) => t.type), ["REVIEW_DOCUMENTS"]);

    // Documents now approved, payment still outstanding.
    await syncCaseTasks(contactRequest.id, {
      documentsUnderReview: false,
      documentsComplete: true,
      answersComplete: true,
      paymentReady: false,
      overall: "NOT_READY",
    });

    open = await prisma.caseTask.findMany({ where: { contactRequestId: contactRequest.id, status: "OPEN" } });
    assert.deepEqual(open.map((t) => t.type), ["CHECK_PAYMENT"], "review work closes, payment work opens");

    // Fully ready.
    await syncCaseTasks(contactRequest.id, {
      documentsUnderReview: false,
      documentsComplete: true,
      answersComplete: true,
      paymentReady: true,
      overall: "READY_FOR_PROCESSING",
    });

    open = await prisma.caseTask.findMany({
      where: { contactRequestId: contactRequest.id, status: "OPEN" },
      orderBy: { createdAt: "asc" },
    });
    assert.deepEqual(open.map((t) => t.type), ["PROCESS_APPLICATION"]);
  });
});

describe("case task API", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
  });

  test("creates, lists and completes a manual task", async () => {
    const contactRequest = await createCase();

    const createRes = await agent
      .post(`/api/contact-requests/${contactRequest.id}/tasks`)
      .send({ title: "الاتصال بالعميل", type: "OTHER" });
    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
    assert.equal(createRes.body.data.source, "MANUAL");
    assert.equal(createRes.body.data.status, "OPEN");

    const listRes = await agent.get(`/api/contact-requests/${contactRequest.id}/tasks`);
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.data.length, 1);

    const completeRes = await agent.patch(
      `/api/contact-requests/${contactRequest.id}/tasks/${createRes.body.data.id}/complete`
    );
    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.body.data.status, "COMPLETED");
    assert.ok(completeRes.body.data.completedAt);

    // Completing twice is refused.
    const again = await agent.patch(
      `/api/contact-requests/${contactRequest.id}/tasks/${createRes.body.data.id}/complete`
    );
    assert.equal(again.status, 409);
  });

  test("a task from another case cannot be completed through this case's URL (IDOR)", async () => {
    const caseA = await createCase();
    const caseB = await createCase();

    const created = await agent.post(`/api/contact-requests/${caseA.id}/tasks`).send({ title: "مهمة أ" });
    assert.equal(created.status, 201);

    const crossRes = await agent.patch(
      `/api/contact-requests/${caseB.id}/tasks/${created.body.data.id}/complete`
    );
    assert.equal(crossRes.status, 404);
  });

  test("rejects a manual task assigned to someone outside the organization", async () => {
    const contactRequest = await createCase();
    const res = await agent
      .post(`/api/contact-requests/${contactRequest.id}/tasks`)
      .send({ title: "مهمة", assignedUserId: "does-not-exist" });
    assert.equal(res.status, 404);
  });
});

describe("operations queue summary (Release G metrics)", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
  });

  test("counts open cases per queue and reports overdue/unassigned totals", async () => {
    // A case with an unmet required document → MISSING_DOCUMENTS, and
    // overdue by its recorded expectation.
    await createCase({
      requirementsSnapshot: [{ id: "req-x", required: true, type: "DOCUMENT" }],
      dueAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    });

    const res = await agent.get("/api/contact-requests/queue-summary");
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const data = res.body.data;
    assert.ok(typeof data.open === "number");
    assert.ok(typeof data.completed === "number");
    assert.ok(data.queues.MISSING_DOCUMENTS >= 1, "the case with an unmet requirement lands in MISSING_DOCUMENTS");
    assert.ok(data.overdue >= 1, "its recorded expectation is in the past, so it counts as overdue");
    assert.ok(data.unassigned >= 1);

    // Every bucket the employee queues use is present, so a dashboard can
    // render them all without guessing which keys exist.
    for (const key of [
      "MISSING_DOCUMENTS",
      "NEEDS_REVIEW",
      "WAITING_CUSTOMER",
      "WAITING_PAYMENT",
      "READY_FOR_PROCESSING",
      "WAITING_PROVIDER",
      "RESULTS_READY",
    ]) {
      assert.ok(key in data.queues, `expected queue bucket ${key}`);
    }
  });

  test("queue-summary is not mistaken for a contact request id", async () => {
    // Guards the route ordering: "/queue-summary" must be declared before
    // "/:id" routes or it would be captured as an id and 404.
    const res = await agent.get("/api/contact-requests/queue-summary");
    assert.equal(res.status, 200);
  });
});
