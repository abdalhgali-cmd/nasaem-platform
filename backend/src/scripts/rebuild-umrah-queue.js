// Rebuilds the Umrah queue ordering cache (table UmrahQueueEntry) from the
// requests themselves. Derived data only: no request, customer, document or
// financial row is written. DRY RUN by default: it compares and reports; add
// --apply to write the missing/different entries.
//
//   node src/scripts/rebuild-umrah-queue.js [--org=<organizationId>] [--batch=200] [--apply]
//
// Run it against a live database only when its owner has approved that action;
// the table can be dropped at any time without losing anything.
import { pathToFileURL } from "node:url";

async function main() {
  const { rebuildUmrahQueueEntries } = await import("../modules/contact-requests/contact-requests.service.js");
  const { default: prisma } = await import("../config/database.js");
  const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || "").split("=")[1];
  const apply = process.argv.includes("--apply");
  try {
    const report = await rebuildUmrahQueueEntries({ organizationId: arg("org") || undefined, dryRun: !apply, batchSize: Number(arg("batch")) || 200 });
    console.log(JSON.stringify(report));
    if (!apply && report.missing + report.mismatched > 0) console.log("dry run: nothing was written. Re-run with --apply to write the entries above.");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
