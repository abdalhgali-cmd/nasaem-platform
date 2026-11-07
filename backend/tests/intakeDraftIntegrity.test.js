// AUDIT-00 G-08 / G-09: a draft's documents stay with the traveler they were
// uploaded for, and one draft makes exactly one request even when it is
// submitted twice at once. Its own file: the public submit limit (5 per
// window) is per process.
import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";

let service;
let requirementId;

before(async () => {
  const admin = await loginAsSuperAdmin();
  const suffix = uniqueSuffix();
  const res = await admin.post("/api/services").send({ code: `SVC-DRAFT-INT-${suffix}`, name: `Draft Integrity ${suffix}`, category: "qa-drafts", basePrice: 100, currency: "SAR" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  service = res.body.data;
  const requirement = await admin.post(`/api/services/${service.id}/requirements`).send({ name: "جواز السفر", type: "DOCUMENT", scope: "TRAVELER", maxFiles: 2 });
  requirementId = requirement.body.data.id;
});

async function draftWith(travelers) {
  const created = await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: service.id });
  const token = created.body.data.token;
  const saved = await request(app).patch(`/api/intake-drafts/${token}`).send({ name: "Synthetic Customer", phone: `0913${uniqueSuffix()}`, travelerCount: travelers.length, travelers });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  return token;
}

function upload(token, travelerIndex) {
  return request(app)
    .post(`/api/intake-drafts/${token}/documents`)
    .field("label", `جواز ${travelerIndex}`)
    .field("requirementId", requirementId)
    .field("travelerIndex", String(travelerIndex))
    .attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "passport.png", contentType: "image/png" });
}

describe("draft documents keep their traveler (G-08)", () => {
  test("an unnamed first traveler does not shift the second traveler's passport", async () => {
    const token = await draftWith([{ fullName: "" }, { fullName: "Traveler B" }]);
    const unnamedDoc = (await upload(token, 0)).body.data.id;
    const travelerBDoc = (await upload(token, 1)).body.data.id;
    const submitted = await request(app).post(`/api/intake-drafts/${token}/submit`).send({});
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    const row = await prisma.contactRequest.findUnique({ where: { id: submitted.body.data.id }, include: { travelers: true, documents: true } });
    assert.equal(row.travelers.length, 1);
    const travelerB = row.travelers[0];
    assert.equal(travelerB.fullName, "Traveler B");
    assert.equal(row.documents.find((d) => d.id === travelerBDoc).travelerId, travelerB.id, "B's passport stays with B");
    assert.equal(row.documents.find((d) => d.id === unnamedDoc).travelerId, null, "the unnamed traveler's file is not given to B");
  });
});

describe("one draft, one request (G-09)", () => {
  test("two concurrent submits create one request; the other is refused", async () => {
    const token = await draftWith([{ fullName: "Traveler A" }]);
    await upload(token, 0);
    const before = await prisma.contactRequest.count();
    const results = await Promise.all([1, 2].map(() => request(app).post(`/api/intake-drafts/${token}/submit`).send({})));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409], JSON.stringify(results.map((r) => r.body)));
    assert.equal(await prisma.contactRequest.count(), before + 1);
    const draft = await prisma.intakeDraft.findUnique({ where: { token } });
    const winner = results.find((r) => r.status === 201).body.data.id;
    assert.equal(draft.submittedContactRequestId, winner);
    const documents = await prisma.contactRequestDocument.findMany({ where: { contactRequestId: winner } });
    assert.equal(documents.length, 1, "the document belongs to the one request");
  });
});
