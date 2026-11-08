// Read-only upload reconciliation report. It never deletes, moves or edits
// anything: it only lists
//   - ORPHANS: files in the contact-request document / deliverable folders that
//     no database row points to and are older than --min-age-hours (default 24,
//     so an upload that is still being committed is never reported);
//   - MISSING: database rows whose file is not on disk (a restore or a lost
//     file), which staff need to know about.
// Removing an orphan is a separate, manual decision on a verified backup.
//
//   node src/scripts/reconcile-uploads.js [--min-age-hours=24] [--json]
//
// Uses DATABASE_URL and UPLOAD_ROOT of the environment it runs in. File names
// are random upload names; no customer data is printed.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const WATCHED_FOLDERS = ["contact-request-documents", "contact-request-deliverables"];

export function reconcile({ files, referenced, now = Date.now(), minAgeMs = 24 * 3600 * 1000 }) {
  const known = new Set(referenced.map((value) => String(value).replace(/\\/g, "/")));
  const present = new Set(files.map((file) => file.rel));
  const orphans = files.filter((file) => !known.has(file.rel) && now - file.mtimeMs >= minAgeMs).map((file) => ({ path: file.rel, sizeBytes: file.size, ageHours: Math.floor((now - file.mtimeMs) / 3600000) }));
  const missing = [...known].filter((rel) => WATCHED_FOLDERS.some((folder) => rel.startsWith(`${folder}/`)) && !present.has(rel));
  return { orphans, missing, scanned: files.length, referenced: known.size };
}

export function listFiles(root) {
  const files = [];
  for (const folder of WATCHED_FOLDERS) {
    const dir = path.join(root, folder);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const stat = fs.statSync(path.join(dir, entry.name));
      files.push({ rel: `${folder}/${entry.name}`, size: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
  return files;
}

async function main() {
  const { default: prisma } = await import("../config/database.js");
  const { UPLOAD_ROOT } = await import("../config/uploadRoot.js");
  const minAgeHours = Number((process.argv.find((a) => a.startsWith("--min-age-hours=")) || "").split("=")[1]) || 24;
  const asJson = process.argv.includes("--json");
  try {
    const [documents, deliverables] = await Promise.all([
      prisma.contactRequestDocument.findMany({ select: { storagePath: true } }),
      prisma.contactRequestDeliverable.findMany({ select: { storagePath: true } }),
    ]);
    const report = reconcile({ files: listFiles(UPLOAD_ROOT), referenced: [...documents, ...deliverables].map((row) => row.storagePath), minAgeMs: minAgeHours * 3600 * 1000 });
    if (asJson) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`scanned ${report.scanned} files, ${report.referenced} referenced paths (read-only; nothing was changed)`);
      console.log(`ORPHANS older than ${minAgeHours}h: ${report.orphans.length}`);
      for (const orphan of report.orphans) console.log(`  ${orphan.path} (${orphan.sizeBytes} bytes, ${orphan.ageHours}h)`);
      console.log(`MISSING files for database rows: ${report.missing.length}`);
      for (const rel of report.missing) console.log(`  ${rel}`);
    }
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
