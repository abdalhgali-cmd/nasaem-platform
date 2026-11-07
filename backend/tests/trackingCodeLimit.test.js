import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// The tracking-code (OTP) request limit is 5 per client per 15 minutes.
// TRACKING_CODE_RATE_LIMIT may raise it only in a test or development
// process (the browser E2E backend runs with NODE_ENV=development); in
// production — or with NODE_ENV unset — it is ignored.

const backendDir = fileURLToPath(new URL("..", import.meta.url));

// Starts the real app in a separate process with the given environment and
// sends `count` code requests from one client; returns their statuses.
function statusesUnder(env, count) {
  const script = `
    const { default: app } = await import("./src/app.js");
    const { default: request } = await import("supertest");
    const statuses = [];
    for (let i = 0; i < ${count}; i += 1) {
      const res = await request(app).post("/api/tracking/request-code").set("X-Requested-With", "XMLHttpRequest").send({ phone: "0912345678" });
      statuses.push(res.status);
    }
    console.log(JSON.stringify(statuses));
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: backendDir,
    // production refuses to start without persistent upload storage
    env: { ...process.env, WHATSAPP_API_TOKEN: "", WHATSAPP_PHONE_NUMBER_ID: "", UPLOAD_ROOT: mkdtempSync(path.join(tmpdir(), "nasaem-limit-")), ...env },
    encoding: "utf8",
    timeout: 60_000,
  });
  const line = result.stdout.trim().split("\n").filter(Boolean).pop();
  assert.ok(line, `child failed: ${result.stderr}`);
  return JSON.parse(line);
}

describe("tracking code limiter", () => {
  test("resolveTrackingCodeLimit honours the override only in test/development", async () => {
    const { resolveTrackingCodeLimit } = await import("../src/modules/contact-request-tracking/tracking-code-limit.js");
    assert.equal(resolveTrackingCodeLimit({ NODE_ENV: "production", TRACKING_CODE_RATE_LIMIT: "30" }), 5);
    assert.equal(resolveTrackingCodeLimit({ TRACKING_CODE_RATE_LIMIT: "30" }), 5, "NODE_ENV unset is not a test environment");
    assert.equal(resolveTrackingCodeLimit({ NODE_ENV: "staging", TRACKING_CODE_RATE_LIMIT: "30" }), 5);
    assert.equal(resolveTrackingCodeLimit({ NODE_ENV: "development", TRACKING_CODE_RATE_LIMIT: "30" }), 30);
    assert.equal(resolveTrackingCodeLimit({ NODE_ENV: "test", TRACKING_CODE_RATE_LIMIT: "30" }), 30);
    for (const invalid of [undefined, "", "abc", "0", "-3", "2.5", "100000"]) {
      assert.equal(resolveTrackingCodeLimit({ NODE_ENV: "test", TRACKING_CODE_RATE_LIMIT: invalid }), 5, `invalid ${invalid}`);
    }
  });

  test("production with TRACKING_CODE_RATE_LIMIT=30 still refuses the 6th request", () => {
    const statuses = statusesUnder({ NODE_ENV: "production", TRACKING_CODE_RATE_LIMIT: "30" }, 6);
    assert.equal(statuses.filter((s) => s === 429).length, 1, JSON.stringify(statuses));
    assert.equal(statuses[5], 429);
  });

  test("the development (E2E) backend uses its override", () => {
    const statuses = statusesUnder({ NODE_ENV: "development", TRACKING_CODE_RATE_LIMIT: "8" }, 9);
    assert.deepEqual(statuses.slice(0, 8).filter((s) => s === 429), [], JSON.stringify(statuses));
    assert.equal(statuses[8], 429);
  });

  test("an invalid override in a test process falls back to 5", () => {
    const statuses = statusesUnder({ NODE_ENV: "test", TRACKING_CODE_RATE_LIMIT: "lots" }, 6);
    assert.equal(statuses[5], 429, JSON.stringify(statuses));
    assert.ok(statuses.slice(0, 5).every((s) => s !== 429));
  });
});
