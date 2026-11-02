import fs from "node:fs";
import "./env.js";
import { test } from "node:test";
import assert from "node:assert/strict";

import { checkSync, expectedOutputs } from "../../scripts/sync-static-admin.mjs";

// The staff back-office has one maintained source (backend/public). The
// Vercel copy under web/public is generated from it; this fails CI whenever
// someone edits one without regenerating the other.
test("web/public's back-office copy is generated from backend/public and up to date", () => {
  const { outdated, stale } = checkSync();
  assert.deepEqual(outdated, [], "run: node scripts/sync-static-admin.mjs");
  assert.deepEqual(stale, []);
});

test("only api.js differs in substance: the Vercel copy picks the API host and never targets production from a preview", () => {
  const api = expectedOutputs().find((o) => o.relativePath.endsWith("api.js")).content;
  assert.match(api, /PRODUCTION_WEB_HOSTS\.has\(window\.location\.hostname\)/);
  assert.match(api, /: "\/api";/, "unknown hosts fail closed to same-origin /api");
  assert.doesNotMatch(api, /^const API_BASE = "\/api";$/m);
  assert.match(api, /X-Requested-With/, "the copy sends the CSRF header too");
});

test("the Railway staging website uses the staging API, never Production; the copy forwards to the unified admin", () => {
  const api = expectedOutputs().find((o) => o.relativePath.endsWith("api.js")).content;
  assert.match(api, /STAGING_WEB_HOSTS = new Set\(\["nasaem-website-staging-staging\.up\.railway\.app"\]\)/);
  assert.match(api, /STAGING_API_BASE = "https:\/\/adaptable-quietude-staging\.up\.railway\.app\/api"/);
  assert.doesNotMatch(api.match(/STAGING_API_BASE = "[^"]*"/)[0], /production/);
  assert.match(api, /const UNIFIED_ADMIN_PATH = "\/admin";/);
  const source = fs.readFileSync(new URL("../public/assets/api.js", import.meta.url), "utf8");
  assert.match(source, /const UNIFIED_ADMIN_PATH = null;/, "the API host's own copy is unchanged");
});
