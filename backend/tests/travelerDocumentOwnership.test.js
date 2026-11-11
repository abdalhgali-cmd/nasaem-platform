import "./env.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { registerCustomer, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";
import { getPublicChecklist } from "../src/modules/requirements/requirements.service.js";
import { normalizePhone } from "../src/utils/phone.js";
import { terminateOcrWorker } from "../src/modules/passport-ocr/passport-ocr.service.js";

// Explicit historical fixture: new applications require every passport.
// Existing customers must still be able to complete missing documents safely.
async function legacyEgyptRequest(customer, label, names = [label + " One", label + " Two"]) {
  const visa = await prisma.visaType.findUnique({ where: { code: "VISA-EGYPT-CLEARANCE" } });
  const checklist = await getPublicChecklist({ visaTypeId: visa.id });
  const entry = checklist.find(r => r.attachmentType === "egypt_entry_mode");
  return prisma.contactRequest.create({ data: {
    customerId: customer.id, organizationId: customer.organizationId || "org_nasaem_default",
    name: label, phone: customer.phone, phoneNormalized: normalizePhone(customer.phone),
    message: "TEST historical Egypt intake", visaTypeId: visa.id,
    requirementsSnapshot: checklist, intakeData: { answers: { [entry.id]: "AIR" }, egyptEntryMode: "AIR" },
    travelers: { create: names.map((fullName, index) => ({ fullName, isPrimary: index === 0, sortOrder: index })) },
  }, include: { travelers: { orderBy: { sortOrder: "asc" } } } });
}

const PNG = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

// A per-traveler document must be filed against the right traveler: never
// the case in general, never a traveler of someone else's request.
describe("documents are always tied to the correct traveler", () => {
  let visaType;
  let passportRequirement;
  let entryModeRequirement;

  after(async () => {
    await terminateOcrWorker();
  });

  before(async () => {
    visaType = await prisma.visaType.findUnique({ where: { code: "VISA-EGYPT-CLEARANCE" } });
    passportRequirement = await prisma.visaRequirement.findFirst({
      where: { visaTypeId: visaType.id, attachmentType: "passport_copy", active: true },
    });
    entryModeRequirement = await prisma.visaRequirement.findFirst({
      where: { visaTypeId: visaType.id, attachmentType: "egypt_entry_mode", active: true },
    });
  });

  async function submitTwoTravelerRequest(agent, customer, label) {
    const row = await legacyEgyptRequest(customer, label);
    const detail = await agent.get(`/api/customer/requests/${row.id}`);
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    return row;
  }

  const upload = (agent, requestId, fields) => {
    let req = agent.post(`/api/customer/requests/${requestId}/documents`).field("label", "صورة الجواز").field("requirementId", passportRequirement.id);
    for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
    return req.attach("file", PNG(), { filename: "passport.png", contentType: "image/png" });
  };

  test("a traveler-scoped document without a traveler is refused; with the right traveler it is stored on that traveler", async () => {
    const { agent, customer } = await registerCustomer();
    const own = await submitTwoTravelerRequest(agent, customer, "Own");

    const missing = await upload(agent, own.id, {});
    assert.equal(missing.status, 400, JSON.stringify(missing.body));
    assert.equal(missing.body.code, "TRAVELER_REQUIRED");

    const ok = await upload(agent, own.id, { travelerId: own.travelers[1].id });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.data.travelerId, own.travelers[1].id);
  });

  test("a traveler of another customer's request cannot be used", async () => {
    const { agent: a, customer: customerA } = await registerCustomer();
    const { agent: b, customer: customerB } = await registerCustomer();
    const requestA = await submitTwoTravelerRequest(a, customerA, "Alice");
    const requestB = await submitTwoTravelerRequest(b, customerB, "Bob");

    const stolen = await upload(a, requestA.id, { travelerId: requestB.travelers[0].id });
    assert.equal(stolen.status, 400, JSON.stringify(stolen.body));
    assert.equal(stolen.body.code, "TRAVELER_NOT_FOUND");

    const intoForeignRequest = await upload(a, requestB.id, { travelerId: requestB.travelers[0].id });
    assert.equal(intoForeignRequest.status, 404);
    assert.equal(await prisma.contactRequestDocument.count({ where: { contactRequestId: requestB.id } }), 0);
  });
});

describe("the customer's checklist tells them exactly which document is still missing", () => {
  test("account requests expose the checklist per traveler and the next actions", async () => {
    const visaType = await prisma.visaType.findUnique({ where: { code: "VISA-EGYPT-CLEARANCE" } });
    const passportRequirement = await prisma.visaRequirement.findFirst({ where: { visaTypeId: visaType.id, attachmentType: "passport_copy", active: true } });
    const entryModeRequirement = await prisma.visaRequirement.findFirst({ where: { visaTypeId: visaType.id, attachmentType: "egypt_entry_mode", active: true } });
    const { agent, customer } = await registerCustomer();
    const { id, travelers } = await legacyEgyptRequest(customer, "Checklist", ["أول", "ثان"]);

    const before = (await agent.get(`/api/customer/requests/${id}`)).body.data;
    const passports = before.checklist.filter((item) => item.requirementId === passportRequirement.id);
    assert.deepEqual(passports.map((item) => [item.travelerName, item.state]), [["أول", "MISSING"], ["ثان", "MISSING"]]);
    assert.ok(before.nextActions.some((action) => action.code === "UPLOAD_DOCUMENT" && action.travelerId === travelers[1].id));

    const upload = await agent
      .post(`/api/customer/requests/${id}/documents`)
      .field("label", "صورة الجواز")
      .field("requirementId", passportRequirement.id)
      .field("travelerId", travelers[1].id)
      .attach("file", PNG(), { filename: "second.png", contentType: "image/png" });
    assert.equal(upload.status, 201, JSON.stringify(upload.body));

    const after = (await agent.get(`/api/customer/requests/${id}`)).body.data;
    const states = Object.fromEntries(after.checklist.filter((item) => item.requirementId === passportRequirement.id).map((item) => [item.travelerName, item.state]));
    assert.deepEqual(states, { "أول": "MISSING", "ثان": "UNDER_REVIEW" }, "the file counts only for the traveler it was sent for");
  });
});
