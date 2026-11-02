import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import app from "../src/app.js";
import prisma from "../src/config/database.js";
import { createStaffUser } from "./helpers/staff.js";
import { signAccessToken } from "../src/utils/jwt.js";

// A raw request with only the session cookie and the headers a test passes,
// i.e. exactly what a cross-site <form> or fetch would produce.
function rawWrite(method, url, token, headers = {}) {
  let req = request(app)[method](url).set("X-No-Default-Headers", "1").set("Cookie", `accessToken=${token}`);
  for (const [name, value] of Object.entries(headers)) req = req.set(name, value);
  return req;
}

async function freshTarget() {
  const admin = await createStaffUser({ role: "SUPER_ADMIN" });
  const victim = await createStaffUser({ role: "EMPLOYEE" });
  const token = signAccessToken({ sub: admin.id, role: admin.role, email: admin.email, sv: 0 });
  return { admin, victim, token };
}

async function statusOf(userId) {
  return (await prisma.user.findUnique({ where: { id: userId }, select: { status: true } })).status;
}

describe("CSRF protection for cookie-authenticated writes", () => {
  test("an untrusted origin cannot change state with JSON, form-urlencoded or multipart bodies", async () => {
    const { victim, token } = await freshTarget();
    const evil = { Origin: "https://evil.example" };

    const json = await rawWrite("patch", `/api/users/${victim.id}/status`, token, evil).send({ status: "SUSPENDED" });
    assert.equal(json.status, 403);
    assert.equal(json.body.code, "CSRF_REJECTED");

    const form = await rawWrite("patch", `/api/users/${victim.id}/status`, token, evil).type("form").send("status=SUSPENDED");
    assert.equal(form.status, 403);

    const multipart = await rawWrite("post", "/api/payments", token, evil).field("orderId", "x").field("amount", "1").field("paymentMethod", "cash");
    assert.equal(multipart.status, 403);

    assert.equal(await statusOf(victim.id), "ACTIVE");
  });

  test("the literal null origin, cross-site fetch metadata and a foreign Referer are rejected", async () => {
    const { victim, token } = await freshTarget();
    for (const headers of [
      { Origin: "null" },
      { "Sec-Fetch-Site": "cross-site" },
      { "Sec-Fetch-Site": "same-site" },
      { Referer: "https://evil.example/page" },
      {},
    ]) {
      const res = await rawWrite("patch", `/api/users/${victim.id}/status`, token, headers).type("form").send("status=SUSPENDED");
      assert.equal(res.status, 403, `expected rejection for ${JSON.stringify(headers)}`);
    }
    assert.equal(await statusOf(victim.id), "ACTIVE");
  });

  test("same-origin pages, configured origins and the back-office header are accepted", async () => {
    const { victim, token } = await freshTarget();
    const sameOrigin = await rawWrite("patch", `/api/users/${victim.id}/status`, token, {}).set("Host", "admin.example").set("Origin", "http://admin.example").send({ status: "INACTIVE" });
    assert.equal(sameOrigin.status, 200);

    const configured = await rawWrite("patch", `/api/users/${victim.id}/status`, token, { Origin: "http://localhost:3000" }).send({ status: "ACTIVE" });
    assert.equal(configured.status, 200, "CORS_ORIGIN entries are trusted callers");

    const fetchMeta = await rawWrite("patch", `/api/users/${victim.id}/status`, token, { "Sec-Fetch-Site": "same-origin" }).send({ status: "INACTIVE" });
    assert.equal(fetchMeta.status, 200);

    const header = await rawWrite("patch", `/api/users/${victim.id}/status`, token, { "X-Requested-With": "XMLHttpRequest" }).send({ status: "ACTIVE" });
    assert.equal(header.status, 200);
  });

  test("Bearer-authenticated clients and cookie-less public requests are not affected", async () => {
    const { victim, token } = await freshTarget();
    const bearer = await request(app)
      .patch(`/api/users/${victim.id}/status`)
      .set("X-No-Default-Headers", "1")
      .set("Authorization", `Bearer ${token}`)
      .set("Origin", "capacitor://localhost")
      .send({ status: "INACTIVE" });
    assert.equal(bearer.status, 200);

    const publicLogin = await request(app)
      .post("/api/auth/login")
      .set("X-No-Default-Headers", "1")
      .set("Origin", "https://evil.example")
      .send({ email: "nobody@example.test", password: "wrong-password" });
    assert.equal(publicLogin.status, 401, "no session cookie: CSRF does not apply, credentials do");
  });

  test("safe methods are never blocked", async () => {
    const { token } = await freshTarget();
    const res = await request(app).get("/api/auth/me").set("X-No-Default-Headers", "1").set("Cookie", `accessToken=${token}`).set("Origin", "https://evil.example");
    assert.equal(res.status, 200);
  });
});
