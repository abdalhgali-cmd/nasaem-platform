import "./env.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { app, request } from "./helpers/api.js";
import db from "../src/config/database.js";
import { googleIdentity } from "../src/modules/customer-auth/google-auth.js";

test("Google claims require verified email, stable subject and the browser nonce", () => {
  const identity = { sub: "synthetic-subject", email: "qa@example.invalid", email_verified: true, nonce: "expected" };
  assert.equal(googleIdentity(identity, "expected").subject, identity.sub);
  for (const patch of [{ nonce: "other" }, { email_verified: false }, { sub: "" }, { email: null }]) {
    assert.throws(() => googleIdentity({ ...identity, ...patch }, "expected"));
  }
  assert.throws(() => googleIdentity(identity, ""));
});

test("Google login creates one account; existing session, refresh and revocation still work", async (t) => {
  const old = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = "synthetic.apps.googleusercontent.com";
  const subject = randomUUID();
  const email = `${subject}@example.invalid`;
  let nonce;
  // Only the official cryptographic verifier is mocked, never the DB/session.
  t.mock.method(OAuth2Client.prototype, "verifyIdToken", async ({ audience }) => {
    assert.equal(audience, process.env.GOOGLE_CLIENT_ID);
    return { getPayload: () => ({ sub: subject, email, email_verified: true, nonce }) };
  });
  const browser = request.agent(app);
  try {
    for (let i = 0; i < 2; i++) {
      const challenge = await browser.get("/api/customer-auth/google/challenge");
      assert.equal(challenge.status, 200);
      nonce = challenge.body.data.nonce;
      const login = await browser.post("/api/customer-auth/google").send({ credential: "synthetic-test-token" });
      assert.equal(login.status, 200, JSON.stringify(login.body));
      assert.ok(login.body.data.token);
      assert.equal(login.body.data.customer.googleSubject, undefined);
    }
    assert.equal(await db.customer.count({ where: { googleSubject: subject } }), 1);
    const me = await browser.get("/api/customer-auth/me");
    assert.equal(me.status, 200);
    assert.equal(me.body.data.email, email);
    const renewed = await browser.post("/api/customer-auth/refresh").send({});
    assert.equal(renewed.status, 200);
    const token = renewed.body.data.token;
    assert.equal((await browser.post("/api/customer-auth/logout").send({})).status, 200);
    assert.equal((await request(app).get("/api/customer-auth/me").set("Authorization", `Bearer ${token}`)).status, 401);
  } finally {
    const customer = await db.customer.findUnique({ where: { googleSubject: subject } });
    if (customer) {
      await db.revokedCustomerToken.deleteMany({ where: { customerId: customer.id } });
      await db.customer.delete({ where: { id: customer.id } });
    }
    if (old === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = old;
  }
});

test("an invalid signature or missing browser challenge cannot open a session", async (t) => {
  const old = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = "synthetic.apps.googleusercontent.com";
  t.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => { throw new Error("invalid signature"); });
  try {
    const browser = request.agent(app);
    await browser.get("/api/customer-auth/google/challenge");
    const invalid = await browser.post("/api/customer-auth/google").send({ credential: "forged" });
    assert.equal(invalid.status, 401);
    assert.equal((await browser.get("/api/customer-auth/me")).status, 401);
  } finally {
    if (old === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = old;
  }
});

test("Google is disabled without a configured client id", async () => {
  const old = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  try {
    const response = await request(app).get("/api/customer-auth/google/challenge");
    assert.deepEqual(response.body.data, { enabled: false });
  } finally { if (old !== undefined) process.env.GOOGLE_CLIENT_ID = old; }
});

test("loading Google configuration does not exhaust password login attempts", async () => {
  for (let i = 0; i < 12; i++) {
    assert.equal((await request(app).get("/api/customer-auth/google/challenge")).status, 200);
  }
  const password = await request(app).post("/api/customer-auth/login")
    .send({ identifier: "synthetic-absent@example.invalid", password: "incorrect-synthetic" });
  assert.equal(password.status, 401, "wrong credentials are checked, not blocked by configuration reads");
});

test("matching email never grants a Google identity access to an existing account", async (t) => {
  const old = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = "synthetic.apps.googleusercontent.com";
  const email = `${randomUUID()}@example.invalid`;
  const existing = await db.customer.create({ data: {
    customerNo: `TEST-${randomUUID()}`, fullName: "Synthetic existing account", email,
    passwordHash: "synthetic-unusable-password-hash",
  } });
  let nonce;
  t.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => ({
    getPayload: () => ({ sub: randomUUID(), email, email_verified: true, nonce }),
  }));
  try {
    const browser = request.agent(app);
    nonce = (await browser.get("/api/customer-auth/google/challenge")).body.data.nonce;
    const login = await browser.post("/api/customer-auth/google").send({ credential: "synthetic" });
    assert.equal(login.status, 409);
    assert.equal(login.body.code, "GOOGLE_ACCOUNT_LINK_REQUIRED");
    assert.equal((await db.customer.findUnique({ where: { id: existing.id } })).googleSubject, null);
    assert.equal(await db.customer.count({ where: { email } }), 1);
    assert.equal((await browser.get("/api/customer-auth/me")).status, 401);
  } finally {
    await db.customer.delete({ where: { id: existing.id } });
    if (old === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = old;
  }
});
