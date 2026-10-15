import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

import { app } from "./helpers/api.js";
import { createStaffUser } from "./helpers/staff.js";
import { createApiRateLimiter } from "../src/middleware/rateLimits.js";
import { signAccessToken } from "../src/utils/jwt.js";

// Staff of one agency usually share one office IP. Successful logins and
// signed-in API use must not exhaust a shared per-IP budget, while failed
// logins and anonymous traffic stay limited.
describe("login throttling counts failures, not successes", () => {
  test("many successful logins from one IP are never blocked", async () => {
    const users = await Promise.all(Array.from({ length: 4 }, () => createStaffUser({ role: "EMPLOYEE" })));
    for (let round = 0; round < 4; round += 1) {
      for (const user of users) {
        const res = await request(app).post("/api/auth/login").send({ email: user.email, password: user.password });
        assert.equal(res.status, 200, `login ${round} for ${user.email}`);
      }
    }
  });

  test("ten failures lock that account from this IP; colleagues on the same IP still sign in", async () => {
    const target = await createStaffUser({ role: "EMPLOYEE" });
    const colleague = await createStaffUser({ role: "EMPLOYEE" });
    for (let i = 0; i < 10; i += 1) {
      assert.equal((await request(app).post("/api/auth/login").send({ email: target.email, password: "wrong-password" })).status, 401);
    }
    const locked = await request(app).post("/api/auth/login").send({ email: target.email, password: target.password });
    assert.equal(locked.status, 429);
    assert.equal(locked.body.code, "LOGIN_RATE_LIMITED");
    assert.equal((await request(app).post("/api/auth/login").send({ email: colleague.email, password: colleague.password })).status, 200);
  });
});

describe("API rate limit keyed by session, IP for anonymous callers", () => {
  function limitedApp() {
    const testApp = express();
    testApp.use(cookieParser());
    testApp.use(createApiRateLimiter({ anonymousLimit: 3, sessionLimit: 20 }));
    testApp.get("/ping", (req, res) => res.json({ ok: true }));
    return testApp;
  }

  test("anonymous requests from one IP are limited", async () => {
    const testApp = limitedApp();
    const statuses = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await request(testApp).get("/ping")).status);
    assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
  });

  test("several signed-in staff on one IP each get their own budget; a forged token does not", async () => {
    const testApp = limitedApp();
    const tokens = ["u1", "u2", "u3"].map((sub) => signAccessToken({ sub, role: "EMPLOYEE", sv: 0 }));
    for (let i = 0; i < 6; i += 1) {
      for (const token of tokens) {
        assert.equal((await request(testApp).get("/ping").set("Cookie", `accessToken=${token}`)).status, 200);
      }
    }
    const forgedStatuses = [];
    for (let i = 0; i < 5; i += 1) forgedStatuses.push((await request(testApp).get("/ping").set("Authorization", "Bearer not.a.token")).status);
    assert.ok(forgedStatuses.includes(429), `forged tokens fall back to the IP limit: ${forgedStatuses}`);
  });
});
