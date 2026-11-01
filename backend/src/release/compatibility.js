// Release compatibility: which backend builds may run against a database.
//
// Additive migrations keep old code *starting*, but not necessarily
// *correct*. Example: the pre-remediation backend (4bb8a73) sums every PAID
// Payment row, so a REFUND row (kind REFUND, status PAID) is counted as money
// received: 400 paid and 100 refunded reads as 500 instead of 300. It also
// ignores RevokedStaffToken and User.sessionVersion, so signed-out and
// password-changed sessions work again.
//
// Two guards follow from that:
// - At boot, this build refuses to start when the database has migrations
//   it does not know (a later build wrote data this code may misread).
// - Before any rollback, `npm run release:rollback-check` compares a target
//   revision's migrations and declared capabilities (release-compatibility.json)
//   with what the database contains, read-only.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const MIGRATIONS_DIR = path.join(backendRoot, "prisma", "migrations");
export const CAPABILITIES_FILE = path.join(backendRoot, "release-compatibility.json");

export const STAFF_SESSION_MIGRATION = "20261010120000_staff_session_revocation";
export const PAYMENT_REFUNDS_MIGRATION = "20261010130000_payment_refunds_idempotency";
export const EXPLICIT_PRICING_MIGRATION = "20261014100000_explicit_pricing_mode";
export const EGYPT_APPROVAL_MIGRATION = "20261019090000_egypt_approval_workflow";

// Once a migration has been applied, any build serving that database must
// declare these capabilities. The guard capability is required too, so a
// rollback target will itself refuse a later database.
const REQUIRED_CAPABILITIES = {
  [STAFF_SESSION_MIGRATION]: ["migration-compatibility-guard-v1", "staff-session-revocation-v1", "admin-security-remediation-v1"],
  [PAYMENT_REFUNDS_MIGRATION]: ["migration-compatibility-guard-v1", "payment-refund-settlement-v1"],
  // A build without it would let staff re-quote a fixed price the customer
  // already accepted, and open payment before the document review.
  [EXPLICIT_PRICING_MIGRATION]: ["migration-compatibility-guard-v1", "fixed-pricing-v1"],
  // A build without it would count a circular or a ticket as the Egypt
  // approval, and ignore the canonical travel date and the paid receipts.
  [EGYPT_APPROVAL_MIGRATION]: ["migration-compatibility-guard-v1", "egypt-approval-workflow-v1"],
};

export function readLocalMigrations(dir = MIGRATIONS_DIR) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function parseCapabilities(json) {
  if (!json) return [];
  const parsed = typeof json === "string" ? JSON.parse(json) : json;
  return Array.isArray(parsed.capabilities) ? parsed.capabilities : [];
}

export function readLocalCapabilities(file = CAPABILITIES_FILE) {
  return parseCapabilities(readFileSync(file, "utf8"));
}

async function tableHasColumn(db, table, column) {
  const rows = await db.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    table,
    column
  );
  return rows.length > 0;
}

// Read-only snapshot of what the database contains. Counts only; no ids,
// names or amounts.
export async function readDatabaseState(db) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const hasMigrationTable = await tableHasColumn(tx, "_prisma_migrations", "migration_name");
    const applied = hasMigrationTable
      ? (await tx.$queryRawUnsafe(
          `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`
        )).map((row) => row.migration_name)
      : [];
    const count = async (sql) => Number((await tx.$queryRawUnsafe(sql))[0].n);
    const refundCount = (await tableHasColumn(tx, "Payment", "kind"))
      ? await count(`SELECT count(*) AS n FROM "Payment" WHERE kind = 'REFUND'`)
      : 0;
    const activeRevokedTokens = (await tableHasColumn(tx, "RevokedStaffToken", "tokenId"))
      ? await count(`SELECT count(*) AS n FROM "RevokedStaffToken" WHERE "expiresAt" > now()`)
      : 0;
    const usersWithSessionVersion = (await tableHasColumn(tx, "User", "sessionVersion"))
      ? await count(`SELECT count(*) AS n FROM "User" WHERE "sessionVersion" > 0`)
      : 0;
    const fixedPriceRequests = (await tableHasColumn(tx, "ContactRequest", "pricingMode"))
      ? await count(`SELECT count(*) AS n FROM "ContactRequest" WHERE "pricingMode" = 'FIXED'`)
      : 0;
    return { hasMigrationTable, appliedMigrations: applied, refundCount, activeRevokedTokens, usersWithSessionVersion, fixedPriceRequests };
  });
}

export function findUnknownMigrations(appliedMigrations, knownMigrations) {
  const known = new Set(knownMigrations);
  return appliedMigrations.filter((name) => !known.has(name));
}

// Decides whether a target build may serve a database in `state`.
// Returns { safe, reasons } where each reason is a short English sentence
// (the CLI prints them; the release document explains each).
export function evaluateRollbackTarget({ state, targetMigrations, targetCapabilities }) {
  const reasons = [];
  const capabilities = new Set(targetCapabilities);

  const unknown = findUnknownMigrations(state.appliedMigrations, targetMigrations);
  if (unknown.length) {
    reasons.push(`Target does not know ${unknown.length} applied migration(s): ${unknown.join(", ")}.`);
  }

  const required = new Set();
  for (const migration of state.appliedMigrations) {
    for (const capability of REQUIRED_CAPABILITIES[migration] || []) required.add(capability);
  }
  const missing = [...required].filter((capability) => !capabilities.has(capability)).sort();
  if (missing.length) reasons.push(`Target lacks required capabilities: ${missing.join(", ")}.`);

  if (state.refundCount > 0 && !capabilities.has("payment-refund-settlement-v1")) {
    reasons.push(`${state.refundCount} refund row(s) exist; this target would count them as money received.`);
  }
  if ((state.activeRevokedTokens > 0 || state.usersWithSessionVersion > 0) && !capabilities.has("staff-session-revocation-v1")) {
    reasons.push(
      `${state.activeRevokedTokens} revoked staff token(s) and ${state.usersWithSessionVersion} account(s) with ended sessions would be accepted again by this target.`
    );
  }

  if (state.fixedPriceRequests > 0 && !capabilities.has("fixed-pricing-v1")) {
    reasons.push(`${state.fixedPriceRequests} fixed-price request(s) exist; this target would let staff re-quote an accepted price and open payment before the document review.`);
  }

  return { safe: reasons.length === 0, reasons };
}

export class IncompatibleDatabaseError extends Error {
  constructor(unknown) {
    super(
      `Database has ${unknown.length} migration(s) this build does not know: ${unknown.join(", ")}. ` +
        "A later build wrote this schema; running older code against it can misread financial or session data. " +
        "Roll forward instead (see docs/admin-remediation-release.md)."
    );
    this.code = "INCOMPATIBLE_DATABASE";
    this.unknownMigrations = unknown;
  }
}

// Boot guard. DB_COMPAT_ACKNOWLEDGED_MIGRATIONS (comma-separated names) lets
// an operator accept a specific later migration after reviewing it; there is
// no blanket switch.
export async function assertDatabaseCompatible(db, {
  knownMigrations = readLocalMigrations(),
  acknowledged = (process.env.DB_COMPAT_ACKNOWLEDGED_MIGRATIONS || "").split(",").map((s) => s.trim()).filter(Boolean),
} = {}) {
  const { hasMigrationTable, appliedMigrations } = await readDatabaseState(db);
  // No migration history means the schema was never deployed by Prisma (or
  // the wrong database is configured): that proves nothing, so fail.
  if (!hasMigrationTable) {
    const error = new Error("Database has no _prisma_migrations table; cannot verify its schema.");
    error.code = "MIGRATION_HISTORY_MISSING";
    throw error;
  }
  const unknown = findUnknownMigrations(appliedMigrations, [...knownMigrations, ...acknowledged]);
  if (unknown.length) throw new IncompatibleDatabaseError(unknown);
  return { appliedMigrations };
}
