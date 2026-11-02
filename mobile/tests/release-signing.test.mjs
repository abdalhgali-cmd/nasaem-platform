import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const SCRIPT = new URL("../scripts/verify-release-cert.sh", import.meta.url).pathname;
const DEBUG = "cd7447b277c7d1dbefcac2aa4751993bca3027afdec8d9bfb7a644ad9464fc72";
const RELEASE = "0123456789abcdef".repeat(4);
const OTHER = "fedcba9876543210".repeat(4);

function run(...args) {
  const result = spawnSync("bash", [SCRIPT, ...args], { encoding: "utf8" });
  return { code: result.status, out: result.stdout.trim(), err: result.stderr };
}

test("ANDROID_RELEASE_CERT_SHA256 is mandatory and must be a real, non-debug fingerprint", () => {
  assert.notEqual(run("").code, 0);
  assert.match(run("").err, /ANDROID_RELEASE_CERT_SHA256 is not set/);
  assert.notEqual(run("   ").code, 0);
  assert.notEqual(run("abc123").code, 0);
  assert.notEqual(run("zz".repeat(32)).code, 0);
  assert.notEqual(run(DEBUG).code, 0, "the public debug certificate is never a release pin");
  assert.deepEqual([run(RELEASE).code, run(RELEASE).out], [0, RELEASE]);
  // keytool prints AA:BB:... upper case; both spellings are the same pin
  const colons = RELEASE.toUpperCase().match(/../g).join(":");
  assert.deepEqual([run(colons).code, run(colons).out], [0, RELEASE]);
});

test("the built artifact must carry exactly the pinned certificate", () => {
  assert.equal(run(RELEASE, RELEASE).code, 0);
  assert.equal(run(RELEASE, RELEASE.toUpperCase().match(/../g).join(":")).code, 0);
  const mismatch = run(RELEASE, OTHER);
  assert.notEqual(mismatch.code, 0);
  assert.match(mismatch.err, /differs from ANDROID_RELEASE_CERT_SHA256/);
  assert.notEqual(run(RELEASE, DEBUG).code, 0);
  assert.notEqual(run(RELEASE, "").code, 0, "an unreadable signature fails");
  assert.notEqual(run("", RELEASE).code, 0, "no pin, no release, whatever the artifact");
});

test("the release workflow requires the pin up front and checks both the APK and the AAB", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/android-release.yml", import.meta.url), "utf8");
  assert.match(workflow, /EXPECTED_CERT_SHA256: \$\{\{ vars\.ANDROID_RELEASE_CERT_SHA256 \}\}/);
  assert.match(workflow, /\[ -z "\$EXPECTED_CERT_SHA256" \] && missing="\$missing ANDROID_RELEASE_CERT_SHA256\(variable\)"/);
  assert.match(workflow, /\.\/scripts\/verify-release-cert\.sh "\$EXPECTED_CERT_SHA256" >\/dev\/null/);
  assert.match(workflow, /verify-release-cert\.sh "\$EXPECTED_CERT_SHA256" "\$ACTUAL"/);
  assert.match(workflow, /verify-release-cert\.sh "\$EXPECTED_CERT_SHA256" "\$AAB_CERT"/);
  // the old optional check (skip when unset, warn only) is gone
  assert.doesNotMatch(workflow, /-n "\$EXPECTED_CERT_SHA256"/);
  assert.doesNotMatch(workflow, /::warning::ANDROID_RELEASE_CERT_SHA256/);
  // the pin is checked before the build starts
  assert.ok(workflow.indexOf("verify-release-cert.sh \"$EXPECTED_CERT_SHA256\" >/dev/null") < workflow.indexOf("./gradlew assembleRelease"));
});
