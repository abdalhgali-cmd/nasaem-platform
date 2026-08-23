import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";

// Runs against whatever database CI/local `npm test` already migrated
// (prisma migrate deploy) before the test suite starts — see README's
// Testing section. This is a guard against a future migration silently
// dropping tables Prisma doesn't know about, not a migration runner itself.
//
// flight_bookings/flight_inventory/flight_bank_accounts are managed by
// hand-written SQL and have no Prisma model, so `prisma migrate dev`
// naturally proposes DROP TABLE for them on every schema change (Prisma's
// diff treats "no model" as "shouldn't exist") — see the note atop
// prisma/migrations/20260823132043_add_payment_review_status/migration.sql
// for a real instance of this that was caught and hand-fixed before commit.
describe("migration integrity", () => {
  test("the flight booking tables survive the full migration chain", async () => {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('flight_bookings', 'flight_inventory', 'flight_bank_accounts')`,
    );
    const found = new Set(rows.map((row) => row.table_name));
    for (const table of ["flight_bookings", "flight_inventory", "flight_bank_accounts"]) {
      assert.ok(found.has(table), `${table} is missing — a migration likely dropped it`);
    }
  });

  test("Payment carries the review-workflow columns added in 20260823132043", async () => {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Payment'`,
    );
    const found = new Set(rows.map((row) => row.column_name));
    for (const column of ["reviewStatus", "rejectionReason", "reviewedByUserId", "reviewedAt"]) {
      assert.ok(found.has(column), `Payment.${column} is missing`);
    }
  });

  test("no migration file contains a destructive statement against a flight_* table", async () => {
    const { readdir, readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const migrationsDir = path.default.resolve("prisma/migrations");
    const entries = await readdir(migrationsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const sqlPath = path.default.join(migrationsDir, entry.name, "migration.sql");
      const sql = await readFile(sqlPath, "utf8").catch(() => "");
      // Strip SQL comments (-- ...) before scanning so an explanatory
      // comment mentioning "DROP TABLE flight_bookings" (like the one in
      // 20260823132043's migration.sql, describing what was removed by
      // hand) doesn't trip this check — only real, executable statements
      // should fail it.
      const withoutComments = sql
        .split("\n")
        .map((line) => line.replace(/--.*$/, ""))
        .join("\n");
      const destructive = /(DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE)\s+[^;]*flight_(bookings|inventory|bank_accounts)/i;
      assert.equal(destructive.test(withoutComments), false, `${entry.name}/migration.sql contains a destructive statement against a flight_* table`);
    }
  });
});
