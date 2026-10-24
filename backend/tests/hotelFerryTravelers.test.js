// Track A3 (AUDIT-00 G-06): hotel and ferry requests carry their travelers,
// so readiness can pass; the request API stays compatible with installed
// app versions (names only, passports uploaded as documents). Synthetic data.
import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import prisma from "../src/config/database.js";
import { uniqueSuffix } from "./helpers/api.js";
import { createContactRequest } from "../src/modules/contact-requests/contact-requests.service.js";
import { createContactRequestSchema } from "../src/modules/contact-requests/contact-requests.validators.js";
import { evaluateReadiness } from "../src/modules/contact-request-workflow/workflow-policy.js";

const fakeReq = { customer: null, ip: "127.0.0.1", headers: {} };
const serviceId = async (code) => (await prisma.service.findFirst({ where: { code } })).id;
const submit = async (body) => {
  const created = await createContactRequest(createContactRequestSchema.parse({ name: "عميل تجريبي", phone: `0912${uniqueSuffix().slice(-6)}`, message: "طلب حجز تجريبي", ...body }), fakeReq);
  return prisma.contactRequest.findUnique({ where: { id: created.id }, include: { travelers: true, documents: true } });
};
const travelerCodes = (request) => evaluateReadiness(request).reasons.map((r) => r.code).filter((code) => code === "TRAVELERS_MISSING");

describe("hotel and ferry travelers", () => {
  test("website hotel: one lead guest per room satisfies the traveler count; guests kept in intakeData", async () => {
    const request = await submit({
      serviceId: await serviceId("SVC-HOTEL"),
      travelerCount: 2,
      travelers: [{ fullName: "ضيف أول", isPrimary: true }, { fullName: "ضيف ثانٍ" }],
      intakeData: { rooms: 2, guests: 3, leadGuestPerRoom: true },
    });
    assert.equal(request.travelers.length, 2);
    assert.ok(request.travelers.every((t) => !t.passportNo), "no passport asked for hotels");
    assert.deepEqual(travelerCodes(request), []);
    assert.equal(request.intakeData.guests, 3);
  });

  test("website ferry: passport and nationality stored per passenger", async () => {
    const request = await submit({
      serviceId: await serviceId("SVC-FERRY"),
      travelerCount: 2,
      travelers: [{ fullName: "راكب 1", nationality: "سوداني", passportNo: "SYN2000001", isPrimary: true }, { fullName: "راكب 2", nationality: "سوداني", passportNo: "SYN2000002", birthDate: "1990-01-01" }],
    });
    assert.deepEqual(request.travelers.map((t) => t.passportNo).sort(), ["SYN2000001", "SYN2000002"]);
    assert.deepEqual(travelerCodes(request), []);
  });

  test("installed app style (names only) is still accepted; a count without rows still reports the missing travelers", async () => {
    const appStyle = await submit({ serviceId: await serviceId("SVC-FERRY"), travelerCount: 1, travelers: [{ fullName: "راكب من التطبيق" }] });
    assert.equal(appStyle.travelers.length, 1);
    assert.deepEqual(travelerCodes(appStyle), []);
    const legacy = await submit({ serviceId: await serviceId("SVC-HOTEL"), travelerCount: 2 });
    assert.deepEqual(travelerCodes(legacy), ["TRAVELERS_MISSING"], "old shape unchanged: staff add the travelers");
  });
});
