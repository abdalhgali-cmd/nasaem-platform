import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { evaluateDrill } from "../src/release/drill-checks.js";

// The restore drill must FAIL (not just print) on each of these conditions.
const counts = { users: "3", customers: "5", requests: "8", invoices: "2", payments: "4", payment_total: "1250.00", request_documents: "9" };
const ok = { before: counts, after: { ...counts }, fixedCatalogItems: 0, fixedRequests: 0, rollbackExit: 2, missingFiles: 0, uploadsChecked: true };

describe("restore drill checks", () => {
  test("a clean drill passes", () => {
    assert.deepEqual(evaluateDrill(ok), { pass: true, failures: [], uploadsChecked: true });
  });
  test("a FIXED service or request fails", () => {
    assert.equal(evaluateDrill({ ...ok, fixedCatalogItems: 1 }).pass, false);
    assert.equal(evaluateDrill({ ...ok, fixedRequests: 2 }).pass, false);
  });
  test("a rollback-check exit code other than the expected one fails", () => {
    for (const code of [0, 1, 3]) assert.equal(evaluateDrill({ ...ok, rollbackExit: code }).pass, false, `exit ${code}`);
    assert.equal(evaluateDrill({ ...ok, rollbackExit: 0, expectedRollbackExit: 0 }).pass, true);
  });
  test("missing upload files fail; an unchecked archive is reported as not checked", () => {
    assert.match(evaluateDrill({ ...ok, missingFiles: 1 }).failures.join(), /missing from the uploads archive/);
    const unchecked = evaluateDrill({ ...ok, uploadsChecked: false, missingFiles: undefined });
    assert.equal(unchecked.pass, false, "a real drill must check the uploads");
    assert.match(unchecked.failures.join(), /no uploads archive/);
    assert.equal(evaluateDrill({ ...ok, uploadsChecked: false, missingFiles: undefined, allowNoUploads: true }).pass, true);
  });
  test("changed or unrecorded counts fail", () => {
    assert.match(evaluateDrill({ ...ok, after: { ...counts, payment_total: "1200.00" } }).failures.join(), /payment_total.*changed/);
    assert.equal(evaluateDrill({ ...ok, after: {} }).pass, false);
  });
});
