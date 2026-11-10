import "./env.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import prisma from "../src/config/database.js";
import { uniqueSuffix } from "./helpers/api.js";

test("passport backfill is repeatable, preserves old requirement IDs, prices and submitted snapshots", async () => {
  const db = new URL(process.env.DATABASE_URL);
  assert.equal(process.env.NODE_ENV, "test");
  assert.ok(["127.0.0.1", "localhost"].includes(db.hostname), "migration probe is local/container-only");
  assert.ok(["nasaem_platform_test", "nasaem_umrah_required"].includes(db.pathname.slice(1)), "use an isolated migration test database");
  const created = [];
  for (const kind of ["missing", "disabled"]) created.push(await prisma.service.create({ data: {
    code: `TEST-BACKFILL-${kind}-${uniqueSuffix()}`, name: "TEST ترحيل جواز", category: "UMRAH_PACKAGE", basePrice: 123, currency: "SAR",
  } }));
  const old = await prisma.visaRequirement.create({ data: { serviceId: created[1].id, name: "صورة الجواز", scope: "CASE", required: false, active: false } });
  const number = await prisma.visaRequirement.create({ data: { serviceId: created[0].id, name: "رقم الجواز", type: "TEXT", required: false } });
  const sponsor = await prisma.visaRequirement.create({ data: { serviceId: created[0].id, name: "جواز الضامن", scope: "CASE", required: false } });
  const snapshot = [{ id: old.id, name: old.name, scope: "CASE", required: false }];
  const submitted = await prisma.contactRequest.create({ data: { name: "TEST طلب سابق", phone: "0912345678", message: "TEST سابق", serviceId: created[1].id, requirementsSnapshot: snapshot } });
  const sql = fileURLToPath(new URL("../prisma/migrations/20261110180000_umrah_required_passport/migration.sql", import.meta.url));
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = spawnSync(process.env.PSQL_PATH || "psql", ["-w", "-v", "ON_ERROR_STOP=1", "-f", sql], { encoding: "utf8", env: { ...process.env,
      PGHOST: db.hostname, PGPORT: db.port || "5432", PGDATABASE: db.pathname.slice(1), PGUSER: decodeURIComponent(db.username), PGPASSWORD: decodeURIComponent(db.password) } });
    assert.equal(result.status, 0, result.stderr || String(result.error || "psql failed"));
  }
  for (const service of created) {
    const rows = await prisma.visaRequirement.findMany({ where: { serviceId: service.id, attachmentType: "umrah_passport" } });
    assert.equal(rows.length, 1); assert.equal(rows[0].required, true); assert.equal(rows[0].active, true); assert.equal(rows[0].scope, "TRAVELER");
    assert.equal(Number((await prisma.service.findUnique({ where: { id: service.id } })).basePrice), 123);
  }
  assert.equal((await prisma.visaRequirement.findUnique({ where: { id: old.id } })).attachmentType, "umrah_passport");
  assert.equal((await prisma.visaRequirement.findUnique({ where: { id: number.id } })).type, "TEXT");
  assert.equal((await prisma.visaRequirement.findUnique({ where: { id: sponsor.id } })).scope, "CASE");
  assert.equal((await prisma.visaRequirement.findUnique({ where: { id: sponsor.id } })).required, false);
  assert.deepEqual((await prisma.contactRequest.findUnique({ where: { id: submitted.id } })).requirementsSnapshot, snapshot);
});
