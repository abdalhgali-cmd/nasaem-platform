// Clears TEST customer requests (owner decision 2026-11-02: every existing
// request on staging and production is test data). Dry run by default.
//
//   node src/scripts/clear-test-requests.js
//       dry run: prints the target database and what would be deleted
//   node src/scripts/clear-test-requests.js --apply --confirm-database=<host>/<db>
//       deletes, in ONE transaction; the confirmation must name the exact
//       target printed by the dry run, so it can never run on another database
//   ... --apply --confirm-database=<host>/<db> --delete-files
//       after the commit, also deletes the uploaded files that only the
//       deleted rows referenced (inside UPLOAD_ROOT only)
//
// Deleted (requests and their own records):
//   ContactRequest (all services: Umrah, Egypt, …) and, by its foreign keys,
//     Traveler, ContactRequestDocument, ContactRequestDeliverable,
//     ContactRequestOffer, Invoice, PaymentReceipt, CaseTask, CaseNote,
//     ProviderSubmission(+Document), OperationalAlert, TravelReminder,
//     CustomerMessageDelivery
//   IntakeDraft (unsent request drafts) and their documents
//   flight_bookings, and legacy Order with OrderItem, OrderStatusHistory,
//     Note, Document, Payment, CouponUsage
//   Notification rows that point at a deleted request or order
// Never deleted: users, roles, sessions, customers, services, visa types,
//   prices, payment accounts, settings, feature flags, site assets, the
//   activity (audit) log, and FINANCIAL EVIDENCE, kept and reported:
//   - a request whose payment was confirmed, or that has an issued payment
//     receipt (PaymentReceipt), with everything it owns;
//   - an order with money received (a PAID/PARTIAL payment) or a refund.
// The dry run lists every target request (no personal data) with a
// test-marker hint, so the owner can confirm they are test records.
// Idempotent: a second run finds nothing left to delete.
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import prisma from "../config/database.js";

const LOCK_KEY = "nasaem:clear-test-requests";

export function databaseLabel(env = process.env) {
  try {
    const url = new URL(String(env.DATABASE_URL || ""));
    return `${url.hostname}/${decodeURIComponent(url.pathname.replace(/^\//, ""))}`;
  } catch {
    return null;
  }
}

const count = async (db, sql) => Number((await db.$queryRawUnsafe(sql))[0].n);

// Which rows a run touches. By default financial evidence is kept:
//   orders with money received (PAID/PARTIAL) or any refund, and requests
//   with a confirmed payment or an issued PaymentReceipt.
// includeFinancial (--include-financial-test-data, owner decision that even
//   paid/receipted records are test data) deletes those too; it needs a
//   second confirmation equal to their count (see main).
// before (--created-before=<ISO time>) limits every deletion to rows created
//   before that moment, so a request made during the run is never touched.
export function cleanupScope({ includeFinancial = false, before = null } = {}) {
  let cutoff = "";
  if (before) {
    const at = new Date(before);
    if (Number.isNaN(at.getTime())) throw new Error("--created-before is not a valid date/time");
    cutoff = at.toISOString(); // normalized: no SQL can pass through
  }
  const createdBefore = (column) => (cutoff ? ` AND ${column} < '${cutoff}'::timestamptz` : "");
  const protectedOrders = `SELECT DISTINCT "orderId" FROM "Payment" WHERE "kind" = 'REFUND' OR "status" IN ('REFUNDED', 'PAID', 'PARTIAL') OR "refundOfPaymentId" IS NOT NULL`;
  const protectedRequests = `SELECT "id" FROM "ContactRequest" WHERE "paymentStatus" = 'CONFIRMED' OR "id" IN (SELECT "contactRequestId" FROM "PaymentReceipt")`;
  const deletableOrders = `SELECT "id" FROM "Order" WHERE TRUE${includeFinancial ? "" : ` AND "id" NOT IN (${protectedOrders})`}${createdBefore('"createdAt"')}`;
  const deletableRequests = `SELECT "id" FROM "ContactRequest" WHERE TRUE${includeFinancial ? "" : ` AND "id" NOT IN (${protectedRequests})`}${createdBefore('"createdAt"')}`;
  return {
    includeFinancial,
    cutoff: cutoff || null,
    protectedOrders,
    protectedRequests,
    deletableOrders,
    deletableRequests,
    owned: (column) => `"${column}" IN (${deletableRequests})`,
    drafts: `SELECT "id" FROM "IntakeDraft" WHERE TRUE${createdBefore('"createdAt"')}`,
    bookings: `SELECT id FROM flight_bookings WHERE (order_id IS NULL${createdBefore("created_at")}) OR order_id IN (${deletableOrders})`,
  };
}

export async function collectCounts(db = prisma, scope = cleanupScope()) {
  const n = (sql) => count(db, sql);
  return {
    contactRequests: await n(`SELECT count(*)::int n FROM "ContactRequest"`),
    contactRequestsToDelete: await n(`SELECT count(*)::int n FROM (${scope.deletableRequests}) d`),
    // Requests with financial evidence (confirmed payment or issued receipt),
    // whether or not this run includes them.
    contactRequestsFinancial: await n(`SELECT count(*)::int n FROM (${scope.protectedRequests}) p`),
    contactRequestsKept: await n(`SELECT count(*)::int n FROM "ContactRequest" WHERE "id" NOT IN (${scope.deletableRequests})`),
    travelers: await n(`SELECT count(*)::int n FROM "Traveler"`),
    contactRequestDocuments: await n(`SELECT count(*)::int n FROM "ContactRequestDocument"`),
    deliverables: await n(`SELECT count(*)::int n FROM "ContactRequestDeliverable"`),
    offers: await n(`SELECT count(*)::int n FROM "ContactRequestOffer"`),
    invoices: await n(`SELECT count(*)::int n FROM "Invoice"`),
    paymentReceipts: await n(`SELECT count(*)::int n FROM "PaymentReceipt"`),
    caseTasks: await n(`SELECT count(*)::int n FROM "CaseTask"`),
    caseNotes: await n(`SELECT count(*)::int n FROM "CaseNote"`),
    providerSubmissions: await n(`SELECT count(*)::int n FROM "ProviderSubmission"`),
    operationalAlerts: await n(`SELECT count(*)::int n FROM "OperationalAlert"`),
    travelReminders: await n(`SELECT count(*)::int n FROM "TravelReminder"`),
    customerMessageDeliveries: await n(`SELECT count(*)::int n FROM "CustomerMessageDelivery"`),
    intakeDrafts: await n(`SELECT count(*)::int n FROM "IntakeDraft"`),
    orders: await n(`SELECT count(*)::int n FROM "Order"`),
    ordersFinancial: await n(`SELECT count(*)::int n FROM (${scope.protectedOrders}) p`),
    ordersToDelete: await n(`SELECT count(*)::int n FROM (${scope.deletableOrders}) d`),
    orderPayments: await n(`SELECT count(*)::int n FROM "Payment"`),
    flightBookings: await n(`SELECT count(*)::int n FROM "flight_bookings"`),
    requestNotifications: await n(`SELECT count(*)::int n FROM "Notification" WHERE "contactRequestId" IS NOT NULL OR "orderId" IS NOT NULL`),
    // Kept, shown for reassurance:
    keptUsers: await n(`SELECT count(*)::int n FROM "User"`),
    keptCustomers: await n(`SELECT count(*)::int n FROM "Customer"`),
    keptServices: await n(`SELECT count(*)::int n FROM "Service"`),
    keptVisaTypes: await n(`SELECT count(*)::int n FROM "VisaType"`),
    keptPaymentAccounts: await n(`SELECT count(*)::int n FROM "PaymentAccount"`),
    keptActivityLog: await n(`SELECT count(*)::int n FROM "ActivityLog"`),
  };
}

// The requests a run would delete, for the owner to confirm they are test
// records: no name, phone or message is printed, only a hint whether the
// row carries a test marker (TEST / E2E / اختبار / تجرب).
export async function targetRequests(db = prisma, scope = cleanupScope()) {
  return db.$queryRawUnsafe(`
    SELECT r."id", to_char(r."createdAt", 'YYYY-MM-DD') AS "created", r."status", r."paymentStatus",
           COALESCE(s."code", v."code", r."service") AS "item",
           (r."name" || ' ' || r."message" || ' ' || COALESCE(r."email", '')) ~* '(test|e2e|اختبار|تجرب)' AS "testMarker",
           (r."id" IN (${scope.protectedRequests})) AS "financial"
    FROM "ContactRequest" r
    LEFT JOIN "Service" s ON s."id" = r."serviceId"
    LEFT JOIN "VisaType" v ON v."id" = r."visaTypeId"
    WHERE r."id" IN (${scope.deletableRequests})
    ORDER BY r."createdAt"`);
}

// Every stored file path a request row points at, before it is deleted.
async function requestFilePaths(db, scope) {
  const rows = await db.$queryRawUnsafe(`
    SELECT "storagePath" p FROM "ContactRequestDocument" WHERE ${scope.owned("contactRequestId")}
    UNION SELECT "storagePath" FROM "ContactRequestDeliverable" WHERE ${scope.owned("contactRequestId")}
    UNION SELECT "storagePath" FROM "PaymentReceipt" WHERE "storagePath" IS NOT NULL AND ${scope.owned("contactRequestId")}
    UNION SELECT "storagePath" FROM "ContactRequestDocument" WHERE "draftId" IN (${scope.drafts})
    UNION SELECT "storagePath" FROM "Document" WHERE "orderId" IN (${scope.deletableOrders})
    UNION SELECT provisional_ticket_path FROM flight_bookings WHERE provisional_ticket_path IS NOT NULL AND id IN (${scope.bookings})
    UNION SELECT payment_receipt_path FROM flight_bookings WHERE payment_receipt_path IS NOT NULL AND id IN (${scope.bookings})
    UNION SELECT final_ticket_path FROM flight_bookings WHERE final_ticket_path IS NOT NULL AND id IN (${scope.bookings})`);
  return rows.map((r) => r.p).filter(Boolean);
}

// Paths still referenced after the cleanup (never deleted from disk).
async function remainingFilePaths(db) {
  const rows = await db.$queryRawUnsafe(`
    SELECT "storagePath" p FROM "ContactRequestDocument"
    UNION SELECT "storagePath" FROM "ContactRequestDeliverable"
    UNION SELECT "storagePath" FROM "PaymentReceipt" WHERE "storagePath" IS NOT NULL
    UNION SELECT "storagePath" FROM "Document"
    UNION SELECT "storagePath" FROM "SiteAsset"
    UNION SELECT provisional_ticket_path FROM flight_bookings WHERE provisional_ticket_path IS NOT NULL
    UNION SELECT payment_receipt_path FROM flight_bookings WHERE payment_receipt_path IS NOT NULL
    UNION SELECT final_ticket_path FROM flight_bookings WHERE final_ticket_path IS NOT NULL`);
  return new Set(rows.map((r) => r.p).filter(Boolean));
}

export async function clearTestRequests(db = prisma, scope = cleanupScope(), { expectedFinancial = null } = {}) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('${LOCK_KEY}'))`);
    if (scope.includeFinancial) {
      // Checked under the lock, inside the transaction: if the paid/receipted
      // set differs from what the owner confirmed, nothing is deleted.
      const inScope = await count(tx, `SELECT count(*)::int n FROM (${scope.deletableRequests}) d WHERE d."id" IN (${scope.protectedRequests})`);
      if (expectedFinancial === null || Number(expectedFinancial) !== inScope) {
        throw new Error(`the paid/receipted requests in scope are ${inScope}, not the confirmed ${expectedFinancial}`);
      }
    }
    const before = await collectCounts(tx, scope);
    const files = await requestFilePaths(tx, scope);
    const deleted = {};
    deleted.requestNotifications = await tx.$executeRawUnsafe(
      `DELETE FROM "Notification" WHERE ${scope.owned("contactRequestId")} OR "orderId" IN (${scope.deletableOrders})`,
    );
    // ContactRequest's own foreign keys cascade to everything the request
    // owns (with includeFinancial, its invoice and payment receipt too).
    deleted.contactRequests = await tx.$executeRawUnsafe(`DELETE FROM "ContactRequest" WHERE "id" IN (${scope.deletableRequests})`);
    deleted.intakeDrafts = await tx.$executeRawUnsafe(`DELETE FROM "IntakeDraft" WHERE "id" IN (${scope.drafts})`);
    deleted.flightBookings = await tx.$executeRawUnsafe(`DELETE FROM flight_bookings WHERE id IN (${scope.bookings})`);
    deleted.orders = await tx.$executeRawUnsafe(`DELETE FROM "Order" WHERE "id" IN (${scope.deletableOrders})`);
    const after = await collectCounts(tx, scope);
    // The audit log is never deleted; this row documents the cleanup itself
    // (counts and options only, no customer data).
    await tx.activityLog.create({
      data: { action: "TEST_REQUESTS_CLEARED", entity: "System", newValue: { includeFinancial: scope.includeFinancial, createdBefore: scope.cutoff, deleted, before, after } },
    });
    return { before, after, deleted, files };
  }, { timeout: 120_000, maxWait: 20_000 });
}

// What --delete-files would do with these paths, without deleting anything.
export async function fileSummary(paths, db = prisma) {
  const { resolveStoredUploadPath } = await import("../config/uploadRoot.js");
  const stillUsed = await remainingFilePaths(db);
  const summary = { referenced: 0, onDisk: 0, bytesOnDisk: 0, missing: 0, outsideUploadRoot: 0 };
  for (const stored of new Set(paths)) {
    summary.referenced += 1;
    let absolute;
    try { absolute = resolveStoredUploadPath(stored); } catch { summary.outsideUploadRoot += 1; continue; }
    try {
      const stat = await fs.stat(absolute);
      summary.onDisk += 1;
      summary.bytesOnDisk += stat.size;
    } catch { summary.missing += 1; }
  }
  return summary;
}

export async function deleteOrphanedFiles(paths, db = prisma) {
  const { resolveStoredUploadPath } = await import("../config/uploadRoot.js");
  const stillUsed = await remainingFilePaths(db);
  const result = { deleted: 0, missing: 0, keptInUse: 0, refused: 0 };
  for (const stored of new Set(paths)) {
    if (stillUsed.has(stored)) { result.keptInUse += 1; continue; }
    let absolute;
    try {
      absolute = resolveStoredUploadPath(stored); // stays inside UPLOAD_ROOT or throws
    } catch {
      result.refused += 1;
      continue;
    }
    try {
      await fs.unlink(absolute);
      result.deleted += 1;
    } catch (error) {
      if (error.code === "ENOENT") result.missing += 1;
      else result.refused += 1;
    }
  }
  return result;
}

const option = (argv, name) => (argv.find((a) => a.startsWith(`${name}=`)) || "").split("=").slice(1).join("=");

async function main(argv) {
  const apply = argv.includes("--apply");
  const deleteFiles = argv.includes("--delete-files");
  const includeFinancial = argv.includes("--include-financial-test-data");
  const confirm = option(argv, "--confirm-database");
  const confirmFinancial = option(argv, "--confirm-financial-count");
  const target = databaseLabel();
  if (!target) {
    console.error("refused: DATABASE_URL is missing or invalid");
    return 1;
  }
  let scope;
  try {
    scope = cleanupScope({ includeFinancial, before: option(argv, "--created-before") || null });
  } catch (error) {
    console.error(`refused: ${error.message}; nothing was changed`);
    return 1;
  }
  if (includeFinancial && !scope.cutoff) {
    console.error("refused: --include-financial-test-data needs --created-before=<ISO time> (the owner's confirmation time), so no request made later is touched; nothing was changed");
    return 1;
  }
  console.log(`target database: ${target}`);
  console.log(`scope: ${includeFinancial ? "ALL requests, including paid/receipted (financial) test records" : "financial evidence kept"}${scope.cutoff ? `, created before ${scope.cutoff}` : ""}`);
  const counts = await collectCounts(prisma, scope);
  const financialInScope = includeFinancial ? (await targetRequests(prisma, scope)).filter((t) => t.financial).length : 0;
  if (!apply) {
    const targets = await targetRequests(prisma, scope);
    console.log(JSON.stringify({ mode: "dry-run", counts }, null, 2));
    console.log(JSON.stringify({ files: await fileSummary(await requestFilePaths(prisma, scope)) }));
    console.log(`requests to delete: ${targets.length} (financial: ${targets.filter((t) => t.financial).length}, without a test marker: ${targets.filter((t) => !t.testMarker).length})`);
    for (const t of targets) console.log(`  ${t.id} ${t.created} ${t.item ?? "-"} ${t.status}/${t.paymentStatus}${t.financial ? " [financial]" : ""}${t.testMarker ? " [test]" : ""}`);
    const extra = includeFinancial ? ` --include-financial-test-data --confirm-financial-count=${financialInScope}` : "";
    console.log(`to delete: --apply --confirm-database=${target}${extra}${scope.cutoff ? ` --created-before=${scope.cutoff}` : ""} [--delete-files]`);
    return 0;
  }
  if (confirm !== target) {
    console.error(`refused: --confirm-database must equal the target exactly (${target}); nothing was changed`);
    return 1;
  }
  if (includeFinancial && confirmFinancial !== String(financialInScope)) {
    console.error(`refused: --confirm-financial-count must equal the ${financialInScope} paid/receipted requests in scope (run the dry run with the same options); nothing was changed`);
    return 1;
  }
  const result = await clearTestRequests(prisma, scope, { expectedFinancial: includeFinancial ? Number(confirmFinancial) : null });
  console.log(JSON.stringify({ mode: "applied", before: result.before, deleted: result.deleted, after: result.after }, null, 2));
  if (deleteFiles) console.log(JSON.stringify({ files: await deleteOrphanedFiles(result.files) }));
  else console.log(`files referenced by the deleted rows: ${result.files.length} (kept; add --delete-files to remove them)`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
    .then((code) => { process.exitCode = code; })
    .catch((error) => { console.error(`failed, nothing was committed: ${error.message}`); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
