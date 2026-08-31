import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import { requirementApplies } from "../src/modules/requirements/requirements.service.js";

// Smart Case Operations — Release A: requirement type/scope/condition on the
// existing VisaRequirement checklist engine, and structured Traveler records
// on ContactRequest. See schema.prisma's RequirementType/RequirementScope/
// RequirementConditionOperator + Traveler model comments for the design.
//
// Split across two files (this one plus smartCaseDocuments.test.js) to stay
// under the shared 5-per-15min limiter on the public POST /api/contact-
// requests endpoint — see contactRequestDocuments.test.js's own comment on
// the same constraint. This file keeps its real submissions to 4.

async function createService(agent, overrides = {}) {
  const suffix = uniqueSuffix();
  const res = await agent.post("/api/services").send({
    code: `SVC-SMART-${suffix}`,
    name: `Smart Requirements Test ${suffix}`,
    category: "qa-smart-requirements",
    basePrice: 100,
    currency: "SAR",
    ...overrides,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

describe("requirementApplies() — conditional requirement evaluation", () => {
  test("a requirement with no condition always applies", () => {
    assert.equal(requirementApplies({ conditionRequirementId: null, conditionOperator: null }, {}), true);
  });

  test("EQUALS applies only when the referenced answer matches", () => {
    const req = { conditionRequirementId: "r1", conditionOperator: "EQUALS", conditionValue: "YES" };
    assert.equal(requirementApplies(req, { r1: "YES" }), true);
    assert.equal(requirementApplies(req, { r1: "NO" }), false);
    assert.equal(requirementApplies(req, {}), false);
  });

  test("NOT_EQUALS applies only when the referenced answer differs", () => {
    const req = { conditionRequirementId: "r1", conditionOperator: "NOT_EQUALS", conditionValue: "SD" };
    assert.equal(requirementApplies(req, { r1: "EG" }), true);
    assert.equal(requirementApplies(req, { r1: "SD" }), false);
  });

  test("GREATER_THAN/LESS_THAN compare numerically and fail closed on bad input", () => {
    const gt = { conditionRequirementId: "r1", conditionOperator: "GREATER_THAN", conditionValue: "3" };
    assert.equal(requirementApplies(gt, { r1: "5" }), true);
    assert.equal(requirementApplies(gt, { r1: "2" }), false);
    assert.equal(requirementApplies(gt, { r1: "not-a-number" }), false);
    assert.equal(requirementApplies(gt, {}), false);

    const lt = { conditionRequirementId: "r1", conditionOperator: "LESS_THAN", conditionValue: "3" };
    assert.equal(requirementApplies(lt, { r1: "1" }), true);
    assert.equal(requirementApplies(lt, { r1: "9" }), false);
  });
});

describe("smart requirements — type/scope/options/condition CRUD", () => {
  let agent;
  let service;

  before(async () => {
    agent = await loginAsSuperAdmin();
    service = await createService(agent);
  });

  test("creates a SELECT requirement scoped to TRAVELER with options", async () => {
    const res = await agent.post(`/api/services/${service.id}/requirements`).send({
      name: "الجنسية",
      type: "SELECT",
      scope: "TRAVELER",
      options: [
        { value: "SD", label: "السودان" },
        { value: "EG", label: "مصر" },
      ],
    });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.type, "SELECT");
    assert.equal(res.body.data.scope, "TRAVELER");
    assert.deepEqual(res.body.data.options, [
      { value: "SD", label: "السودان" },
      { value: "EG", label: "مصر" },
    ]);
  });

  test("defaults type to DOCUMENT and scope to CASE when omitted (unchanged prior behavior)", async () => {
    const res = await agent.post(`/api/services/${service.id}/requirements`).send({ name: "مستند عام" });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.type, "DOCUMENT");
    assert.equal(res.body.data.scope, "CASE");
  });

  test("a conditional YES_NO requirement can reference another requirement, and rejects a half-set condition", async () => {
    const parentRes = await agent.post(`/api/services/${service.id}/requirements`).send({
      name: "هل تقيم خارج السودان؟",
      type: "YES_NO",
      scope: "TRAVELER",
    });
    assert.equal(parentRes.status, 201);
    const parentId = parentRes.body.data.id;

    const childRes = await agent.post(`/api/services/${service.id}/requirements`).send({
      name: "تصريح الإقامة",
      type: "DOCUMENT",
      scope: "TRAVELER",
      conditionRequirementId: parentId,
      conditionOperator: "EQUALS",
      conditionValue: "YES",
    });
    assert.equal(childRes.status, 201, JSON.stringify(childRes.body));
    assert.equal(childRes.body.data.conditionRequirementId, parentId);
    assert.equal(childRes.body.data.conditionOperator, "EQUALS");
    assert.equal(childRes.body.data.conditionValue, "YES");

    const halfSetRes = await agent.post(`/api/services/${service.id}/requirements`).send({
      name: "متطلب غير مكتمل الشرط",
      conditionRequirementId: parentId,
      // conditionOperator/conditionValue deliberately omitted.
    });
    assert.equal(halfSetRes.status, 400);
  });

  test("public checklist exposes type/scope/options/condition fields", async () => {
    const freshService = await createService(agent);
    await agent.post(`/api/services/${freshService.id}/requirements`).send({
      name: "عدد الليالي",
      type: "NUMBER",
      scope: "CASE",
    });

    const publicRes = await request(app).get(`/api/services/${freshService.id}/requirements/public`);
    assert.equal(publicRes.status, 200);
    assert.equal(publicRes.body.data.length, 1);
    assert.equal(publicRes.body.data[0].type, "NUMBER");
    assert.equal(publicRes.body.data[0].scope, "CASE");
  });
});

describe("structured travelers on contact requests", () => {
  let agent;
  let service;

  before(async () => {
    agent = await loginAsSuperAdmin();
    service = await createService(agent);
  });

  test("creates real Traveler rows and links a document to the correct traveler by index", async () => {
    const phone = `092${uniqueSuffix()}`;
    const res = await request(app)
      .post("/api/contact-requests")
      .field("name", "Traveler Owner")
      .field("phone", phone)
      .field("message", "طلب لعدة مسافرين")
      .field("serviceId", service.id)
      .field(
        "travelers",
        JSON.stringify([
          { fullName: "Ahmed Mohamed", passportNo: "P1111111", nationality: "SD" },
          { fullName: "Sara Ahmed", passportNo: "P2222222", nationality: "SD" },
        ])
      )
      .field("documentLabels", JSON.stringify(["جواز أحمد", "جواز سارة"]))
      .field("documentTravelerIndexes", JSON.stringify(["0", "1"]))
      .attach("documents", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "ahmed.png", contentType: "image/png" })
      .attach("documents", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "sara.png", contentType: "image/png" });

    assert.equal(res.status, 201, JSON.stringify(res.body));

    const listRes = await agent.get("/api/contact-requests?limit=50");
    const found = listRes.body.data.find((r) => r.id === res.body.data.id);
    assert.ok(found);
    assert.equal(found.travelers.length, 2);

    const ahmed = found.travelers.find((t) => t.fullName === "Ahmed Mohamed");
    const sara = found.travelers.find((t) => t.fullName === "Sara Ahmed");
    assert.ok(ahmed && sara);
    assert.equal(ahmed.passportNo, "P1111111");

    const ahmedDoc = found.documents.find((d) => d.label === "جواز أحمد");
    const saraDoc = found.documents.find((d) => d.label === "جواز سارة");
    assert.equal(ahmedDoc.travelerId, ahmed.id);
    assert.equal(saraDoc.travelerId, sara.id);
  });

  test("a submission without the structured travelers field creates zero Traveler rows and case-scoped documents (unchanged behavior)", async () => {
    const phone = `093${uniqueSuffix()}`;
    const res = await request(app)
      .post("/api/contact-requests")
      .field("name", "No Structured Travelers")
      .field("phone", phone)
      .field("message", "طلب عادي بدون مسافرين منظمين")
      .field("serviceId", service.id)
      .field("documentLabels", JSON.stringify(["مستند"]))
      .attach("documents", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "doc.png", contentType: "image/png" });

    assert.equal(res.status, 201, JSON.stringify(res.body));

    const listRes = await agent.get("/api/contact-requests?limit=50");
    const found = listRes.body.data.find((r) => r.id === res.body.data.id);
    assert.deepEqual(found.travelers, []);
    assert.equal(found.documents[0].travelerId, null);
  });

  test("rejects an out-of-range documentTravelerIndexes reference", async () => {
    const phone = `094${uniqueSuffix()}`;
    const res = await request(app)
      .post("/api/contact-requests")
      .field("name", "Bad Traveler Index")
      .field("phone", phone)
      .field("message", "مرجع مسافر غير صالح")
      .field("serviceId", service.id)
      .field("travelers", JSON.stringify([{ fullName: "Only One" }]))
      .field("documentLabels", JSON.stringify(["مستند"]))
      .field("documentTravelerIndexes", JSON.stringify(["5"]))
      .attach("documents", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "doc.png", contentType: "image/png" });

    assert.equal(res.status, 400);

    const listRes = await agent.get("/api/contact-requests?limit=50");
    const leaked = listRes.body.data.find((r) => r.phone === phone);
    assert.equal(leaked, undefined, "the whole submission must be rejected, not partially created");
  });

  test("answers for non-DOCUMENT requirements are stored under intakeData.answers", async () => {
    const requirementRes = await agent.post(`/api/services/${service.id}/requirements`).send({
      name: "عدد الليالي",
      type: "NUMBER",
      scope: "CASE",
    });
    const requirementId = requirementRes.body.data.id;

    const phone = `095${uniqueSuffix()}`;
    const res = await request(app)
      .post("/api/contact-requests")
      .send({
        name: "Answers Test",
        phone,
        message: "طلب مع إجابة سؤال غير مستند",
        serviceId: service.id,
        answers: { [requirementId]: "5" },
      });

    assert.equal(res.status, 201, JSON.stringify(res.body));

    const listRes = await agent.get("/api/contact-requests?limit=50");
    const found = listRes.body.data.find((r) => r.id === res.body.data.id);
    assert.equal(found.intakeData.answers[requirementId], "5");
  });
});
