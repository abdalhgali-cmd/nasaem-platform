import "./env.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { registerCustomer, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";
import { terminateOcrWorker } from "../src/modules/passport-ocr/passport-ocr.service.js";

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

  async function submitTwoTravelerRequest(agent, label) {
    const res = await agent
      .post("/api/contact-requests")
      .field("name", label)
      .field("phone", `092${uniqueSuffix()}`)
      .field("message", "موافقة أمنية لمسافرين")
      .field("visaTypeId", visaType.id)
      .field(
        "travelers",
        JSON.stringify([
          { fullName: `${label} One`, passportNo: `A${uniqueSuffix()}`, nationality: "Sudan", isPrimary: true },
          { fullName: `${label} Two`, passportNo: `B${uniqueSuffix()}`, nationality: "Sudan" },
        ])
      )
      .field("answers", JSON.stringify({ [entryModeRequirement.id]: "AIR" }));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const detail = await agent.get(`/api/customer/requests/${res.body.data.id}`);
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    const travelers = await prisma.traveler.findMany({ where: { contactRequestId: res.body.data.id }, orderBy: { sortOrder: "asc" } });
    return { id: res.body.data.id, travelers };
  }

  const upload = (agent, requestId, fields) => {
    let req = agent.post(`/api/customer/requests/${requestId}/documents`).field("label", "صورة الجواز").field("requirementId", passportRequirement.id);
    for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
    return req.attach("file", PNG(), { filename: "passport.png", contentType: "image/png" });
  };

  test("a traveler-scoped document without a traveler is refused; with the right traveler it is stored on that traveler", async () => {
    const { agent } = await registerCustomer();
    const own = await submitTwoTravelerRequest(agent, "Own");

    const missing = await upload(agent, own.id, {});
    assert.equal(missing.status, 400, JSON.stringify(missing.body));
    assert.equal(missing.body.code, "TRAVELER_REQUIRED");

    const ok = await upload(agent, own.id, { travelerId: own.travelers[1].id });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.data.travelerId, own.travelers[1].id);
  });

  test("a traveler of another customer's request cannot be used", async () => {
    const { agent: a } = await registerCustomer();
    const { agent: b } = await registerCustomer();
    const requestA = await submitTwoTravelerRequest(a, "Alice");
    const requestB = await submitTwoTravelerRequest(b, "Bob");

    const stolen = await upload(a, requestA.id, { travelerId: requestB.travelers[0].id });
    assert.equal(stolen.status, 400, JSON.stringify(stolen.body));
    assert.equal(stolen.body.code, "TRAVELER_NOT_FOUND");

    const intoForeignRequest = await upload(a, requestB.id, { travelerId: requestB.travelers[0].id });
    assert.equal(intoForeignRequest.status, 404);
    assert.equal(await prisma.contactRequestDocument.count({ where: { contactRequestId: requestB.id } }), 0);
  });
});
