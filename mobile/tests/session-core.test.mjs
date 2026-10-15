// Unit tests for the session rules in www/js/session-core.js (pure module, no
// DOM or Capacitor). Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SessionState,
  classifySessionFailure,
  isSessionEndError,
  tokenExpiry,
  shouldRenew,
  verifyToken,
  biometricFailure,
} from "../www/js/session-core.js";

const DAY = 24 * 60 * 60 * 1000;
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const jwtWithExp = (expMs) => `${b64url({ alg: "HS256" })}.${b64url({ sub: "c1", exp: Math.floor(expMs / 1000) })}.sig`;
const apiError = (status, code = null) => Object.assign(new Error("x"), { status, code });

test("only a 401 ends a session; network, timeout, 5xx and rate limits never do", () => {
  assert.equal(classifySessionFailure(apiError(401, "SESSION_EXPIRED")), SessionState.EXPIRED);
  assert.equal(classifySessionFailure(apiError(401, "SESSION_REVOKED")), SessionState.EXPIRED);
  for (const status of [0, 408, 429, 500, 502, 503, 504, 404]) {
    assert.equal(classifySessionFailure(apiError(status)), SessionState.OFFLINE, `status ${status}`);
  }
  assert.equal(classifySessionFailure(new TypeError("Failed to fetch")), SessionState.OFFLINE);
  assert.equal(classifySessionFailure(undefined), SessionState.OFFLINE);
});

test("a 401 without a session code (e.g. wrong current password) is not a session verdict", () => {
  assert.equal(isSessionEndError(apiError(401, "SESSION_REVOKED")), true);
  assert.equal(isSessionEndError(apiError(401, "AUTH_REQUIRED")), true);
  assert.equal(isSessionEndError(apiError(401, null)), false);
  assert.equal(isSessionEndError(apiError(503, "SESSION_CHECK_UNAVAILABLE")), false);
});

test("verifyToken: no token → NO_SESSION without calling the server", async () => {
  let called = false;
  const result = await verifyToken(null, async () => {
    called = true;
  });
  assert.equal(result.state, SessionState.NO_SESSION);
  assert.equal(called, false);
});

test("verifyToken: server confirms → VALID with the profile", async () => {
  const result = await verifyToken("t", async () => ({ data: { id: "c1", fullName: "A" } }));
  assert.equal(result.state, SessionState.VALID);
  assert.equal(result.customer.id, "c1");
});

test("verifyToken: offline / timeout / server error → OFFLINE (session kept)", async () => {
  for (const error of [apiError(0), apiError(0, "TIMEOUT"), apiError(503, "SESSION_CHECK_UNAVAILABLE"), apiError(500)]) {
    const result = await verifyToken("t", async () => {
      throw error;
    });
    assert.equal(result.state, SessionState.OFFLINE);
    assert.equal(result.error, error);
  }
});

test("verifyToken: expired or revoked → EXPIRED", async () => {
  const result = await verifyToken("t", async () => {
    throw apiError(401, "SESSION_EXPIRED");
  });
  assert.equal(result.state, SessionState.EXPIRED);
});

test("tokenExpiry reads exp and tolerates junk", () => {
  const exp = Date.now() + 10 * DAY;
  assert.equal(tokenExpiry(jwtWithExp(exp)), Math.floor(exp / 1000));
  assert.equal(tokenExpiry("garbage"), null);
  assert.equal(tokenExpiry(""), null);
  assert.equal(tokenExpiry(null), null);
});

test("renewal: after a week of a 30-day token, earlier never; biometric only in the last week", () => {
  const now = Date.now();
  assert.equal(shouldRenew(jwtWithExp(now + 29 * DAY), { nowMs: now }), false);
  assert.equal(shouldRenew(jwtWithExp(now + 22 * DAY), { nowMs: now }), true);
  assert.equal(shouldRenew(jwtWithExp(now + 22 * DAY), { nowMs: now, biometric: true }), false);
  assert.equal(shouldRenew(jwtWithExp(now + 6 * DAY), { nowMs: now, biometric: true }), true);
  assert.equal(shouldRenew(jwtWithExp(now - DAY), { nowMs: now }), false, "an expired token is for the server to judge");
  assert.equal(shouldRenew("garbage", { nowMs: now }), false);
});

test("biometric failures: cancel stays quietly, lockout explains, invalidated/unsupported fall back to password", () => {
  assert.deepEqual(biometricFailure("CANCELLED"), { action: "stay", message: "" });
  assert.equal(biometricFailure("LOCKOUT").action, "stay");
  assert.match(biometricFailure("LOCKOUT").message, /كلمة المرور/);
  for (const code of ["KEY_INVALIDATED", "LOCKOUT_PERMANENT", "NONE_ENROLLED", "NO_HARDWARE", "UNSUPPORTED", "NOT_ENABLED"]) {
    const outcome = biometricFailure(code);
    assert.equal(outcome.action, "password", code);
    assert.ok(outcome.message.length > 0, code);
  }
  assert.equal(biometricFailure("SOMETHING_NEW").action, "stay");
});
