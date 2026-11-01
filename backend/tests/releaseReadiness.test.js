import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { collectReadiness } from "../src/scripts/release-readiness.js";

// The read-only readiness check run on staging/production before a release.
describe("release readiness check", () => {
  test("never prints a secret value; reports secrets as present / missing", async () => {
    const env = {
      NODE_ENV: "production",
      JWT_SECRET: "x".repeat(40),
      CORS_ORIGIN: "https://example.test",
      WHATSAPP_API_TOKEN: "SECRET-WA-TOKEN-123",
      WHATSAPP_PHONE_NUMBER_ID: "SECRET-WA-PHONE-456",
      PROVIDER_EMAIL_API_URL: "https://mail.example.test/SECRET-PATH",
      PROVIDER_EMAIL_API_KEY: "SECRET-MAIL-KEY-789",
    };
    const report = await collectReadiness({ env });
    const text = JSON.stringify(report);
    for (const secret of ["SECRET-WA-TOKEN-123", "SECRET-WA-PHONE-456", "SECRET-PATH", "SECRET-MAIL-KEY-789", "x".repeat(40)]) {
      assert.equal(text.includes(secret), false, `leaked ${secret.slice(0, 12)}…`);
    }
    assert.equal(report.environment.WHATSAPP_API_TOKEN, "present");
    assert.equal(report.environment.JWT_SECRET, "present (40 chars)");
    assert.equal(report.environment.PUBLIC_INTAKE_SCOPE, "UMRAH,EGYPT_CLEARANCE");
  });

  test("missing WhatsApp, unwritable uploads in production and unpriced services are blockers", async () => {
    const report = await collectReadiness({ env: { NODE_ENV: "production", JWT_SECRET: "y".repeat(40), CORS_ORIGIN: "https://example.test" } });
    assert.ok(report.blockers.some((b) => b.includes("واتساب")), JSON.stringify(report.blockers));
    assert.ok(report.blockers.some((b) => b.includes("UPLOAD_ROOT")));
    // The seed leaves the Egypt variants unpriced: reported, never invented.
    assert.ok(report.blockers.some((b) => b.includes("VISA-EGYPT-CLEARANCE-AIR")));
    assert.ok(Array.isArray(report.prices.umrah) && report.prices.umrah.length > 0);
  });
});
