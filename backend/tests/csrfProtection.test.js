import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request, loginAsSuperAdmin, registerCustomer, uniqueSuffix } from "./helpers/api.js";

// Security regression suite: browser sessions are cookie-based and, in
// production, the cookies are SameSite=None (the Vercel-hosted site calls the
// Railway API cross-site). SameSite therefore gives no CSRF protection, so the
// API itself must refuse ambient-cookie mutations that originate from a site
// that is not on the allow-list (CORS_ORIGIN) or the API's own origin.
//
// Token-based clients (the Expo mobile app uses Bearer tokens) and anonymous
// public submissions must keep working.

const EVIL = "https://evil.example";
const ALLOWED = "http://localhost:3000"; // CORS_ORIGIN in .env.test / CI

function newUserBody(email) {
  return { fullName: "Mallory Admin", email, password: "Mallory@12345", role: "SUPER_ADMIN" };
}

describe("CSRF: cookie-authenticated mutations", () => {
  let admin;
  let bearerToken;

  before(async () => {
    admin = await loginAsSuperAdmin();
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@nasaem-platform.local", password: process.env.SEED_ADMIN_PASSWORD });
    bearerToken = login.body.data.token;
  });

  test("EXPLOIT: cross-site <form> POST (urlencoded, no preflight) cannot create a SUPER_ADMIN", async () => {
    const email = `csrf-form-${uniqueSuffix()}@example.com`;
    const res = await admin
      .post("/api/users")
      .set("Origin", EVIL)
      .set("Sec-Fetch-Site", "cross-site")
      .type("form")
      .send(newUserBody(email));
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(await prisma.user.count({ where: { email } }), 0, "the forged request must not create a user");
  });

  test("cross-site JSON request carrying the session cookie is rejected", async () => {
    const email = `csrf-json-${uniqueSuffix()}@example.com`;
    const res = await admin.post("/api/users").set("Origin", EVIL).send(newUserBody(email));
    assert.equal(res.status, 403);
    assert.equal(await prisma.user.count({ where: { email } }), 0);
  });

  test("Sec-Fetch-Site: cross-site without an Origin header is rejected", async () => {
    const res = await admin.post("/api/users").set("Sec-Fetch-Site", "cross-site").send(newUserBody(`csrf-sfs-${uniqueSuffix()}@example.com`));
    assert.equal(res.status, 403);
  });

  test("a same-site but un-allow-listed origin is rejected", async () => {
    const res = await admin
      .post("/api/users")
      .set("Origin", "https://attacker.nasaem-alharamain.example")
      .set("Sec-Fetch-Site", "same-site")
      .send(newUserBody(`csrf-ss-${uniqueSuffix()}@example.com`));
    assert.equal(res.status, 403);
  });

  test("the allow-listed web origin still works", async () => {
    const res = await admin
      .post("/api/customers")
      .set("Origin", ALLOWED)
      .set("Sec-Fetch-Site", "cross-site")
      .send({ fullName: "Allowed Origin Customer", passportNo: `CSRF${uniqueSuffix()}`, nationality: "Sudan" });
    assert.equal(res.status, 201, JSON.stringify(res.body));
  });

  test("the API's own origin (same-origin back-office) still works", async () => {
    const res = await admin
      .post("/api/customers")
      .set("Host", "api.nasaem.test")
      .set("Origin", "http://api.nasaem.test")
      .send({ fullName: "Same Origin Customer", passportNo: `CSRF${uniqueSuffix()}`, nationality: "Sudan" });
    assert.equal(res.status, 201, JSON.stringify(res.body));
  });

  test("non-browser clients (no Origin / Fetch-Metadata) with the cookie still work", async () => {
    const res = await admin.post("/api/customers").send({ fullName: "Script Customer", passportNo: `CSRF${uniqueSuffix()}`, nationality: "Sudan" });
    assert.equal(res.status, 201, JSON.stringify(res.body));
  });

  test("Bearer-token clients (mobile app) are not subject to the cookie CSRF check", async () => {
    const res = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${bearerToken}`)
      .set("Origin", EVIL)
      .send({ fullName: "Bearer Customer", passportNo: `CSRF${uniqueSuffix()}`, nationality: "Sudan" });
    assert.equal(res.status, 201, JSON.stringify(res.body));
  });

  test("safe methods are unaffected", async () => {
    const res = await admin.get("/api/auth/me").set("Origin", EVIL);
    assert.equal(res.status, 200);
  });

  test("anonymous public submissions are not blocked by the CSRF guard (CORS governs those)", async () => {
    const res = await request(app).post("/api/contact-requests").set("Origin", EVIL).send({});
    assert.notEqual(res.status, 403);
  });

  test("customer-session cookie: cross-site password change is rejected and the password is unchanged", async () => {
    const { agent, customer } = await registerCustomer();
    const res = await agent
      .post("/api/customer-auth/change-password")
      .set("Origin", EVIL)
      .type("form")
      .send({ currentPassword: "Test@12345", newPassword: "Hijacked@12345" });
    assert.equal(res.status, 403);
    const row = await prisma.customer.findUnique({ where: { id: customer.id }, select: { phone: true } });
    const login = await request(app).post("/api/customer-auth/login").send({ identifier: row.phone, password: "Test@12345" });
    assert.equal(login.status, 200, "original password must still work");
  });

  test("tracking-session cookie: cross-site mutation is rejected", async () => {
    const phone = `2499${uniqueSuffix().slice(-8)}`;
    const code = (await request(app).post("/api/tracking/request-code").send({ phone })).body.debugCode;
    const tracking = request.agent(app);
    const verified = await tracking.post("/api/tracking/verify-code").send({ phone, code });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    const res = await tracking.post("/api/tracking/requests/does-not-matter/mark-transfer-sent").set("Origin", EVIL).send({});
    assert.equal(res.status, 403);
  });
});
