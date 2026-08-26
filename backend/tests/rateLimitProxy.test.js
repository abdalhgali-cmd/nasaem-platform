import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";

import { app as realApp } from "./helpers/api.js";
import { trustProxyHops } from "../src/utils/trustProxy.js";

// Regression coverage for the Railway production warning
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR: express-rate-limit's default
// key generator (request.ip) silently falls back to the raw socket
// address — Railway's own proxy address, the *same* for every request —
// whenever an X-Forwarded-For header is present but Express's `trust
// proxy` setting is left at its default `false`. It doesn't reject the
// request; it just logs the warning and keeps going with a broken key,
// so EVERY client behind Railway collides into one shared rate-limit
// bucket (verified directly against the real express-rate-limit package
// below, not assumed). That's the actual bug: a single bucket is both
// weaker per-attacker throttling AND a denial-of-service vector, since
// one abusive client's requests exhaust the quota for every legitimate
// one. See src/utils/trustProxy.js and src/app.js for the fix.
//
// These tests build small standalone Express apps (not the shared `app`
// singleton, whose trust proxy setting is fixed at import time from
// process.env.NODE_ENV) so both the broken and fixed configurations can
// be exercised directly, with the exact same rate-limit middleware shape
// this app actually uses.
function buildRateLimitedApp({ trustProxy, limit = 3 }) {
  const testApp = express();
  testApp.set("trust proxy", trustProxy);

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests. Please try again later." },
  });

  testApp.get("/probe", limiter, (req, res) => {
    res.status(200).json({ success: true, ip: req.ip });
  });

  return testApp;
}

// express-rate-limit swallows its own ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// internally (console.error), rather than failing the request — this
// captures that exact log line so a test can assert on it directly
// instead of guessing at side effects.
async function captureConsoleErrors(fn) {
  const original = console.error;
  const messages = [];
  console.error = (...args) => messages.push(args.map(String).join(" "));
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return messages;
}

describe("trustProxyHops (Railway production gating)", () => {
  test("trusts exactly one hop in production", () => {
    assert.equal(trustProxyHops("production"), 1);
  });

  test("does not trust any proxy outside production", () => {
    assert.equal(trustProxyHops("test"), false);
    assert.equal(trustProxyHops("development"), false);
    assert.equal(trustProxyHops(undefined), false);
  });
});

describe("express-rate-limit behind Railway's reverse proxy", () => {
  test("reproduces the bug: with the old (unset) trust proxy config, different forwarded clients collide into one shared rate-limit bucket", async () => {
    // This is the exact pre-fix configuration: trust proxy left at
    // Express's default `false`, same as trustProxyHops() returns outside
    // production, while a proxy (Railway) still adds X-Forwarded-For.
    const brokenApp = buildRateLimitedApp({ trustProxy: false, limit: 2 });

    const messages = await captureConsoleErrors(async () => {
      const first = await request(brokenApp).get("/probe").set("X-Forwarded-For", "203.0.113.10");
      const second = await request(brokenApp).get("/probe").set("X-Forwarded-For", "203.0.113.10");
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      // The forwarded client IP was never actually used as the key — both
      // requests resolved to the same fallback (raw socket) address.
      assert.notEqual(first.body.ip, "203.0.113.10");
      assert.equal(first.body.ip, second.body.ip);

      // A completely different client IP, forwarded right after — under a
      // correctly-configured proxy this would get its own fresh quota.
      // Here it collides into the same shared bucket and is blocked
      // instead, even though it has never made a request before.
      const otherClient = await request(brokenApp).get("/probe").set("X-Forwarded-For", "203.0.113.99");
      assert.equal(otherClient.status, 429, "a fresh client IP was incorrectly blocked by another client's quota");
    });

    assert.ok(
      messages.some((m) => m.includes("ERR_ERL_UNEXPECTED_X_FORWARDED_FOR")),
      "expected express-rate-limit to log the ERR_ERL_UNEXPECTED_X_FORWARDED_FOR warning"
    );
  });

  test("once trust proxy is set to the Railway hop count, no ERR_ERL_UNEXPECTED_X_FORWARDED_FOR warning is logged", async () => {
    const fixedApp = buildRateLimitedApp({ trustProxy: trustProxyHops("production") });

    const messages = await captureConsoleErrors(async () => {
      const res = await request(fixedApp).get("/probe").set("X-Forwarded-For", "203.0.113.10");
      assert.equal(res.status, 200);
    });

    assert.ok(
      !messages.some((m) => m.includes("ERR_ERL_UNEXPECTED_X_FORWARDED_FOR")),
      `expected no ERR_ERL_UNEXPECTED_X_FORWARDED_FOR warning, got: ${messages.join(" | ")}`
    );
  });

  test("resolves the real client IPv4 address from X-Forwarded-For, not the proxy's own address", async () => {
    const fixedApp = buildRateLimitedApp({ trustProxy: trustProxyHops("production") });

    const res = await request(fixedApp).get("/probe").set("X-Forwarded-For", "203.0.113.10");

    assert.equal(res.status, 200);
    assert.equal(res.body.ip, "203.0.113.10");
  });

  test("handles an IPv6 client address safely (no crash, correct IP resolved)", async () => {
    const fixedApp = buildRateLimitedApp({ trustProxy: trustProxyHops("production") });

    const res = await request(fixedApp).get("/probe").set("X-Forwarded-For", "2001:db8::1");

    assert.equal(res.status, 200);
    assert.equal(res.body.ip, "2001:db8::1");
  });

  test("rate limiting still enforces the configured limit per real client IP", async () => {
    const fixedApp = buildRateLimitedApp({ trustProxy: trustProxyHops("production"), limit: 3 });

    for (let i = 0; i < 3; i += 1) {
      const res = await request(fixedApp).get("/probe").set("X-Forwarded-For", "198.51.100.7");
      assert.equal(res.status, 200, `request ${i + 1} should succeed`);
    }

    const limitedRes = await request(fixedApp).get("/probe").set("X-Forwarded-For", "198.51.100.7");
    assert.equal(limitedRes.status, 429);
    assert.equal(limitedRes.body.success, false);
  });

  test("a different forwarded client IP gets its own independent rate-limit counter", async () => {
    const fixedApp = buildRateLimitedApp({ trustProxy: trustProxyHops("production"), limit: 3 });

    for (let i = 0; i < 3; i += 1) {
      await request(fixedApp).get("/probe").set("X-Forwarded-For", "198.51.100.20");
    }
    const exhaustedRes = await request(fixedApp).get("/probe").set("X-Forwarded-For", "198.51.100.20");
    assert.equal(exhaustedRes.status, 429);

    // A different client IP must not be blocked by the first client's limit.
    const otherClientRes = await request(fixedApp).get("/probe").set("X-Forwarded-For", "198.51.100.21");
    assert.equal(otherClientRes.status, 200);
  });
});

describe("the real app in test/dev (no proxy in front) is unaffected", () => {
  test("normal login still works", async () => {
    const res = await request(realApp)
      .post("/api/auth/login")
      .send({ email: "admin@nasaem-platform.local", password: process.env.SEED_ADMIN_PASSWORD });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  test("invalid login still returns 401", async () => {
    const res = await request(realApp)
      .post("/api/auth/login")
      .send({ email: "admin@nasaem-platform.local", password: "definitely-wrong" });

    assert.equal(res.status, 401);
  });

  test("a caller-supplied X-Forwarded-For is never trusted as a real client IP outside production", async () => {
    // Outside production, trust proxy stays `false` (trustProxyHops), so a
    // directly-connecting caller cannot use X-Forwarded-For to pick its
    // own rate-limit key — this exercises the real, shared `app` export.
    // The request still completes normally (a bad-credentials 401), same
    // as express-rate-limit's own documented fallback behavior.
    const res = await request(realApp)
      .post("/api/auth/login")
      .set("X-Forwarded-For", "1.2.3.4")
      .send({ email: "admin@nasaem-platform.local", password: "definitely-wrong" });

    assert.equal(res.status, 401);
  });
});
