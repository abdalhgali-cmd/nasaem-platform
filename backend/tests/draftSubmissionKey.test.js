// T06 (docs/umrah-audit U-06): a draft submission can carry a durable
// submissionKey. A retry of that same submission (lost response, reload,
// second tab) returns the one request that was created, with a fresh payment
// token; a different or missing key gets the old 409. Own file: the public
// submit limit is 5 per window per process.
import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";

let fixed;

before(async () => {
  const admin = await loginAsSuperAdmin();
  const suffix = uniqueSuffix();
  const res = await admin.post("/api/services").send({ code: `SVC-SUBKEY-${suffix}`, name: `Sub Key ${suffix}`, category: "qa-drafts", basePrice: 150, currency: "USD" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const patch = await admin.patch(`/api/services/${res.body.data.id}`).send({ pricingMode: "FIXED", priceUnit: "PER_TRAVELER" });
  assert.equal(patch.status, 200, JSON.stringify(patch.body));
  fixed = res.body.data;
});

async function draft() {
  const created = await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: fixed.id });
  const token = created.body.data.token;
  const saved = await request(app).patch(`/api/intake-drafts/${token}`).send({ name: "Key Customer", phone: `0916${uniqueSuffix()}`, travelerCount: 1, travelers: [{ fullName: "A" }] });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  return token;
}

const body = (key) => ({ acceptedTotal: "150.00", acceptedCurrency: "USD", ...(key ? { submissionKey: key } : {}) });

describe("draft submission key", () => {
  test("a retry with the same key returns the same request and a fresh payment token; other keys and no key stay 409", async () => {
    const token = await draft();
    const key = crypto.randomUUID();
    const first = await request(app).post(`/api/intake-drafts/${token}/submit`).send(body(key));
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const id = first.body.data.id;
    const stored = await prisma.contactRequest.findUnique({ where: { id }, select: { submissionKey: true } });
    assert.equal(stored.submissionKey, key);
    const before = await prisma.contactRequest.count();

    const retry = await request(app).post(`/api/intake-drafts/${token}/submit`).send(body(key));
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.equal(retry.body.data.id, id);
    assert.equal(retry.body.data.duplicate, true);
    assert.ok(retry.body.data.paymentAccess?.token, "the retry gets a fresh payment token");
    assert.notEqual(retry.body.data.paymentAccess.token, first.body.data.paymentAccess?.token);

    const otherKey = await request(app).post(`/api/intake-drafts/${token}/submit`).send(body(crypto.randomUUID()));
    assert.equal(otherKey.status, 409);
    const noKey = await request(app).post(`/api/intake-drafts/${token}/submit`).send(body());
    assert.equal(noKey.status, 409);
    assert.equal(await prisma.contactRequest.count(), before, "nothing was created by the retries");
  });

});
