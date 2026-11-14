import "./env.js";
import "./helpers/journeyLimits.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request, uniqueSuffix } from "./helpers/api.js";
import { getPublicChecklist } from "../src/modules/requirements/requirements.service.js";
import { validateServiceIntakeProfile, SERVICE_INTAKE_PROFILES } from "../src/modules/requirements/service-intake-profiles.js";

async function fixture(code) {
  const appointment = code === "SVC-TASHEEL";
  const item = await prisma[appointment ? "service" : "visaType"].findUnique({ where: { code } });
  const scope = appointment ? { serviceId: item.id } : { visaTypeId: item.id };
  const requirements = await getPublicChecklist(scope);
  const fields = requirements.filter(r => SERVICE_INTAKE_PROFILES.find(p => p.code === code).fields.some(f => f.key === r.attachmentType));
  assert.equal(fields.filter(r => r.required).length, appointment ? 3 : 2);
  const answers = Object.fromEntries(fields.filter(r => r.required).map(r => [r.id, r.type === "SELECT" ? r.options[0].value : "Sudan"]));
  return { scope, requirements, fields, answers, input: { ...scope, name: "TEST خدمة", phone: `091${uniqueSuffix().slice(-7)}`, message: "TEST intake profile", travelerCount: 1, travelers: [{ fullName: "TEST متقدم" }] } };
}

test("direct intake requires the published appointment/visa context before creating a request", async () => {
  for (const code of ["SVC-TASHEEL", "VISA-INTERNATIONAL"]) {
    const f = await fixture(code);
    const before = await prisma.contactRequest.count();
    const missing = await request(app).post("/api/contact-requests").send(f.input);
    assert.equal(missing.status, 400, JSON.stringify(missing.body));
    assert.equal(missing.body.code, "SERVICE_INTAKE_INCOMPLETE");
    assert.equal(await prisma.contactRequest.count(), before);
    const valid = await request(app).post("/api/contact-requests").send({ ...f.input, answers: f.answers });
    assert.equal(valid.status, 201, JSON.stringify(valid.body));
    const row = await prisma.contactRequest.findUnique({ where: { id: valid.body.data.id }, include: { invoice: true } });
    assert.equal(row.pricingMode, "QUOTE", "an intake inquiry is not a confirmed booking or visa");
    assert.equal(row.invoice, null);
    assert.deepEqual(row.intakeData.answers, f.answers);
  }
});

test("a draft with missing context remains resumable and completes after the required answers are provided", async () => {
  const f = await fixture("SVC-TASHEEL");
  const created = await request(app).post("/api/intake-drafts").send({ ...f.scope, serviceKind: "package" });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const token = created.body.data.token;
  assert.equal((await request(app).patch(`/api/intake-drafts/${token}`).send(f.input)).status, 200);
  const before = await prisma.contactRequest.count();
  const rejected = await request(app).post(`/api/intake-drafts/${token}/submit`).send({});
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.code, "SERVICE_INTAKE_INCOMPLETE");
  assert.equal(await prisma.contactRequest.count(), before);
  const restored = await request(app).get(`/api/intake-drafts/${token}`);
  assert.equal(restored.body.data.name, f.input.name);
  assert.equal((await request(app).patch(`/api/intake-drafts/${token}`).send({ answers: f.answers })).status, 200);
  assert.equal((await request(app).post(`/api/intake-drafts/${token}/submit`).send({})).status, 201);
});

test("invalid select values, blank countries, past preferred dates and unnamed applicants are refused; optional/conditional questions stay optional", async () => {
  const f = await fixture("SVC-TASHEEL");
  const selection = f.fields.find(r => r.type === "SELECT");
  const country = f.fields.find(r => r.attachmentType === "tasheel_application_country");
  const date = f.fields.find(r => r.type === "DATE");
  const base = { requirements: f.requirements, travelers: f.input.travelers, answers: f.answers };
  assert.equal(validateServiceIntakeProfile("SVC-TASHEEL", base), null);
  const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  assert.equal(validateServiceIntakeProfile("SVC-TASHEEL", { ...base, answers: { ...f.answers, [date.id]: future } }), null);
  for (const answers of [{ ...f.answers, [selection.id]: "NOT_A_KIND" }, { ...f.answers, [country.id]: " " }, { ...f.answers, [date.id]: "2000-01-01" }, { ...f.answers, [date.id]: "2026-02-30" }]) {
    assert.equal(validateServiceIntakeProfile("SVC-TASHEEL", { ...base, answers }).error, "SERVICE_INTAKE_INCOMPLETE");
  }
  assert.equal(validateServiceIntakeProfile("SVC-TASHEEL", { ...base, travelers: [] }).details.travelerNamesRequired, true);
  assert.equal(validateServiceIntakeProfile("SVC-TASHEEL", { ...base, answers: {}, requirements: f.requirements.map(r => ({ ...r, required: false })) }), null);
  assert.equal(validateServiceIntakeProfile("SVC-TASHEEL", { ...base, answers: {}, requirements: [{ ...country, conditionRequirementId: "switch", conditionOperator: "EQUALS", conditionValue: "yes" }] }), null);
  assert.equal(validateServiceIntakeProfile("VISA-CUSTOM", { requirements: f.requirements }), null);
});
