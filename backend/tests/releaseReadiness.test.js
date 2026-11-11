import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { collectReadiness } from "../src/scripts/release-readiness.js";

// Other suites price (or unprice) the Egypt variants, so the order tests run
// in must not decide these results: the check reads the real database except
// for the Egypt rows, where the air variant is given as unpriced.
const unpricedEgyptDb = new Proxy(prisma, {
  get(target, key) {
    if (key !== "visaType") return Reflect.get(target, key);
    return {
      findMany: async () => [
        { code: "VISA-EGYPT-CLEARANCE-AIR", name: "جوي", active: true, pricingMode: "QUOTE", basePrice: 0, currency: "USD", priceUnit: "PER_PERSON" },
        { code: "VISA-EGYPT-CLEARANCE-BORDER", name: "بري", active: true, pricingMode: "FIXED", basePrice: 155, currency: "USD", priceUnit: "PER_PERSON" },
      ],
    };
  },
});

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
    assert.equal(report.environment.PUBLIC_INTAKE_SCOPE, "UMRAH,EGYPT_CLEARANCE,FLIGHT,FERRY,HOTEL,FAMILY_VISIT,VISA,GENERAL");
  });

  test("missing WhatsApp, unwritable uploads in production and unpriced services are blockers", async () => {
    // Production with prices approved by the owner (PRICES_APPROVED=true).
    const report = await collectReadiness({ db: unpricedEgyptDb, env: { NODE_ENV: "production", PRICES_APPROVED: "true", JWT_SECRET: "y".repeat(40), CORS_ORIGIN: "https://example.test" } });
    assert.ok(report.blockers.some((b) => b.includes("واتساب")), JSON.stringify(report.blockers));
    assert.ok(report.blockers.some((b) => b.includes("UPLOAD_ROOT")));
    // An unpriced variant is reported, never invented; on production it blocks.
    assert.ok(report.blockers.some((b) => b.includes("VISA-EGYPT-CLEARANCE-AIR")));
    assert.equal(report.blockers.some((b) => b.includes("VISA-EGYPT-CLEARANCE-BORDER")), false);
    assert.ok(Array.isArray(report.prices.umrah) && report.prices.umrah.length > 0);
    assert.equal(report.prices.testData, false);
  });

  test("production before the owner approves the prices: test data, an unpriced service is a warning", async () => {
    const report = await collectReadiness({ db: unpricedEgyptDb, env: { NODE_ENV: "production", JWT_SECRET: "y".repeat(40), CORS_ORIGIN: "https://example.test" } });
    assert.equal(report.prices.testData, true);
    assert.equal(report.environment.deployment, "production");
    assert.equal(report.environment.PRICES_APPROVED, "not set");
    assert.equal(report.blockers.some((b) => b.includes("VISA-EGYPT-CLEARANCE-AIR")), false, JSON.stringify(report.blockers));
    assert.ok(report.warnings.some((w) => w.includes("VISA-EGYPT-CLEARANCE-AIR")), JSON.stringify(report.warnings));
    assert.ok(report.blockers.some((b) => b.includes("واتساب")));
  });

  test("outside production the prices are test data: an unpriced service is a warning, not a blocker", async () => {
    const report = await collectReadiness({ db: unpricedEgyptDb, env: { NODE_ENV: "production", DEPLOYMENT_ENVIRONMENT: "staging", JWT_SECRET: "y".repeat(40), CORS_ORIGIN: "https://example.test" } });
    assert.equal(report.prices.testData, true);
    assert.equal(report.environment.deployment, "staging");
    assert.equal(report.blockers.some((b) => b.includes("VISA-EGYPT-CLEARANCE-AIR")), false, JSON.stringify(report.blockers));
    assert.ok(report.warnings.some((w) => w.includes("VISA-EGYPT-CLEARANCE-AIR")), JSON.stringify(report.warnings));
    // Configuration that is not a price still blocks on staging.
    assert.ok(report.blockers.some((b) => b.includes("واتساب")));
  });
});

describe("deployment labels", () => {
  test("only the production deployment with owner-approved prices has real prices", async () => {
    const { deploymentName, pricesAreTestData } = await import("../src/config/deployment.js");
    // Production prices stay test data until the owner approves them.
    assert.equal(pricesAreTestData({ NODE_ENV: "production" }), true);
    assert.equal(pricesAreTestData({ NODE_ENV: "production", DEPLOYMENT_ENVIRONMENT: "production" }), true);
    assert.equal(pricesAreTestData({ NODE_ENV: "production", PRICES_APPROVED: "yes" }), true);
    assert.equal(pricesAreTestData({ NODE_ENV: "production", PRICES_APPROVED: "true" }), false);
    assert.equal(pricesAreTestData({ NODE_ENV: "production", DEPLOYMENT_ENVIRONMENT: "staging", PRICES_APPROVED: "true" }), true);
    assert.equal(pricesAreTestData({ NODE_ENV: "production", DEPLOYMENT_ENVIRONMENT: "staging" }), true);
    assert.equal(pricesAreTestData({ NODE_ENV: "development", DEPLOYMENT_ENVIRONMENT: "production" }), true);
    assert.equal(pricesAreTestData({ NODE_ENV: "test" }), true);
    assert.equal(deploymentName({ NODE_ENV: "production", DEPLOYMENT_ENVIRONMENT: "Staging" }), "staging");
    // An unexpected value (e.g. a key pasted into the wrong variable) is never echoed.
    const pasted = "b".repeat(64);
    assert.equal(deploymentName({ NODE_ENV: "production", DEPLOYMENT_ENVIRONMENT: pasted }), "unrecognized");
    assert.equal(deploymentName({ NODE_ENV: "development", DEPLOYMENT_ENVIRONMENT: pasted }), "unrecognized");
    assert.equal(pricesAreTestData({ NODE_ENV: "production", DEPLOYMENT_ENVIRONMENT: pasted, PRICES_APPROVED: "true" }), true);
  });

  test("/api/health tells the website and dashboard whether prices are test data", async () => {
    const { app, request } = await import("./helpers/api.js");
    const res = await request(app).get("/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.pricesAreTestData, true, "the test suite never runs as production");
    assert.equal(typeof res.body.environment, "string");
  });

  test("/api/health never exposes an accidentally pasted deployment secret", async () => {
    const { app, request } = await import("./helpers/api.js");
    const original = process.env.DEPLOYMENT_ENVIRONMENT;
    const pastedSecret = "test-only-private-value-" + "a".repeat(64);
    try {
      process.env.DEPLOYMENT_ENVIRONMENT = pastedSecret;
      const res = await request(app).get("/api/health");
      assert.equal(res.status, 200);
      assert.equal(res.body.environment, "unrecognized");
      assert.equal(res.body.pricesAreTestData, true);
      assert.equal(res.text.includes(pastedSecret), false);
      process.env.DEPLOYMENT_ENVIRONMENT = "Staging";
      assert.equal((await request(app).get("/api/health")).body.environment, "staging");
    } finally {
      if (original === undefined) delete process.env.DEPLOYMENT_ENVIRONMENT;
      else process.env.DEPLOYMENT_ENVIRONMENT = original;
    }
  });
});
