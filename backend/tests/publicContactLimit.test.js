import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Anonymous request submissions: 5 per client per 15 minutes.
// PUBLIC_CONTACT_RATE_LIMIT may raise it only in a test or development
// process (the browser E2E backend runs with NODE_ENV=development); in
// production — or with NODE_ENV unset — it is ignored.

const backendDir = fileURLToPath(new URL("..", import.meta.url));

// Starts the real app in a separate process with the given environment and
// sends `count` submissions from one client. The body is invalid on purpose
// (nothing is written): the limiter counts the attempt before validation.
function statusesUnder(env, count) {
  const script = `
    const { default: app } = await import("./src/app.js");
    const { default: request } = await import("supertest");
    const statuses = [];
    for (let i = 0; i < ${count}; i += 1) {
      const res = await request(app).post("/api/contact-requests").set("X-Requested-With", "XMLHttpRequest").send({});
      statuses.push(res.status);
    }
    console.log(JSON.stringify(statuses));
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: backendDir,
    env: { ...process.env, WHATSAPP_API_TOKEN: "", WHATSAPP_PHONE_NUMBER_ID: "", UPLOAD_ROOT: mkdtempSync(path.join(tmpdir(), "nasaem-contact-limit-")), ...env },
    encoding: "utf8",
    timeout: 60_000,
  });
  const line = result.stdout.trim().split("\n").filter(Boolean).pop();
  assert.ok(line, `child failed: ${result.stderr}`);
  return JSON.parse(line);
}

describe("public contact submission limiter", () => {
  test("resolvePublicContactLimit honours the override only in test/development", async () => {
    const { resolvePublicContactLimit } = await import("../src/modules/contact-requests/public-contact-limit.js");
    assert.equal(resolvePublicContactLimit({ NODE_ENV: "production", PUBLIC_CONTACT_RATE_LIMIT: "80" }), 5);
    assert.equal(resolvePublicContactLimit({ PUBLIC_CONTACT_RATE_LIMIT: "80" }), 5, "NODE_ENV unset is not a test environment");
    assert.equal(resolvePublicContactLimit({ NODE_ENV: "staging", PUBLIC_CONTACT_RATE_LIMIT: "80" }), 5);
    assert.equal(resolvePublicContactLimit({ NODE_ENV: "development", PUBLIC_CONTACT_RATE_LIMIT: "80" }), 80);
    assert.equal(resolvePublicContactLimit({ NODE_ENV: "test", PUBLIC_CONTACT_RATE_LIMIT: "80" }), 80);
    for (const invalid of [undefined, "", "abc", "0", "-3", "2.5", "100000"]) {
      assert.equal(resolvePublicContactLimit({ NODE_ENV: "test", PUBLIC_CONTACT_RATE_LIMIT: invalid }), 5, `invalid ${invalid}`);
    }
  });

  test("production with PUBLIC_CONTACT_RATE_LIMIT=80 still refuses the 6th submission", () => {
    const statuses = statusesUnder({ NODE_ENV: "production", PUBLIC_CONTACT_RATE_LIMIT: "80" }, 6);
    assert.ok(statuses.slice(0, 5).every((s) => s !== 429), JSON.stringify(statuses));
    assert.equal(statuses[5], 429, JSON.stringify(statuses));
  });

  test("the development (E2E) backend uses its override", () => {
    const statuses = statusesUnder({ NODE_ENV: "development", PUBLIC_CONTACT_RATE_LIMIT: "8" }, 9);
    assert.deepEqual(statuses.slice(0, 8).filter((s) => s === 429), [], JSON.stringify(statuses));
    assert.equal(statuses[8], 429);
  });

  test("an invalid override in a test process falls back to 5", () => {
    const statuses = statusesUnder({ NODE_ENV: "test", PUBLIC_CONTACT_RATE_LIMIT: "lots" }, 6);
    assert.equal(statuses[5], 429, JSON.stringify(statuses));
  });
});
