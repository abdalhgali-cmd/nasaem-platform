// A draft submitted by a signed-in customer is filed under their account (as a
// direct submission is), so their requests, notifications and corrections
// reach them; anonymous or invalid sessions stay unlinked, and nothing is
// ever linked by phone number. Own file: the public submit limit is per file.
import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { app, request, loginAsSuperAdmin, registerCustomer, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";

let fixed;

before(async () => {
  const admin = await loginAsSuperAdmin();
  const suffix = uniqueSuffix();
  const res = await admin.post("/api/services").send({ code: `SVC-DRAFTLINK-${suffix}`, name: `Draft Link ${suffix}`, category: "qa-drafts", basePrice: 100, currency: "USD" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal((await admin.patch(`/api/services/${res.body.data.id}`).send({ pricingMode: "FIXED", priceUnit: "PER_TRAVELER" })).status, 200);
  fixed = res.body.data;
});

async function draft(phone) {
  const created = await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: fixed.id });
  const token = created.body.data.token;
  const saved = await request(app).patch(`/api/intake-drafts/${token}`).send({ name: "Linked Customer", phone, travelerCount: 1, travelers: [{ fullName: "A" }] });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  return token;
}
const body = () => ({ acceptedTotal: "100.00", acceptedCurrency: "USD", submissionKey: crypto.randomUUID() });

describe("draft submission and the customer account", () => {
  test("signed in (bearer): the request is the customer's and appears in their account", async () => {
    const { agent, customer } = await registerCustomer();
    const login = await request(app).post("/api/customer-auth/login").send({ identifier: customer.phone, password: "Test@12345" });
    const bearer = login.body?.data?.token || login.body?.data?.accessToken;
    assert.ok(bearer, JSON.stringify(login.body).slice(0, 200));
    const token = await draft(`0915${uniqueSuffix()}`);
    const sent = await request(app).post(`/api/intake-drafts/${token}/submit`).set("Authorization", `Bearer ${bearer}`).send(body());
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    const stored = await prisma.contactRequest.findUnique({ where: { id: sent.body.data.id }, select: { customerId: true } });
    assert.equal(stored.customerId, customer.id);
    const mine = await agent.get("/api/customer/requests");
    assert.ok(mine.body.data.some((r) => r.id === sent.body.data.id), "listed in the account");
    const notice = await prisma.notification.findFirst({ where: { contactRequestId: sent.body.data.id, customerId: customer.id } });
    assert.ok(notice, "the account gets the «received» notification");
  });

  test("anonymous or an invalid session: not linked — and never by the phone number", async () => {
    const { customer } = await registerCustomer();
    const anonymous = await request(app).post(`/api/intake-drafts/${await draft(customer.phone)}/submit`).send(body());
    assert.equal(anonymous.status, 201, JSON.stringify(anonymous.body));
    assert.equal((await prisma.contactRequest.findUnique({ where: { id: anonymous.body.data.id } })).customerId, null, "same phone, no session: not linked");
    const invalid = await request(app).post(`/api/intake-drafts/${await draft(`0915${uniqueSuffix()}`)}/submit`).set("Authorization", "Bearer not-a-token").send(body());
    assert.equal(invalid.status, 201, JSON.stringify(invalid.body));
    assert.equal((await prisma.contactRequest.findUnique({ where: { id: invalid.body.data.id } })).customerId, null);
  });
});
