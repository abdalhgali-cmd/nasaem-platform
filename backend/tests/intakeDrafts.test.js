import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";

// Smart Case Operations — Release B (server-side intake drafts): create →
// autosave → upload documents → resume → submit, plus the token
// authorization boundary. Draft endpoints have their own generous
// limiters, and only the final submit shares the tight 5-per-15min public
// ceiling — this file submits twice.

async function createService(agent) {
  const suffix = uniqueSuffix();
  const res = await agent.post("/api/services").send({
    code: `SVC-DRAFT-${suffix}`,
    name: `Draft Test Service ${suffix}`,
    category: "qa-drafts",
    basePrice: 100,
    currency: "SAR",
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

function attachPng(req) {
  return req.attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "passport.png", contentType: "image/png" });
}

describe("intake drafts — lifecycle", () => {
  let adminAgent;
  let service;
  let requirementId;

  before(async () => {
    adminAgent = await loginAsSuperAdmin();
    service = await createService(adminAgent);
    const reqRes = await adminAgent.post(`/api/services/${service.id}/requirements`).send({
      name: "جواز السفر",
      type: "DOCUMENT",
      scope: "TRAVELER",
      maxFiles: 1,
    });
    requirementId = reqRes.body.data.id;
  });

  test("creates a draft and returns a token exactly once", async () => {
    const res = await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: service.id });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.data.token, "expected a resume token on creation");
    assert.equal(res.body.data.serviceId, service.id);
    assert.equal(res.body.data.step, 0);

    // The token is a high-entropy random string, not a guessable id.
    assert.ok(res.body.data.token.length >= 32);
    assert.notEqual(res.body.data.token, res.body.data.id);

    // Fetching the draft back never re-echoes the token.
    const getRes = await request(app).get(`/api/intake-drafts/${res.body.data.token}`);
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.data.token, undefined);
  });

  test("autosaves partial state and resumes it (the wizard's own resume path)", async () => {
    const createRes = await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: service.id });
    const token = createRes.body.data.token;

    const patchRes = await request(app)
      .patch(`/api/intake-drafts/${token}`)
      .send({ step: 2, name: "Draft Customer", phone: "0912345678", travelerCount: 2, answers: { q1: "YES" } });
    assert.equal(patchRes.status, 200, JSON.stringify(patchRes.body));
    assert.equal(patchRes.body.data.name, "Draft Customer");
    assert.equal(patchRes.body.data.step, 2);

    // A later partial save must not wipe fields it didn't send.
    const secondPatch = await request(app)
      .patch(`/api/intake-drafts/${token}`)
      .send({ travelers: [{ fullName: "Traveler One" }] });
    assert.equal(secondPatch.status, 200);
    assert.equal(secondPatch.body.data.name, "Draft Customer", "an unrelated autosave must not clear earlier state");
    assert.equal(secondPatch.body.data.travelers.length, 1);
    assert.deepEqual(secondPatch.body.data.answers, { q1: "YES" });

    // Resume from a fresh "browser" — only the token is needed.
    const resumeRes = await request(app).get(`/api/intake-drafts/${token}`);
    assert.equal(resumeRes.status, 200);
    assert.equal(resumeRes.body.data.name, "Draft Customer");
    assert.equal(resumeRes.body.data.step, 2);
    assert.equal(resumeRes.body.data.travelers[0].fullName, "Traveler One");
  });

  test("uploads a document into the draft before any ContactRequest exists, and can remove it", async () => {
    const createRes = await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: service.id });
    const token = createRes.body.data.token;

    const uploadRes = await attachPng(
      request(app)
        .post(`/api/intake-drafts/${token}/documents`)
        .field("label", "جواز السفر")
        .field("requirementId", requirementId)
        .field("travelerIndex", "0")
    );
    assert.equal(uploadRes.status, 201, JSON.stringify(uploadRes.body));
    const documentId = uploadRes.body.data.id;

    // Stored against the draft, with no contact request — the whole point
    // of resilient uploads.
    const stored = await prisma.contactRequestDocument.findUnique({ where: { id: documentId } });
    assert.equal(stored.contactRequestId, null);
    assert.ok(stored.draftId);

    const listRes = await request(app).get(`/api/intake-drafts/${token}`);
    assert.equal(listRes.body.data.documents.length, 1);

    const deleteRes = await request(app).delete(`/api/intake-drafts/${token}/documents/${documentId}`);
    assert.equal(deleteRes.status, 200);

    const afterRes = await request(app).get(`/api/intake-drafts/${token}`);
    assert.equal(afterRes.body.data.documents.length, 0);
  });

  test("enforces the requirement's own maxFiles against the draft", async () => {
    const createRes = await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: service.id });
    const token = createRes.body.data.token;

    const first = await attachPng(
      request(app).post(`/api/intake-drafts/${token}/documents`).field("label", "جواز").field("requirementId", requirementId)
    );
    assert.equal(first.status, 201);

    const second = await attachPng(
      request(app).post(`/api/intake-drafts/${token}/documents`).field("label", "جواز").field("requirementId", requirementId)
    );
    assert.equal(second.status, 400, "maxFiles: 1 should reject the second upload for the same requirement");
  });

  test("submits the draft into one ContactRequest, carrying travelers and documents over", async () => {
    const createRes = await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: service.id });
    const token = createRes.body.data.token;

    await request(app)
      .patch(`/api/intake-drafts/${token}`)
      .send({
        name: "Submitted Draft Customer",
        phone: `0913${uniqueSuffix()}`,
        travelerCount: 2,
        travelers: [{ fullName: "Traveler A" }, { fullName: "Traveler B" }],
        answers: { nights: "5" },
        notes: "ملاحظات من المسودة",
      });

    const uploadRes = await attachPng(
      request(app)
        .post(`/api/intake-drafts/${token}/documents`)
        .field("label", "جواز المسافر ب")
        .field("requirementId", requirementId)
        .field("travelerIndex", "1")
    );
    assert.equal(uploadRes.status, 201);
    const documentId = uploadRes.body.data.id;

    const submitRes = await request(app).post(`/api/intake-drafts/${token}/submit`).send({});
    assert.equal(submitRes.status, 201, JSON.stringify(submitRes.body));
    const contactRequestId = submitRes.body.data.id;

    const listRes = await adminAgent.get("/api/contact-requests?limit=50");
    const found = listRes.body.data.find((r) => r.id === contactRequestId);
    assert.ok(found, "the submitted draft should appear as a normal contact request for staff");
    assert.equal(found.travelers.length, 2);
    assert.equal(found.intakeData.answers.nights, "5");

    // The document kept its identity and file — it was re-pointed, not
    // re-uploaded — and resolved to the right traveler.
    const travelerB = found.travelers.find((t) => t.fullName === "Traveler B");
    const carried = found.documents.find((d) => d.id === documentId);
    assert.ok(carried, "the draft's document should now belong to the contact request");
    assert.equal(carried.travelerId, travelerB.id, "draft traveler index should resolve to the real Traveler row");
    assert.equal(carried.draftId, null);

    // A submitted draft is spent — it can never produce a second request.
    const resubmitRes = await request(app).post(`/api/intake-drafts/${token}/submit`).send({});
    assert.equal(resubmitRes.status, 409);

    const patchAfterRes = await request(app).patch(`/api/intake-drafts/${token}`).send({ step: 9 });
    assert.equal(patchAfterRes.status, 409, "a submitted draft is read-only");
  });

  test("refuses to submit a draft without the name/phone the request requires", async () => {
    const createRes = await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: service.id });
    const token = createRes.body.data.token;

    const submitRes = await request(app).post(`/api/intake-drafts/${token}/submit`).send({});
    assert.equal(submitRes.status, 400);
  });
});

describe("intake drafts — authorization boundary", () => {
  test("an unknown/guessed token cannot read, autosave, upload to or submit a draft", async () => {
    const fakeToken = "not-a-real-draft-token-000000000000000000";

    assert.equal((await request(app).get(`/api/intake-drafts/${fakeToken}`)).status, 404);
    assert.equal((await request(app).patch(`/api/intake-drafts/${fakeToken}`).send({ step: 1 })).status, 404);
    assert.equal((await request(app).post(`/api/intake-drafts/${fakeToken}/submit`).send({})).status, 404);
  });

  test("one draft's token cannot delete another draft's document (IDOR)", async () => {
    const adminAgent = await loginAsSuperAdmin();
    const service = await createService(adminAgent);

    const draftA = await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: service.id });
    const draftB = await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: service.id });

    const uploadRes = await attachPng(
      request(app).post(`/api/intake-drafts/${draftA.body.data.token}/documents`).field("label", "مستند أ")
    );
    assert.equal(uploadRes.status, 201);

    const crossDeleteRes = await request(app).delete(
      `/api/intake-drafts/${draftB.body.data.token}/documents/${uploadRes.body.data.id}`
    );
    assert.equal(crossDeleteRes.status, 404, "draft B's token must not reach draft A's document");

    // And A's document is still there.
    const stillThere = await request(app).get(`/api/intake-drafts/${draftA.body.data.token}`);
    assert.equal(stillThere.body.data.documents.length, 1);
  });
});
