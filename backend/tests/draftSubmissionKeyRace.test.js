// T06 (docs/umrah-audit U-06): a draft submission can carry a durable
// submissionKey. A retry of that same submission (lost response, reload,
// second tab) returns the one request that was created, with a fresh payment
// token. Own file: the public submit limit is 5 per window per process.
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

describe("draft submission key (race, conflict, validation)", () => {
  test("two simultaneous submits with the same key make one request and both answers name it", async () => {
    const token = await draft();
    const key = crypto.randomUUID();
    const before = await prisma.contactRequest.count();
    const results = await Promise.all([1, 2].map(() => request(app).post(`/api/intake-drafts/${token}/submit`).send(body(key))));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 201], JSON.stringify(results.map((r) => r.body)));
    assert.equal(results[0].body.data.id, results[1].body.data.id);
    assert.equal(await prisma.contactRequest.count(), before + 1);
  });

  test("a key used by another request is refused and the draft stays intact", async () => {
    const tokenA = await draft();
    const key = crypto.randomUUID();
    assert.equal((await request(app).post(`/api/intake-drafts/${tokenA}/submit`).send(body(key))).status, 201);
    const tokenB = await draft();
    const clash = await request(app).post(`/api/intake-drafts/${tokenB}/submit`).send(body(key));
    assert.equal(clash.status, 409, JSON.stringify(clash.body));
    const draftB = await request(app).get(`/api/intake-drafts/${tokenB}`);
    assert.equal(draftB.status, 200);
    assert.equal(draftB.body.data.submittedContactRequestId ?? null, null);
  });

  test("a malformed key is rejected before anything happens", async () => {
    const token = await draft();
    const res = await request(app).post(`/api/intake-drafts/${token}/submit`).send(body("short"));
    assert.equal(res.status, 400);
  });
});
