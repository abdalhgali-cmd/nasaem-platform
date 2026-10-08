import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRootModule = path.resolve(__dirname, "../src/config/uploadRoot.js");

// uploadRoot.js's production fail-closed check only runs at module import
// time, so it can't be exercised in-process without also poisoning every
// other test's NODE_ENV — a disposable child process is the only way to
// observe it in isolation.
function importUploadRootIn(env) {
  return spawnSync(process.execPath, ["--input-type=module", "-e", `import ${JSON.stringify(uploadRootModule)};`], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

describe("uploadRoot.js production fail-closed guard", () => {
  test("throws when NODE_ENV=production and UPLOAD_ROOT is unset", () => {
    const result = importUploadRootIn({ NODE_ENV: "production", UPLOAD_ROOT: "" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /UPLOAD_ROOT is required/);
  });

  test("throws when NODE_ENV=production and UPLOAD_ROOT is a relative path", () => {
    const result = importUploadRootIn({ NODE_ENV: "production", UPLOAD_ROOT: "uploads" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must be an absolute path/);
  });

  test("succeeds when NODE_ENV=production and UPLOAD_ROOT is an absolute path", () => {
    const result = importUploadRootIn({ NODE_ENV: "production", UPLOAD_ROOT: "/data/uploads" });
    assert.equal(result.status, 0, result.stderr);
  });

  test("does not require UPLOAD_ROOT outside production", () => {
    const result = importUploadRootIn({ NODE_ENV: "test", UPLOAD_ROOT: "" });
    assert.equal(result.status, 0, result.stderr);
  });
});
