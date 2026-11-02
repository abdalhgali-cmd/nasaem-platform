// AUDIT-00 G-12: the in-memory capture transport is for tests and local
// development only. In production it is ignored, so a message is never
// reported as accepted when nobody received it.
import "./env.js";
import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  clearCapturedProviderEmails,
  getCapturedProviderEmails,
  isCaptureTransport,
  sendCustomerEmail,
  sendProviderEmail,
} from "../src/utils/providerEmail.js";

const saved = {};
const KEYS = ["NODE_ENV", "PROVIDER_EMAIL_TRANSPORT", "PROVIDER_EMAIL_API_URL", "PROVIDER_EMAIL_API_KEY"];

beforeEach(() => {
  for (const key of KEYS) saved[key] = process.env[key];
  delete process.env.PROVIDER_EMAIL_API_URL;
  delete process.env.PROVIDER_EMAIL_API_KEY;
  process.env.PROVIDER_EMAIL_TRANSPORT = "capture";
  clearCapturedProviderEmails();
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  clearCapturedProviderEmails();
});

describe("capture transport", () => {
  test("captures outside production", async () => {
    process.env.NODE_ENV = "test";
    assert.equal(isCaptureTransport(), true);
    const result = await sendCustomerEmail({ to: "customer@example.test", subject: "s", text: "t" });
    assert.equal(result.status, "ACCEPTED");
    assert.equal(getCapturedProviderEmails().length, 1);
  });

  test("is ignored in production: nothing is reported as accepted or sent", async () => {
    process.env.NODE_ENV = "production";
    assert.equal(isCaptureTransport(), false);
    const customer = await sendCustomerEmail({ to: "customer@example.test", subject: "s", text: "t" });
    assert.deepEqual(customer, { status: "SKIPPED", reason: "NOT_CONFIGURED" });
    const provider = await sendProviderEmail({ to: "provider@example.test", subject: "s", body: "b" });
    assert.deepEqual(provider, { sent: false, reason: "NOT_CONFIGURED" });
    assert.equal(getCapturedProviderEmails().length, 0);
  });
});
