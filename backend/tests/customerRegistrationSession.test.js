import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { app, request, uniqueSuffix } from "./helpers/api.js";

// Registration on the website must leave the customer signed in even where the
// browser drops the API's cross-site session cookie (the website and the API
// are on different domains in production): the token in the response is the
// whole session. Requests here carry the website's Origin and no cookie jar.
const WEBSITE_ORIGIN = (process.env.CORS_ORIGIN || "http://localhost:3000").split(",")[0].trim();

describe("website registration opens the account without the cookie", () => {
  test("register → /me, profile and requests with only the returned token; logout ends it", async () => {
    const suffix = uniqueSuffix();
    const phone = `2496${suffix}`;
    const registered = await request(app)
      .post("/api/customer-auth/register")
      .set("Origin", WEBSITE_ORIGIN)
      .send({ fullName: `Website Customer ${suffix}`, phone, password: "Test@12345" });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    const { token, customer } = registered.body.data;
    assert.ok(token, "the response carries the session token");
    assert.equal(customer.phone.replace(/\D/g, "").endsWith(phone.slice(-9)), true);
    assert.equal(customer.passwordHash, undefined, "no secret in the response");

    const bearer = (req) => req.set("Origin", WEBSITE_ORIGIN).set("Authorization", `Bearer ${token}`);
    const me = await bearer(request(app).get("/api/customer-auth/me"));
    assert.equal(me.status, 200, JSON.stringify(me.body));
    assert.equal(me.body.data.id, customer.id);
    assert.equal((await bearer(request(app).get("/api/customer/requests"))).status, 200);

    // A write with the token and the website's Origin passes CSRF (no cookie involved).
    const profile = await bearer(request(app).patch("/api/customer-auth/profile")).send({ fullName: `Website Customer ${suffix} B` });
    assert.equal(profile.status, 200, JSON.stringify(profile.body));

    const logout = await bearer(request(app).post("/api/customer-auth/logout"));
    assert.equal(logout.status, 200, JSON.stringify(logout.body));
    assert.equal((await bearer(request(app).get("/api/customer-auth/me"))).status, 401, "logout revokes the token");
  });

  test("registering an existing phone again creates nothing and points to sign-in", async () => {
    const suffix = uniqueSuffix();
    const phone = `2495${suffix}`;
    const body = { fullName: `Repeat ${suffix}`, phone, password: "Test@12345" };
    const first = await request(app).post("/api/customer-auth/register").set("Origin", WEBSITE_ORIGIN).send(body);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const again = await request(app).post("/api/customer-auth/register").set("Origin", WEBSITE_ORIGIN).send(body);
    assert.equal(again.status, 409);
    assert.match(again.body.message, /الهاتف/);
    assert.match(again.body.message, /تسجيل الدخول/);
    assert.equal(again.body.data, undefined, "no session for a refused registration");
    const login = await request(app).post("/api/customer-auth/login").set("Origin", WEBSITE_ORIGIN).send({ identifier: phone, password: "Test@12345" });
    assert.equal(login.status, 200, "the original account still signs in");
  });
});
