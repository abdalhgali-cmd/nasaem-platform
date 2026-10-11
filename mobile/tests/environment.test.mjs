import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { environmentBadge } from "../www/js/environment.js";

test("test builds show which environment they use; the production build never shows a badge", () => {
  assert.match(environmentBadge({ environment: "staging" }), /staging/);
  assert.match(environmentBadge({ environment: "e2e" }), /e2e/);
  assert.ok(environmentBadge({}), "an unspecified environment is flagged, not hidden");
  assert.equal(environmentBadge({ environment: "production" }), null);
  assert.equal(environmentBadge({ environment: " Production " }), null);
});

test("the repository config is a staging build and the release workflow forces production", () => {
  assert.match(readFileSync(new URL("../www/js/config.js", import.meta.url), "utf8"), /environment: "staging"/);
  const release = readFileSync(new URL("../../.github/workflows/android-release.yml", import.meta.url), "utf8");
  assert.match(release, /environment: \\"production\\"/);
});

import { execFileSync } from "node:child_process";

test("no signing key material is tracked except the publicly known QA debug key", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: new URL("../..", import.meta.url), encoding: "utf8" }).split("\n");
  const keyFiles = tracked.filter((file) => /\.(jks|keystore|p12|pfx)$/i.test(file) || /keystore/i.test(file));
  assert.deepEqual(keyFiles.filter((file) => file !== "mobile/android-debug.keystore.b64" && file !== "mobile/scripts/create-release-keystore.sh"), []);
  const gradle = readFileSync(new URL("../android/app/build.gradle", import.meta.url), "utf8");
  assert.doesNotMatch(gradle, /storePassword\s+"(?!android")/, "no release password in source");
  assert.match(gradle, /System\.getenv\("NASAEM_RELEASE_STORE_PASSWORD"\)/);
});
