// U-04/U-05 (docs/umrah-audit): draft file limits count per pilgrim, parallel
// uploads never lose a document→pilgrim link or exceed maxFiles, and a file
// that arrives after the draft was submitted is refused rather than orphaned.
import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";

let service;
let requirementId;
const PEOPLE = 8;

before(async () => {
  const admin = await loginAsSuperAdmin();
  const suffix = uniqueSuffix();
  const res = await admin.post("/api/services").send({ code: `SVC-DRAFT-CONC-${suffix}`, name: `Draft Concurrency ${suffix}`, category: "qa-drafts", basePrice: 100, currency: "SAR" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  service = res.body.data;
  const requirement = await admin.post(`/api/services/${service.id}/requirements`).send({ name: "جواز السفر", type: "DOCUMENT", scope: "TRAVELER", maxFiles: 1 });
  assert.equal(requirement.status, 201, JSON.stringify(requirement.body));
  requirementId = requirement.body.data.id;
});

async function draftWith(count) {
  const created = await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: service.id });
  const token = created.body.data.token;
  const travelers = Array.from({ length: count }, (_, i) => ({ fullName: `Pilgrim ${i + 1}` }));
  const saved = await request(app).patch(`/api/intake-drafts/${token}`).send({ name: "Synthetic Customer", phone: `0914${uniqueSuffix()}`, travelerCount: count, travelers });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  return token;
}

const upload = (token, travelerIndex) =>
  request(app)
    .post(`/api/intake-drafts/${token}/documents`)
    .field("label", `جواز ${travelerIndex}`)
    .field("requirementId", requirementId)
    .field("travelerIndex", String(travelerIndex))
    .attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "passport.png", contentType: "image/png" });

describe("draft uploads under concurrency", () => {
  test("maxFiles=1 is per pilgrim: every pilgrim gets one passport, a second for the same pilgrim is refused", async () => {
    const token = await draftWith(2);
    assert.equal((await upload(token, 0)).status, 201);
    assert.equal((await upload(token, 1)).status, 201, "pilgrim 2's passport is not blocked by pilgrim 1's");
    const again = await upload(token, 0);
    assert.equal(again.status, 400);
    assert.match(JSON.stringify(again.body), /MAX_FILES_REACHED|الحد الأقصى/);
  });

  test(`${PEOPLE} parallel uploads for ${PEOPLE} pilgrims: all stored, every link kept`, async () => {
    const token = await draftWith(PEOPLE);
    const results = await Promise.all(Array.from({ length: PEOPLE }, (_, i) => upload(token, i)));
    assert.deepEqual(results.map((r) => r.status), Array(PEOPLE).fill(201), JSON.stringify(results.map((r) => r.body)));
    const draft = await prisma.intakeDraft.findUnique({ where: { token } });
    const refs = draft.documentTravelerRefs || {};
    assert.equal(Object.keys(refs).length, PEOPLE, "no mapping was overwritten by a parallel upload");
    assert.deepEqual(Object.values(refs).sort(), Array.from({ length: PEOPLE }, (_, i) => String(i)).sort());
    assert.equal(await prisma.contactRequestDocument.count({ where: { draftId: draft.id } }), PEOPLE);
  });

  test("parallel uploads for the same pilgrim never exceed maxFiles", async () => {
    const token = await draftWith(1);
    const results = await Promise.all(Array.from({ length: 6 }, () => upload(token, 0)));
    assert.equal(results.filter((r) => r.status === 201).length, 1, JSON.stringify(results.map((r) => r.status)));
    assert.equal(results.filter((r) => r.status === 400).length, 5);
    const draft = await prisma.intakeDraft.findUnique({ where: { token } });
    assert.equal(await prisma.contactRequestDocument.count({ where: { draftId: draft.id } }), 1);
  });

  test("a file that arrives after the draft was submitted is refused and not left on the draft", async () => {
    const token = await draftWith(1);
    assert.equal((await upload(token, 0)).status, 201);
    const submitted = await request(app).post(`/api/intake-drafts/${token}/submit`).send({});
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    const late = await request(app)
      .post(`/api/intake-drafts/${token}/documents`)
      .field("label", "late")
      .attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "late.png", contentType: "image/png" });
    assert.equal(late.status, 409, JSON.stringify(late.body));
    const draft = await prisma.intakeDraft.findUnique({ where: { token } });
    assert.equal(await prisma.contactRequestDocument.count({ where: { draftId: draft.id } }), 0);
    assert.equal(await prisma.contactRequestDocument.count({ where: { contactRequestId: submitted.body.data.id } }), 1);
  });
});
