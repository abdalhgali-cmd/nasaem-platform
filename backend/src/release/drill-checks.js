// Pass/fail decision for scripts/release-restore-drill.sh. Pure: the script
// collects the numbers from the restored database and passes them here as
// JSON; any failure makes the drill exit non-zero.

export const DRILL_COUNT_KEYS = ["users", "customers", "requests", "invoices", "payments", "payment_total", "request_documents"];

export function evaluateDrill({ before, after, fixedCatalogItems, fixedRequests, rollbackExit, expectedRollbackExit = 2, missingFiles, uploadsChecked, allowNoUploads = false }) {
  const failures = [];
  for (const key of DRILL_COUNT_KEYS) {
    if (before?.[key] === undefined || after?.[key] === undefined) {
      failures.push(`count "${key}" was not recorded before and after migrating`);
    } else if (String(before[key]) !== String(after[key])) {
      failures.push(`count "${key}" changed during migration: ${before[key]} -> ${after[key]}`);
    }
  }
  // Before this release nothing can be FIXED: the column defaults to QUOTE.
  if (!(Number(fixedCatalogItems) === 0)) failures.push(`${fixedCatalogItems} service/visa type(s) are FIXED after migrating; expected 0`);
  if (!(Number(fixedRequests) === 0)) failures.push(`${fixedRequests} request(s) are FIXED after migrating; expected 0`);
  if (Number(rollbackExit) !== Number(expectedRollbackExit)) {
    failures.push(`release:rollback-check exited ${rollbackExit}; expected ${expectedRollbackExit}`);
  }
  if (uploadsChecked) {
    if (!(Number(missingFiles) === 0)) failures.push(`${missingFiles} request file(s) referenced in the database are missing from the uploads archive`);
  } else if (!allowNoUploads) {
    // A real drill restores the documents too; skipping them is only for CI.
    failures.push("no uploads archive was checked (pass one, or set DRILL_ALLOW_NO_UPLOADS=1 outside a real drill)");
  }
  return { pass: failures.length === 0, failures, uploadsChecked: Boolean(uploadsChecked) };
}

// CLI: node src/release/drill-checks.js '<json>'  -> prints the result, exit 1 on failure.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const result = evaluateDrill(JSON.parse(process.argv[2] || "{}"));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.pass ? 0 : 1);
}
