// T14: the synthetic performance script refuses anything but a local,
// disposable database.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { assertDisposableTarget, percentile } from "../src/scripts/perf-umrah-list.js";

describe("perf script guard", () => {
  test("accepts local disposable databases", () => {
    for (const url of ["postgresql://postgres@127.0.0.1:55432/nasaem_umrah_t02", "postgresql://u:p@localhost:5432/nasaem_platform_test", "postgresql://u@127.0.0.1/nasaem_perf"]) {
      assert.doesNotThrow(() => assertDisposableTarget(url), url);
    }
  });

  test("refuses remote hosts, production-looking names and invalid input", () => {
    for (const url of ["postgresql://u:p@postgres.railway.internal:5432/railway", "postgresql://u:p@db.example.com/nasaem_test", "postgresql://u@127.0.0.1:5432/nasaem_platform", "", "not a url"]) {
      assert.throws(() => assertDisposableTarget(url), /Refusing|not a valid/, url);
    }
  });

  test("percentile", () => {
    assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
  });
});
