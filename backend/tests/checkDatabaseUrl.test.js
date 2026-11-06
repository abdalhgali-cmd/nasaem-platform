import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { databaseTarget } from "../src/scripts/check-database-url.js";

const SCRIPT = fileURLToPath(new URL("../src/scripts/check-database-url.js", import.meta.url));
const URL_OK = "postgresql://app:s3cr%40t@postgres.railway.internal:5432/railway?sslmode=require";

test("an empty DATABASE_URL (unresolved Railway reference) is refused with the fix", () => {
  for (const value of [undefined, "", "   "]) {
    const result = databaseTarget({ DATABASE_URL: value });
    assert.equal(result.ok, false);
    assert.match(result.reason, /empty/);
    assert.match(result.reason, /reference/);
  }
});

test("malformed or non-PostgreSQL URLs are refused", () => {
  assert.equal(databaseTarget({ DATABASE_URL: "not a url" }).ok, false);
  assert.equal(databaseTarget({ DATABASE_URL: "mysql://u:p@h/db" }).ok, false);
  assert.equal(databaseTarget({ DATABASE_URL: "postgresql://u:p@h:5432/" }).ok, false);
});

test("a valid URL passes; host, port and name only", () => {
  const result = databaseTarget({ DATABASE_URL: URL_OK });
  assert.deepEqual(result, { ok: true, pinned: false, target: { host: "postgres.railway.internal", port: "5432", name: "railway" } });
});

test("EXPECTED_DATABASE_HOST / _NAME pin the target: a different database is refused", () => {
  assert.equal(databaseTarget({ DATABASE_URL: URL_OK, EXPECTED_DATABASE_HOST: "postgres.railway.internal", EXPECTED_DATABASE_NAME: "railway" }).pinned, true);
  assert.match(databaseTarget({ DATABASE_URL: URL_OK, EXPECTED_DATABASE_HOST: "staging-db.internal" }).reason, /unintended/);
  assert.match(databaseTarget({ DATABASE_URL: URL_OK, EXPECTED_DATABASE_NAME: "nasaem_staging" }).reason, /unintended/);
});

test("the CLI exits 1 on an empty URL and never prints credentials", () => {
  const run = (env) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [SCRIPT], { env: { PATH: process.env.PATH, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
    } catch (error) {
      return { code: error.status, out: `${error.stdout}${error.stderr}` };
    }
  };
  const empty = run({ DATABASE_URL: "" });
  assert.equal(empty.code, 1);
  assert.match(empty.out, /refused: DATABASE_URL is empty/);
  const ok = run({ DATABASE_URL: URL_OK });
  assert.equal(ok.code, 0);
  assert.match(ok.out, /postgres\.railway\.internal:5432\/railway/);
  assert.doesNotMatch(ok.out, /s3cr|app:/);
  const wrong = run({ DATABASE_URL: URL_OK, EXPECTED_DATABASE_HOST: "other.internal" });
  assert.equal(wrong.code, 1);
  assert.doesNotMatch(wrong.out, /s3cr/);
});
