import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import app from "../src/app.js";
import { uniqueSuffix } from "./helpers/api.js";

// The Android app (Capacitor 8, CapacitorHttp enabled) sends every request
// through the native HTTP stack, not the WebView: there is no Origin, Referer
// or Sec-Fetch-Site header, and a global native cookie jar replays any
// session cookie the API ever set (customerAccessToken after a sign-in,
// trackingAccessToken after a phone-code sign-in). With such a cookie in the
// jar, a write without a Bearer token (registration, sign-in, tracking code)
// must prove its provenance; the app does it with X-Requested-With, the same
// custom header the back-office sends and no cross-site page can set without
// a CORS preflight. Staging failure (2026-10-12): the APK sent nothing, so
// registration was rejected with CSRF_REJECTED.

const NATIVE_APP = { "X-Requested-With": "com.nasaemalharamain.app" };
const STALE_COOKIES = "customerAccessToken=stale.jwt.value; trackingAccessToken=stale.tracking.value";

// Exactly the headers given (no test defaults), plus the replayed cookies.
function nativeWrite(url, headers = {}) {
  let req = request(app).post(url).set("X-No-Default-Headers", "1").set("Cookie", STALE_COOKIES).set("Accept", "application/json");
  for (const [name, value] of Object.entries(headers)) req = req.set(name, value);
  return req;
}

const registration = () => ({ fullName: "عميل تطبيق أندرويد", phone: `0917${uniqueSuffix()}`.slice(0, 12), password: "Native@App12345" });

describe("native Android app writes with a replayed session cookie", () => {
  test("the app's request shape (no Origin, X-Requested-With) registers", async () => {
    const res = await nativeWrite("/api/customer-auth/register", NATIVE_APP).send(registration());
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.data?.token, "the app keeps the returned token (Bearer from then on)");
  });

  test("the same request without the header (the efa3bc7 APK) is refused, as before", async () => {
    const res = await nativeWrite("/api/customer-auth/register").send(registration());
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "CSRF_REJECTED");
  });

  test("the header never overrides an untrusted Origin, the null origin or cross-site fetch metadata", async () => {
    for (const headers of [
      { Origin: "https://evil.example" },
      { Origin: "null" },
      // The WebView's own page origin is not a trusted origin either: the app
      // never sends it (native HTTP), so nothing needs to trust it.
      { Origin: "https://localhost" },
      { "Sec-Fetch-Site": "cross-site" },
      { Referer: "https://evil.example/page" },
    ]) {
      const res = await nativeWrite("/api/customer-auth/register", { ...NATIVE_APP, ...headers }).send(registration());
      assert.equal(res.status, 403, `expected rejection for ${JSON.stringify(headers)}`);
      assert.equal(res.body.code, "CSRF_REJECTED");
    }
  });

  test("tracking sign-in codes from the app pass with the header and fail without it", async () => {
    const ok = await nativeWrite("/api/tracking/request-code", NATIVE_APP).send({ phone: `0918${uniqueSuffix()}`.slice(0, 12) });
    assert.notEqual(ok.status, 403, JSON.stringify(ok.body));
    const refused = await nativeWrite("/api/tracking/request-code").send({ phone: `0918${uniqueSuffix()}`.slice(0, 12) });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.code, "CSRF_REJECTED");
  });
});
