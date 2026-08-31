import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// Smart Case Operations — Release A: document versioning (replacing a
// rejected upload) and traveler-scoped document ownership/IDOR. Split from
// smartRequirements.test.js to stay under the shared 5-per-15min limiter on
// the public POST /api/contact-requests endpoint (this file makes 4 real
// submissions) — see contactRequestDocuments.test.js's own comment on the
// same constraint. Deliberately its own local createService(), not an
// import from that file: importing a node:test file for a helper also
// re-registers (and re-runs) every describe/test it defines at module-eval
// time, silently doubling this process's real submission count.
async function createService(agent, overrides = {}) {
  const suffix = uniqueSuffix();
  const res = await agent.post("/api/services").send({
    code: `SVC-SMARTDOC-${suffix}`,
    name: `Smart Case Documents Test ${suffix}`,
    category: "qa-smart-requirements",
    basePrice: 100,
    currency: "SAR",
    ...overrides,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

async function loginTrackingAgent(phone) {
  const agent = request.agent(app);
  const requestRes = await request(app).post("/api/tracking/request-code").send({ phone });
  const verifyRes = await agent.post("/api/tracking/verify-code").send({ phone, code: requestRes.body.debugCode });
  assert.equal(verifyRes.status, 200, JSON.stringify(verifyRes.body));
  return agent;
}

function attachPng(req) {
  return req.attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "doc.png", contentType: "image/png" });
}

describe("document versioning and traveler-scoped document ownership", () => {
  let agent;
  let service;
  let requirementId;

  before(async () => {
    agent = await loginAsSuperAdmin();
    service = await createService(agent);
    const reqRes = await agent.post(`/api/services/${service.id}/requirements`).send({
      name: "جواز السفر",
      type: "DOCUMENT",
      scope: "CASE",
      maxFiles: 1,
    });
    requirementId = reqRes.body.data.id;
  });

  test("replacing a rejected requirement-linked document supersedes the old row and frees its maxFiles slot", async () => {
    const phone = `096${uniqueSuffix()}`;
    const createRes = await request(app)
      .post("/api/contact-requests")
      .field("name", "Versioning Test")
      .field("phone", phone)
      .field("message", "اختبار استبدال المستند")
      .field("serviceId", service.id)
      .field("documentLabels", JSON.stringify(["جواز السفر"]))
      .field("documentRequirementIds", JSON.stringify([requirementId]))
      .attach("documents", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "v1.png", contentType: "image/png" });
    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
    const contactRequestId = createRes.body.data.id;

    const listRes1 = await agent.get("/api/contact-requests?limit=50");
    const firstDocId = listRes1.body.data.find((r) => r.id === contactRequestId).documents[0].id;

    const rejectRes = await agent
      .patch(`/api/contact-requests/${contactRequestId}/documents/${firstDocId}/status`)
      .send({ status: "REJECTED", reviewNote: "غير واضح" });
    assert.equal(rejectRes.status, 200);

    const trackingAgent = await loginTrackingAgent(phone);
    const reuploadRes = await attachPng(
      trackingAgent
        .post(`/api/tracking/requests/${contactRequestId}/documents`)
        .field("label", "جواز السفر")
        .field("requirementId", requirementId)
    );
    assert.equal(reuploadRes.status, 201, JSON.stringify(reuploadRes.body));

    const listRes2 = await agent.get("/api/contact-requests?limit=50");
    const found = listRes2.body.data.find((r) => r.id === contactRequestId);
    assert.equal(found.documents.length, 2, "the rejected original and the replacement both survive");

    const original = found.documents.find((d) => d.id === firstDocId);
    const replacement = found.documents.find((d) => d.id !== firstDocId);
    assert.ok(original.supersededAt, "the rejected original should be marked superseded");
    assert.equal(replacement.supersededAt, null, "the new upload is the current version");
    assert.equal(replacement.status, "PENDING");
  });

  test("a customer cannot tag an upload with a traveler that belongs to a different contact request (IDOR)", async () => {
    const phoneA = `097${uniqueSuffix()}`;
    const createA = await request(app)
      .post("/api/contact-requests")
      .field("name", "Request A")
      .field("phone", phoneA)
      .field("message", "طلب أ")
      .field("serviceId", service.id)
      .field("travelers", JSON.stringify([{ fullName: "Traveler A" }]));
    assert.equal(createA.status, 201);

    const phoneB = `098${uniqueSuffix()}`;
    const createB = await request(app)
      .post("/api/contact-requests")
      .field("name", "Request B")
      .field("phone", phoneB)
      .field("message", "طلب ب")
      .field("serviceId", service.id)
      .field("travelers", JSON.stringify([{ fullName: "Traveler B" }]));
    assert.equal(createB.status, 201);

    const listRes = await agent.get("/api/contact-requests?limit=50");
    const requestB = listRes.body.data.find((r) => r.id === createB.body.data.id);
    const travelerBId = requestB.travelers[0].id;

    const trackingAgentA = await loginTrackingAgent(phoneA);
    const crossRes = await attachPng(
      trackingAgentA
        .post(`/api/tracking/requests/${createA.body.data.id}/documents`)
        .field("label", "مستند")
        .field("travelerId", travelerBId)
    );
    assert.equal(crossRes.status, 400);
    assert.match(crossRes.body.message, /traveler/i);
  });

  test("a customer can upload a document scoped to their own traveler via tracking", async () => {
    const phone = `099${uniqueSuffix()}`;
    const createRes = await request(app)
      .post("/api/contact-requests")
      .field("name", "Own Traveler Upload")
      .field("phone", phone)
      .field("message", "رفع مستند لمسافر خاص بي")
      .field("serviceId", service.id)
      .field("travelers", JSON.stringify([{ fullName: "My Traveler" }]));
    assert.equal(createRes.status, 201);

    const listRes = await agent.get("/api/contact-requests?limit=50");
    const travelerId = listRes.body.data.find((r) => r.id === createRes.body.data.id).travelers[0].id;

    const trackingAgent = await loginTrackingAgent(phone);
    const uploadRes = await attachPng(
      trackingAgent
        .post(`/api/tracking/requests/${createRes.body.data.id}/documents`)
        .field("label", "مستند المسافر")
        .field("travelerId", travelerId)
    );
    assert.equal(uploadRes.status, 201, JSON.stringify(uploadRes.body));
    assert.equal(uploadRes.body.data.travelerId, travelerId);
  });
});
