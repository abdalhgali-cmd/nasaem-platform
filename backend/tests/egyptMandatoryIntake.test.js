import "./env.js";
import "./helpers/journeyLimits.js";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";
import { validateEgyptIntake } from "../src/modules/egypt-clearance/egypt-intake-validation.js";
import { submitDraft } from "../src/modules/intake-drafts/intake-drafts.service.js";
import { terminateOcrWorker } from "../src/modules/passport-ocr/passport-ocr.service.js";

let visa, passport, entry;
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const travelers = () => [0, 1].map(i => ({ fullName: `TEST-EGYPT مسافر ${i + 1}`, passportNo: `SYNTH${i + 1}`, birthDate: "1990-01-01", isPrimary: i === 0 }));
const data = () => ({ name: "TEST-EGYPT إلزام الجواز", phone: `091${uniqueSuffix().slice(-7)}`, message: "TEST-EGYPT synthetic intake", visaTypeId: visa.id, travelerCount: 2, travelers: travelers(), answers: { [entry.id]: "AIR" } });
function direct(input, owners) {
  let req = request(app).post("/api/contact-requests");
  for (const [key, value] of Object.entries(input)) req = req.field(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  req = req.field("documentRequirementIds", JSON.stringify(owners.map(() => passport.id)))
    .field("documentLabels", JSON.stringify(owners.map(() => "TEST-EGYPT جواز")))
    .field("documentTravelerIndexes", JSON.stringify(owners));
  for (const owner of owners) req = req.attach("documents", png, { filename: `synthetic-${owner || "unassigned"}.png`, contentType: "image/png" });
  return req;
}
async function draft() {
  const created = await request(app).post("/api/intake-drafts").send({ serviceKind: "visa", serviceId: visa.serviceId, visaTypeId: visa.id });
  assert.equal(created.status, 201);
  const token = created.body.data.token;
  const patched = await request(app).patch(`/api/intake-drafts/${token}`).send({ ...data(), serviceKind: "visa", serviceId: visa.serviceId });
  assert.equal(patched.status, 200, JSON.stringify(patched.body));
  return token;
}
const upload = token => index => request(app).post(`/api/intake-drafts/${token}/documents`)
  .field("label", "TEST-EGYPT جواز").field("requirementId", passport.id).field("travelerIndex", String(index))
  .attach("file", png, { filename: `synthetic-${index}.png`, contentType: "image/png" });

before(async () => {
  visa = await prisma.visaType.findUnique({ where: { code: "VISA-EGYPT-CLEARANCE" } });
  const requirements = await prisma.visaRequirement.findMany({ where: { visaTypeId: visa.id, active: true } });
  passport = requirements.find(r => r.attachmentType === "passport_copy");
  entry = requirements.find(r => r.attachmentType === "egypt_entry_mode");
});
after(async () => { await terminateOcrWorker(); });

test("direct: zero passports and a group with only the first passport create nothing; both passports keep their owners", async () => {
  const before = await prisma.contactRequest.count();
  for (const owners of [[], ["0"], [""], ["0", "0"]]) {
    const result = await direct(data(), owners);
    assert.equal(result.status, 400, JSON.stringify(result.body));
  }
  assert.equal(await prisma.contactRequest.count(), before);
  const result = await direct(data(), ["0", "1"]);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const row = await prisma.contactRequest.findUnique({ where: { id: result.body.data.id }, include: { travelers: { orderBy: { sortOrder: "asc" } }, documents: true } });
  for (let i = 0; i < 2; i++) assert.ok(row.documents.some(d => d.travelerId === row.travelers[i].id));
});

test("draft: missing second passport is refused inside the service too; files survive and the same draft can be completed", async () => {
  const token = await draft();
  assert.equal((await upload(token)(0)).status, 201);
  const before = await prisma.contactRequest.count();
  const serviceResult = await submitDraft(token);
  assert.equal(serviceResult.error, "EGYPT_CLEARANCE_INCOMPLETE");
  assert.deepEqual(serviceResult.details.travelerIssues, [{ index: 1, fields: ["passportDocument"] }]);
  const rejected = await request(app).post(`/api/intake-drafts/${token}/submit`).send({});
  assert.equal(rejected.status, 400);
  assert.equal(await prisma.contactRequest.count(), before);
  const restored = await request(app).get(`/api/intake-drafts/${token}`);
  assert.equal(restored.body.data.documents.length, 1);
  assert.equal((await upload(token)(1)).status, 201);
  const result = await request(app).post(`/api/intake-drafts/${token}/submit`).send({});
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal((await request(app).post(`/api/intake-drafts/${token}/submit`).send({})).status, 409);
  assert.equal(await prisma.contactRequest.count(), before + 1);
});

test("each traveler's reviewed passport number and date are required; a future birthday is refused", async () => {
  for (const changed of [{ passportNo: "" }, { birthDate: "" }, { birthDate: "2999-01-01" }]) {
    const input = data(); Object.assign(input.travelers[1], changed);
    const result = await direct(input, ["0", "1"]);
    assert.equal(result.status, 400, JSON.stringify(result.body));
    assert.equal(result.body.code, "EGYPT_CLEARANCE_INCOMPLETE");
    assert.equal(result.body.details.travelerIssues[0].index, 1);
  }
});

test("birth dates use real calendar dates; count, empty names and superseded/unassigned passports cannot satisfy the contract", () => {
  const requirements = [{ id: "passport", type: "DOCUMENT", attachmentType: "passport_copy", scope: "TRAVELER" }];
  const valid = { name: "TEST", phone: "0910000000", travelers: travelers(), travelerCount: 2, requirements, documents: [0,1].map(travelerIndex => ({ requirementId: "passport", travelerIndex })) };
  assert.equal(validateEgyptIntake(valid), null);
  for (const day of ["1990-02-30", "not-a-date", "2999-01-01", "1990-01-01invalid"]) {
    const input = structuredClone(valid); input.travelers[1].birthDate = day;
    assert.ok(validateEgyptIntake(input).details.fields.includes("birthDate"));
  }
  assert.ok(validateEgyptIntake({ ...valid, travelerCount: 3 }).details.fields.includes("travelers"));
  assert.ok(validateEgyptIntake({ ...valid, travelers: [] }).details.fields.includes("travelers"));
  const unnamed = structuredClone(valid); unnamed.travelers[1].fullName = " ";
  assert.ok(validateEgyptIntake(unnamed).details.fields.includes("fullName"));
  assert.ok(validateEgyptIntake({ ...valid, documents: [{ requirementId: "passport", travelerIndex: 0 }, { requirementId: "passport", travelerIndex: 1, supersededAt: new Date() }] }).details.fields.includes("passportDocument"));
});

test("service-only Egypt application cannot bypass the passport checklist", async () => {
  const input = data(); delete input.visaTypeId; input.serviceId = visa.serviceId;
  const result = await request(app).post("/api/contact-requests").send(input);
  assert.equal(result.status, 400);
  assert.equal(result.body.code, "EGYPT_VARIANT_REQUIRED");
});
