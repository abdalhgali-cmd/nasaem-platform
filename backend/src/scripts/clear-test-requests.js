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
//   activity (audit) log, and any order whose payments include a refund
//   (refund evidence): such orders are kept and reported.
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

// Orders kept as refund evidence: any order with a REFUND payment or a
// payment that was refunded.
const PROTECTED_ORDERS = `SELECT DISTINCT "orderId" FROM "Payment" WHERE "kind" = 'REFUND' OR "status" = 'REFUNDED' OR "refundOfPaymentId" IS NOT NULL`;
const DELETABLE_ORDERS = `SELECT "id" FROM "Order" WHERE "id" NOT IN (${PROTECTED_ORDERS})`;

export async function collectCounts(db = prisma) {
  const n = (sql) => count(db, sql);
  return {
    contactRequests: await n(`SELECT count(*)::int n FROM "ContactRequest"`),
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
    ordersProtectedRefundEvidence: await n(`SELECT count(*)::int n FROM (${PROTECTED_ORDERS}) p`),
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

// Every stored file path a request row points at, before it is deleted.
async function requestFilePaths(db) {
  const rows = await db.$queryRawUnsafe(`
    SELECT "storagePath" p FROM "ContactRequestDocument"
    UNION SELECT "storagePath" FROM "ContactRequestDeliverable"
    UNION SELECT "storagePath" FROM "PaymentReceipt" WHERE "storagePath" IS NOT NULL
    UNION SELECT "storagePath" FROM "Document" WHERE "orderId" IN (${DELETABLE_ORDERS})
    UNION SELECT provisional_ticket_path FROM flight_bookings WHERE provisional_ticket_path IS NOT NULL AND (order_id IS NULL OR order_id IN (${DELETABLE_ORDERS}))
    UNION SELECT payment_receipt_path FROM flight_bookings WHERE payment_receipt_path IS NOT NULL AND (order_id IS NULL OR order_id IN (${DELETABLE_ORDERS}))
    UNION SELECT final_ticket_path FROM flight_bookings WHERE final_ticket_path IS NOT NULL AND (order_id IS NULL OR order_id IN (${DELETABLE_ORDERS}))`);
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

export async function clearTestRequests(db = prisma) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('${LOCK_KEY}'))`);
    const before = await collectCounts(tx);
    const files = await requestFilePaths(tx);
    const deleted = {};
    deleted.requestNotifications = await tx.$executeRawUnsafe(
      `DELETE FROM "Notification" WHERE "contactRequestId" IS NOT NULL OR "orderId" IN (${DELETABLE_ORDERS})`,
    );
    // ContactRequest's own foreign keys cascade to everything the request owns.
    deleted.contactRequests = await tx.$executeRawUnsafe(`DELETE FROM "ContactRequest"`);
    deleted.intakeDrafts = await tx.$executeRawUnsafe(`DELETE FROM "IntakeDraft"`);
    deleted.flightBookings = await tx.$executeRawUnsafe(
      `DELETE FROM flight_bookings WHERE order_id IS NULL OR order_id IN (${DELETABLE_ORDERS})`,
    );
    deleted.orders = await tx.$executeRawUnsafe(`DELETE FROM "Order" WHERE "id" IN (${DELETABLE_ORDERS})`);
    const after = await collectCounts(tx);
    await tx.activityLog.create({
      data: { action: "TEST_REQUESTS_CLEARED", entity: "System", newValue: { deleted, before, after } },
    });
    return { before, after, deleted, files };
  }, { timeout: 120_000, maxWait: 20_000 });
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

async function main(argv) {
  const apply = argv.includes("--apply");
  const deleteFiles = argv.includes("--delete-files");
  const confirm = (argv.find((a) => a.startsWith("--confirm-database=")) || "").split("=").slice(1).join("=");
  const target = databaseLabel();
  if (!target) {
    console.error("refused: DATABASE_URL is missing or invalid");
    return 1;
  }
  console.log(`target database: ${target}`);
  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", counts: await collectCounts() }, null, 2));
    console.log(`to delete: --apply --confirm-database=${target} [--delete-files]`);
    return 0;
  }
  if (confirm !== target) {
    console.error(`refused: --confirm-database must equal the target exactly (${target}); nothing was changed`);
    return 1;
  }
  const result = await clearTestRequests();
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
