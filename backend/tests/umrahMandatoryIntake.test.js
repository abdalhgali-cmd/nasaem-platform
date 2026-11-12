import "./env.js";
import "./helpers/journeyLimits.js";
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import { PDF, testPhone } from "./helpers/workflow.js";
import prisma from "../src/config/database.js";

let admin;
before(async () => { admin = await loginAsSuperAdmin(); });
const travelers = [{ fullName: "TEST المعتمر الأول" }, { fullName: "TEST المعتمر الثاني" }];
const guarantorPhone = "+966501234567";
const date = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);

async function packageFixture(kind) {
  const res = await admin.post("/api/services").send({ code: `TEST-MANDATORY-${kind}-${uniqueSuffix()}`, name: "TEST عمرة إلزامية",
    category: "UMRAH_PACKAGE", basePrice: 0, currency: "SAR", features: [`KIND: ${kind}`] });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const service = res.body.data;
  const checklist = await request(app).get(`/api/services/${service.id}/requirements/public`);
  const passport = checklist.body.data.find(r => r.attachmentType === "umrah_passport");
  assert.ok(passport);
  assert.equal(passport.scope, "TRAVELER"); assert.equal(passport.required, true);
  return { service, passport };
}

async function direct(fixture, { owners = [0, 1], phone = testPhone(), sponsor = guarantorPhone } = {}) {
  let req = request(app).post("/api/contact-requests").field("name", "TEST مقدم العمرة").field("phone", phone)
    .field("message", "TEST طلب عمرة جديد")
    .field("serviceId", fixture.service.id).field("travelerCount", "2").field("travelers", JSON.stringify(travelers))
    .field("preferredTravelDate", date).field("documentLabels", JSON.stringify(owners.map(i => `جواز ${i}`)))
    .field("documentRequirementIds", JSON.stringify(owners.map(() => fixture.passport.id)))
    .field("documentTravelerIndexes", JSON.stringify(owners.map(String)));
  if (sponsor != null) req = req.field("guarantorPhone", sponsor);
  for (const i of owners) req = req.attach("documents", PDF(), { filename: `passport-${i}.pdf`, contentType: "application/pdf" });
  return { res: await req, phone };
}

for (const kind of ["VISA_ONLY", "AIR", "SEA"]) test(`${kind}: no request without sponsor and one passport per pilgrim`, async () => {
  const fixture = await packageFixture(kind);
  for (const sponsor of [null, "", "abc"]) {
    const { res, phone } = await direct(fixture, { sponsor });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body.code, sponsor === "abc" ? "GUARANTOR_PHONE_INVALID" : "GUARANTOR_PHONE_REQUIRED");
    assert.equal(await prisma.contactRequest.count({ where: { phone } }), 0);
  }
  for (const owners of [[], [0]]) {
    const { res, phone } = await direct(fixture, { owners });
    assert.equal(res.status, 400, JSON.stringify(res.body)); assert.equal(res.body.code, "UMRAH_PASSPORT_REQUIRED");
    assert.equal(await prisma.contactRequest.count({ where: { phone } }), 0);
  }
  const { res } = await direct(fixture);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const stored = await prisma.contactRequest.findUnique({ where: { id: res.body.data.id }, include: { travelers: true, documents: true } });
  assert.equal(stored.travelers.length, 2);
  assert.equal(new Set(stored.documents.map(d => d.travelerId)).size, 2);
  assert.ok(stored.documents.every(d => d.travelerId));
});

test("a draft remains resumable after rejection; adding the second pilgrim's passport allows submission", async () => {
  const fixture = await packageFixture("VISA_ONLY");
  const made = await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: fixture.service.id });
  assert.equal(made.status, 201, JSON.stringify(made.body)); const token = made.body.data.token;
  const url = "/api/intake-drafts/current";
  const phone = testPhone();
  const saved = await request(app).patch(url).set("X-Draft-Token", token).send({ name: "TEST مسودة عمرة", phone, travelerCount: 2, travelers });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const submit = data => request(app).post(`${url}/submit`).set("X-Draft-Token", token).send(data);
  assert.equal((await submit({})).body.code, "GUARANTOR_PHONE_REQUIRED");
  assert.equal((await submit({ guarantorPhone })).body.code, "UMRAH_PASSPORT_REQUIRED");
  for (const index of [0, 1]) {
    const uploaded = await request(app).post(`${url}/documents`).set("X-Draft-Token", token)
      .field("label", `جواز ${index}`).field("requirementId", fixture.passport.id).field("travelerIndex", String(index))
      .attach("file", PDF(), { filename: `passport-${index}.pdf`, contentType: "application/pdf" });
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
    if (index === 0) {
      const refused = await submit({ guarantorPhone });
      assert.equal(refused.status, 400); assert.equal(refused.body.code, "UMRAH_PASSPORT_REQUIRED");
      assert.equal(await prisma.contactRequest.count({ where: { phone } }), 0);
    }
  }
  const accepted = await submit({ guarantorPhone });
  assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
});

test("Umrah passport cannot be disabled, made case-scoped, deleted or duplicated by an admin", async () => {
  const fixture = await packageFixture("VISA_ONLY");
  const url = `/api/services/${fixture.service.id}/requirements`;
  for (const data of [{ required: false }, { active: false }, { scope: "CASE" }]) {
    assert.equal((await admin.patch(`/api/services/requirements/${fixture.passport.id}`).send(data)).status, 400);
  }
  assert.equal((await admin.delete(`/api/services/requirements/${fixture.passport.id}`)).status, 400);
  const again = await admin.post(url).send({ name: "صورة الجواز", type: "DOCUMENT", scope: "TRAVELER" });
  assert.equal(again.status, 201); assert.equal(again.body.data.id, fixture.passport.id);
  assert.equal(await prisma.visaRequirement.count({ where: { serviceId: fixture.service.id, attachmentType: "umrah_passport" } }), 1);
});

test("adding a visa type cannot bypass the Umrah package requirements on either submission path", async () => {
  const fixture = await packageFixture("VISA_ONLY");
  const visa = await prisma.visaType.findUnique({ where: { code: "VISA-WORK" } });
  const phone = testPhone();
  const direct = await request(app).post("/api/contact-requests").send({ name: "TEST اختيار متعارض", phone,
    message: "TEST عمرة مع نوع آخر", serviceId: fixture.service.id, visaTypeId: visa.id, travelers, travelerCount: 2 });
  assert.equal(direct.status, 400); assert.equal(direct.body.code, "UMRAH_PACKAGE_SELECTION_INVALID");
  const draft = await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: fixture.service.id, visaTypeId: visa.id });
  assert.equal(draft.status, 201, JSON.stringify(draft.body));
  const token = draft.body.data.token;
  await request(app).patch("/api/intake-drafts/current").set("X-Draft-Token", token).send({ name: "TEST اختيار متعارض", phone, travelers, travelerCount: 2 });
  const submitted = await request(app).post("/api/intake-drafts/current/submit").set("X-Draft-Token", token).send({});
  assert.equal(submitted.status, 400); assert.equal(submitted.body.code, "UMRAH_PACKAGE_SELECTION_INVALID");
  assert.equal(await prisma.contactRequest.count({ where: { phone } }), 0);
});
