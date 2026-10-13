import test from "node:test";
import assert from "node:assert/strict";
import { APP_REQUEST_HEADER, buildHeaders, setSessionToken } from "../www/js/api.js";

// Staging regression (2026-10-12): registration from the APK was refused with
// CSRF_REJECTED. Every request must carry the app's provenance header, with
// or without a session, JSON or multipart (backend tests/nativeAppCsrf.test.js).
test("every API request carries the app's X-Requested-With header", () => {
  setSessionToken(null);
  assert.equal(APP_REQUEST_HEADER.name, "X-Requested-With");
  assert.equal(buildHeaders(undefined, false)["X-Requested-With"], "com.nasaemalharamain.app");
  assert.equal(buildHeaders(undefined, true)["X-Requested-With"], "com.nasaemalharamain.app");
  assert.equal(buildHeaders({ Authorization: "" }, false)["X-Requested-With"], "com.nasaemalharamain.app", "tracking calls too");
  setSessionToken("t");
  const signedIn = buildHeaders(undefined, false);
  assert.equal(signedIn["X-Requested-With"], "com.nasaemalharamain.app");
  assert.equal(signedIn.Authorization, "Bearer t");
  setSessionToken(null);
});
